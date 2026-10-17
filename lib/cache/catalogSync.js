"use client";
// ============================================================================
// Central synchronization layer between Firestore (public catalog data —
// products/shops/categories) and the persistent IndexedDB cache
// (lib/cache/catalogDB.js). This is the ONLY module that decides when
// Firestore is actually read for catalog data. Every page/component goes
// through lib/CatalogContext.js -> this module -> IndexedDB. No page ever
// calls getProducts()/getShops()/getCategories() from lib/data.js directly.
//
// Sync model
// ----------
// First-ever visit on a browser (IndexedDB empty):
//   ONE full read of products + shops + categories (unavoidable — there is
//   nothing to diff against yet), via lib/data.js's existing getProducts/
//   getShops/getCategories. The very first snapshot of the meta/catalog
//   listener (see below) is reused to seed the delta watermark, so this
//   does not cost a second document read.
//
// Every later app load (returning visitor):
//   IndexedDB is read immediately and the UI can render right away
//   (stale-while-revalidate). In the background, ONE Firestore listener is
//   attached to the single `meta/catalog` document — not the products/
//   shops/categories collections. Its first snapshot is compared against
//   the locally stored watermark for each collection; if a collection's
//   remote timestamp is newer, a delta query
//   (`where("updatedAt", ">", lastLocalSync)`) fetches ONLY the
//   changed/deleted docs for that collection and merges them into
//   IndexedDB. If nothing changed, zero collection reads happen — just the
//   1 read for the meta doc itself.
//
// Already-open tabs:
//   The SAME meta/catalog listener keeps the connection open. Firestore
//   pushes a new snapshot only when an admin write or an ingestion run
//   actually bumps the doc (see lib/data.js:bumpCatalogMeta and
//   lib/ingestion/ingest.js) — no polling, no per-page listeners. When a
//   push arrives, the same delta-query path above runs for whichever
//   collection(s) changed.
//
// This is ONE app-level mechanism (attached once by CatalogProvider at the
// root layout), not one listener/read per page or per navigation.
// ============================================================================

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getProducts, getShops, getCategories, getProductsSince, getShopsSince, getCategoriesSince } from "@/lib/data";
import * as catalogDB from "@/lib/cache/catalogDB";

const SCHEMA_VERSION = 1;

const COLLECTIONS = [
  { store: "products", metaField: "productsUpdatedAt", watermarkKey: "productsWatermark", deltaFetch: getProductsSince },
  { store: "shops", metaField: "shopsUpdatedAt", watermarkKey: "shopsWatermark", deltaFetch: getShopsSince },
  { store: "categories", metaField: "categoriesUpdatedAt", watermarkKey: "categoriesWatermark", deltaFetch: getCategoriesSince },
];

// In-memory mirror of IndexedDB, refreshed whenever a sync applies changes.
// Lets React read synchronously (useSyncExternalStore-style) instead of
// doing an async IndexedDB round trip on every render.
const memory = { products: [], shops: [], categories: [], ready: false, error: null };
const listeners = new Set();

function notify() {
// Hand React a NEW object every time. Passing the same mutated `memory`
// object makes setState bail out, so the UI never re-renders after a sync.
const snapshot = { ...memory };
for (const fn of listeners) fn(snapshot);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  return memory;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  return 0;
}

async function loadMemoryFromIndexedDB() {
  const [products, shops, categories] = await Promise.all([
    catalogDB.getAll("products"),
    catalogDB.getAll("shops"),
    catalogDB.getAll("categories"),
  ]);
  memory.products = products;
  memory.shops = shops;
  memory.categories = categories;
}

// First-ever visit (or a cache schema bump): one full read per collection,
// then seed the delta watermark from the meta snapshot we already have in
// hand (no extra document read needed).
async function fullSync(metaData) {
  const [products, shops, categories] = await Promise.all([getProducts(), getShops(), getCategories()]);

  await Promise.all([
    catalogDB.clearStore("products").then(() => catalogDB.putAll("products", products)),
    catalogDB.clearStore("shops").then(() => catalogDB.putAll("shops", shops)),
    catalogDB.clearStore("categories").then(() => catalogDB.putAll("categories", categories)),
  ]);

  const now = Date.now();
  await Promise.all([
    catalogDB.setMeta("productsWatermark", metaData?.productsUpdatedAt ? toMillis(metaData.productsUpdatedAt) : now),
    catalogDB.setMeta("shopsWatermark", metaData?.shopsUpdatedAt ? toMillis(metaData.shopsUpdatedAt) : now),
    catalogDB.setMeta("categoriesWatermark", metaData?.categoriesUpdatedAt ? toMillis(metaData.categoriesUpdatedAt) : now),
    catalogDB.setMeta("schemaVersion", SCHEMA_VERSION),
    catalogDB.setMeta("epoch", toMillis(metaData?.catalogEpoch)),
  ]);

  memory.products = products;
  memory.shops = shops;
  memory.categories = categories;
}

// Runs the delta query for ONE collection, only if the meta doc's
// timestamp for it is actually newer than what we last synced to.
async function deltaSyncCollection({ store, watermarkKey, deltaFetch }, remoteMillis) {
  const localMillis = (await catalogDB.getMeta(watermarkKey)) || 0;
  if (!remoteMillis || remoteMillis <= localMillis) return false; // nothing changed for this collection

  const changed = await deltaFetch(localMillis);
  if (!changed.length) {
    await catalogDB.setMeta(watermarkKey, remoteMillis);
    return false;
  }

  const upserts = changed.filter((item) => !item.deleted);
  const deletes = changed.filter((item) => item.deleted).map((item) => item.id);

  await catalogDB.applyDelta(store, { upserts, deletes });
  await catalogDB.setMeta(watermarkKey, remoteMillis);
  return true;
}

// Given an already-fetched meta/catalog snapshot, delta-syncs whichever
// collections actually moved. Shared by both the initial catch-up and every
// later live push from the listener.
async function syncFromMeta(metaData) {
  if (!metaData) return false;
  const results = await Promise.all(
    COLLECTIONS.map((c) => deltaSyncCollection(c, toMillis(metaData[c.metaField])))
  );
  const anyChange = results.some(Boolean);
  if (anyChange) await loadMemoryFromIndexedDB();
  return anyChange;
}

// An admin "wipe products" bumps meta/catalog.catalogEpoch. Hard-deleted docs
// cannot be seen by the delta sync, so when the epoch differs from the one
// this browser last synced under, throw the cache away and load everything.
async function epochChanged(metaData) {
  const remote = toMillis(metaData?.catalogEpoch);
  if (!remote) return false;
  return (await catalogDB.getMeta("epoch")) !== remote;
}

async function syncOrReload(metaData) {
  if (await epochChanged(metaData)) {
    await fullSync(metaData);
    return true;
  }
  return syncFromMeta(metaData);
}

let readyPromise = null;
let unsubscribeMeta = null;

// Entry point — called once by CatalogProvider on mount. Safe to call
// multiple times concurrently (e.g. React StrictMode double-invoking
// effects): every caller shares the same in-flight promise, so only one
// sync/listener setup ever runs.
export function ensureCatalogSynced() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    let hasLocalData = false;
    try {
      const [schema, existingProducts] = await Promise.all([
        catalogDB.getMeta("schemaVersion"),
        catalogDB.getAll("products"),
      ]);
      hasLocalData = schema === SCHEMA_VERSION && existingProducts.length > 0;
      if (hasLocalData) await loadMemoryFromIndexedDB();
    } catch (err) {
      console.error("Catalog cache unavailable, falling back to a full sync", err);
      hasLocalData = false;
    }

    // Paint immediately from whatever we already have cached — this is the
    // "returning visitor" fast path with zero Firestore reads so far.
    if (hasLocalData) {
      memory.ready = true;
      notify();
    }

    // Attach ONE app-level listener on the meta/catalog document. Its first
    // snapshot resolves the promise below (functionally equivalent to a
    // single getDoc — one read); every snapshot after that is a live push
    // that fires only when an admin write or ingestion run actually bumps
    // the doc, and drives the same delta-sync path with no polling.
    const firstMeta = await new Promise((resolve) => {
      let first = true;
      unsubscribeMeta = onSnapshot(
        doc(db, "meta", "catalog"),
        (snap) => {
          const data = snap.exists() ? snap.data() : null;
          if (first) {
            first = false;
            resolve(data);
            return;
          }
          // Live update on an already-open tab.
          syncOrReload(data)
            .then((changed) => {
              if (changed) notify();
            })
            .catch((err) => console.error("Catalog live sync failed", err));
        },
        (err) => {
          console.error("Catalog meta listener error", err);
          if (first) {
            first = false;
            resolve(null);
          }
        }
      );
    });

    try {
      if (!hasLocalData || (await epochChanged(firstMeta))) {
        // First-ever visit on this browser (or a schema-version bump).
        await fullSync(firstMeta);
      } else {
        await syncFromMeta(firstMeta);
      }
      memory.error = null;
    } catch (err) {
      // Offline or Firestore temporarily unavailable: never wipe/replace
      // valid cached data just because a sync attempt failed.
      console.error("Catalog sync failed, continuing with cached data", err);
      memory.error = err;
    }

    memory.ready = true;
    notify();
  })();

  return readyPromise;
}

export function stopCatalogSync() {
  if (unsubscribeMeta) {
    unsubscribeMeta();
    unsubscribeMeta = null;
  }
  readyPromise = null;
}
