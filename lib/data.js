"use client";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/* ---------------- Products ---------------- */
const productListCache = { value: null, at: 0, promise: null };
const productCache = new Map();
const categoryCache = new Map();
const historyCache = new Map();
const wishlistCache = new Map();
const PRODUCT_CACHE_MS = 60_000;

export async function getProducts() {
  if (productListCache.value && Date.now() - productListCache.at < PRODUCT_CACHE_MS) {
    return productListCache.value;
  }

  // Reuse an in-flight request when several pages/components ask for the
  // catalog at the same time (common during back/forward navigation).
  if (productListCache.promise) return productListCache.promise;

  productListCache.promise = getDocs(collection(db, "products"))
    .then((snap) => {
      // Soft-deleted products (see deleteProduct) never surface to normal
      // callers or the client cache — they only appear via getProductsSince()
      // so the delta sync can prune them out of IndexedDB.
      const value = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
      productListCache.value = value;
      productListCache.at = Date.now();
      value.forEach((product) => productCache.set(product.id, { value: product, at: Date.now() }));
      return value;
    })
    .finally(() => {
      productListCache.promise = null;
    });

  return productListCache.promise;
}

export async function getProduct(id) {
  if (!id) return null;
  const cached = productCache.get(id);
  if (cached && Date.now() - cached.at < PRODUCT_CACHE_MS) return cached.value;

  const value = await getDoc(doc(db, "products", id)).then((snap) => {
    if (!snap.exists()) return null;
    const data = { id: snap.id, ...snap.data() };
    return data.deleted ? null : data;
  });
  productCache.set(id, { value, at: Date.now() });
  return value;
}

export async function getProductsByCategory(cat) {
  if (!cat) return [];
  const cached = categoryCache.get(cat);
  if (cached && Date.now() - cached.at < PRODUCT_CACHE_MS) return cached.value;

  const q = query(collection(db, "products"), where("cat", "==", cat));
  const snap = await getDocs(q);
  const value = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
  categoryCache.set(cat, { value, at: Date.now() });
  value.forEach((p) => productCache.set(p.id, { value: p, at: Date.now() }));
  return value;
}

// Incremental/delta read for the client-side catalog cache
// (lib/cache/catalogSync.js). Unlike getProducts(), this does NOT filter
// out soft-deleted docs — the sync layer needs to see `deleted: true`
// entries so it can prune them out of IndexedDB. `sinceMillis` is compared
// against each doc's `updatedAt`, which every write path in this file (and
// lib/ingestion/ingest.js) sets on create/update/soft-delete.
export async function getProductsSince(sinceMillis) {
  const q = query(
    collection(db, "products"),
    where("updatedAt", ">", Timestamp.fromMillis(sinceMillis || 0)),
    orderBy("updatedAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function invalidateProductCaches(id = null) {
  productListCache.value = null;
  productListCache.at = 0;
  if (id) productCache.delete(id);
  categoryCache.clear();
}

// Bumps meta/catalog.{field} to serverTimestamp(). This is the ONE signal
// the client-side cache watches (via a single onSnapshot listener — see
// lib/cache/catalogSync.js) to know a collection changed, without ever
// having to re-read the full collection just to check. Never throws: a
// failed bump must not block the product/shop/category write that already
// succeeded — worst case, the next sync just runs one version behind until
// this succeeds on retry.
async function bumpCatalogMeta(field) {
  try {
    await setDoc(doc(db, "meta", "catalog"), { [field]: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error(`Failed to bump catalog meta (${field})`, err);
  }
}

// Single-document read of the sync watermark doc. Used by the cache layer
// on first-ever visit (to seed initial watermarks) — normal app loads use
// the onSnapshot listener in catalogSync.js instead of calling this.
export async function getCatalogMeta() {
  const snap = await getDoc(doc(db, "meta", "catalog"));
  return snap.exists() ? snap.data() : null;
}

export async function addProduct(data) {
  const ref = await addDoc(collection(db, "products"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  invalidateProductCaches();
  await bumpCatalogMeta("productsUpdatedAt");
  return ref;
}

export async function updateProduct(id, data) {
  const result = await updateDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() });
  invalidateProductCaches(id);
  await bumpCatalogMeta("productsUpdatedAt");
  return result;
}

export async function deleteProduct(id) {
  // Soft delete instead of deleteDoc(): the client cache learns about
  // removals through the same updatedAt-based delta sync as everything
  // else. A hard delete would just make the doc vanish with nothing for
  // getProductsSince() to report, so already-cached browsers would keep
  // showing it forever.
  const result = await updateDoc(doc(db, "products", id), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
  invalidateProductCaches(id);
  await bumpCatalogMeta("productsUpdatedAt");
  return result;
}

/* ---------------- Price history (written by the ingestion pipeline) ---------------- */
// Real observations live at products/{id}/priceHistory (see
// lib/ingestion/ingest.js). Demo/seeded products won't have this
// subcollection populated yet — callers should fall back to a placeholder
// chart when this returns [].
export async function getPriceHistory(productId) {
  if (!productId) return [];
  const cached = historyCache.get(productId);
  if (cached && Date.now() - cached.at < PRODUCT_CACHE_MS) return cached.value;
  if (cached?.promise) return cached.promise;

  const q = query(collection(db, "products", productId, "priceHistory"), orderBy("observedAt", "asc"));
  const promise = getDocs(q)
    .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    .then((value) => {
      historyCache.set(productId, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      const current = historyCache.get(productId);
      if (current?.promise) historyCache.delete(productId);
    });
  historyCache.set(productId, { promise });
  return promise;
}

/* ---------------- Match Review (ambiguous scraped listings) ---------------- */
export async function getMatchReview() {
  const q = query(collection(db, "match_review"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------- Shops ---------------- */
export async function getShops() {
  const snap = await getDocs(collection(db, "shops"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.deleted);
}

// Delta read for the client cache — see getProductsSince() for why deleted
// docs are intentionally NOT filtered here.
export async function getShopsSince(sinceMillis) {
  const q = query(
    collection(db, "shops"),
    where("updatedAt", ">", Timestamp.fromMillis(sinceMillis || 0)),
    orderBy("updatedAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addShop(data) {
  const ref = await addDoc(collection(db, "shops"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await bumpCatalogMeta("shopsUpdatedAt");
  return ref;
}

export async function updateShop(id, data) {
  const result = await updateDoc(doc(db, "shops", id), { ...data, updatedAt: serverTimestamp() });
  await bumpCatalogMeta("shopsUpdatedAt");
  return result;
}

export async function deleteShop(id) {
  const result = await updateDoc(doc(db, "shops", id), { deleted: true, updatedAt: serverTimestamp() });
  await bumpCatalogMeta("shopsUpdatedAt");
  return result;
}

// Deletes a shop AND cleans up everything that came from it:
// - products sold ONLY by this shop -> deleted (tombstone, see below)
// - products that also have other shops -> just lose this shop's offer
// Tombstone = { deleted: true } so other browsers' IndexedDB caches learn
// about the removal through the normal updatedAt delta sync. Use
// purgeDeletedProducts() afterwards to erase tombstones for good.
export async function deleteShopCascade(shopId) {
  const snap = await getDocs(collection(db, "products"));
  const writes = [];
  let removedProducts = 0;
  let updatedProducts = 0;

  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.deleted) return;
    const offers = Array.isArray(data.offers) ? data.offers : [];
    if (!offers.some((o) => o?.shop === shopId)) return;

    const remaining = offers.filter((o) => o?.shop !== shopId);
    if (remaining.length === 0) {
      writes.push({ ref: d.ref, data: { deleted: true, offers: [], discount: 0 } });
      removedProducts++;
    } else {
      const discount = Math.max(
        0,
        ...remaining.map((o) => (o.prev > o.price && o.price > 0 ? Math.round(((o.prev - o.price) / o.prev) * 100) : 0))
      );
      writes.push({ ref: d.ref, data: { offers: remaining, discount } });
      updatedProducts++;
    }
  });

  // Firestore allows max 500 writes per batch.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach(({ ref, data }) => batch.update(ref, { ...data, updatedAt: serverTimestamp() }));
    await batch.commit();
  }

  await updateDoc(doc(db, "shops", shopId), { deleted: true, updatedAt: serverTimestamp() });
  invalidateProductCaches();
  await bumpCatalogMeta("productsUpdatedAt");
  await bumpCatalogMeta("shopsUpdatedAt");
  return { removedProducts, updatedProducts };
}

// Permanently erases soft-deleted products and their priceHistory docs.
// Run it only after your open browsers had a chance to sync the tombstones
// (a hard-deleted doc is invisible to the delta sync).
export async function wipeProducts({ shopId = null, onProgress } = {}) {
  const snap = await getDocs(collection(db, "products"));
  const toDelete = [];
  const toUpdate = [];

  snap.docs.forEach((d) => {
    const data = d.data();
    if (!shopId || data.deleted) {
      toDelete.push(d.ref);
      return;
    }
    const offers = Array.isArray(data.offers) ? data.offers : [];
    if (!offers.some((o) => o?.shop === shopId)) return;
    const remaining = offers.filter((o) => o?.shop !== shopId);
    if (remaining.length === 0) {
      toDelete.push(d.ref);
    } else {
      const discount = Math.max(
        0,
        ...remaining.map((o) => (o.prev > o.price && o.price > 0 ? Math.round(((o.prev - o.price) / o.prev) * 100) : 0))
      );
      toUpdate.push({ ref: d.ref, offers: remaining, discount });
    }
  });

  // Price-history docs live in a sub-collection and are NOT removed with the
  // product, so collect them first (20 products at a time).
  const refs = [];
  for (let i = 0; i < toDelete.length; i += 20) {
    const chunk = toDelete.slice(i, i + 20);
    const histories = await Promise.all(chunk.map((r) => getDocs(collection(r, "priceHistory"))));
    histories.forEach((h) => h.docs.forEach((x) => refs.push(x.ref)));
    onProgress?.("Collecting price history", Math.min(i + 20, toDelete.length), toDelete.length);
  }
  refs.push(...toDelete);

  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
    onProgress?.("Deleting", Math.min(i + 400, refs.length), refs.length);
  }
  for (let i = 0; i < toUpdate.length; i += 400) {
    const batch = writeBatch(db);
    toUpdate.slice(i, i + 400).forEach(({ ref, offers, discount }) =>
      batch.update(ref, { offers, discount, updatedAt: serverTimestamp() })
    );
    await batch.commit();
  }

  // New epoch: every browser drops its cached catalog and reloads it
  // (a hard-deleted doc is invisible to the normal delta sync).
  invalidateProductCaches();
  await setDoc(
    doc(db, "meta", "catalog"),
    { catalogEpoch: serverTimestamp(), productsUpdatedAt: serverTimestamp() },
    { merge: true }
  );
  return { deleted: toDelete.length, updated: toUpdate.length };
}

export async function purgeDeletedProducts() {
  const snap = await getDocs(query(collection(db, "products"), where("deleted", "==", true)));
  let purged = 0;
  for (const d of snap.docs) {
    const history = await getDocs(collection(db, "products", d.id, "priceHistory"));
    const refs = [...history.docs.map((h) => h.ref), d.ref];
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    purged++;
  }
  invalidateProductCaches();
  return purged;
}

/* ---------------- Categories ---------------- */
export async function getCategories() {
  const snap = await getDocs(collection(db, "categories"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted);
}

// Delta read for the client cache.
export async function getCategoriesSince(sinceMillis) {
  const q = query(
    collection(db, "categories"),
    where("updatedAt", ">", Timestamp.fromMillis(sinceMillis || 0)),
    orderBy("updatedAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addCategory(data) {
  const ref = await addDoc(collection(db, "categories"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await bumpCatalogMeta("categoriesUpdatedAt");
  return ref;
}

export async function deleteCategory(id) {
  const result = await updateDoc(doc(db, "categories", id), { deleted: true, updatedAt: serverTimestamp() });
  await bumpCatalogMeta("categoriesUpdatedAt");
  return result;
}

/* ---------------- Scraping logs ---------------- */
export async function getScrapingLogs() {
  const q = query(collection(db, "scraping_logs"), orderBy("startedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Simulates a scrape run being queued for a shop (writes a log entry).
// A real deployment would trigger a server-side scraper job (e.g. a Cloud
// Function or a separate Node worker) instead of writing this doc directly.
export async function queueScrapeRun(shop) {
  const found = Math.floor(800 + Math.random() * 1600);
  const failed = Math.floor(Math.random() * 40);
  const matched = found - failed;
  await addDoc(collection(db, "scraping_logs"), {
    shopId: shop.id,
    shopName: shop.name,
    status: "completed",
    found,
    matched,
    failed,
    startedAt: serverTimestamp(),
  });
  await updateShop(shop.id, { status: "active", lastRun: "Just now" });
}

/* ---------------- Builds (saved PC builds, per user) ---------------- */
export async function getUserBuilds(uid) {
  const q = query(collection(db, "builds"), where("userId", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveBuild(uid, build) {
  return addDoc(collection(db, "builds"), {
    userId: uid,
    ...build,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getBuild(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, "builds", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateBuild(id, build) {
  return updateDoc(doc(db, "builds", id), {
    ...build,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBuild(id) {
  return deleteDoc(doc(db, "builds", id));
}

/* ---------------- Wishlist ---------------- */
export async function getWishlist(uid, { force = false } = {}) {
  if (!uid) return [];
  const cached = wishlistCache.get(uid);
  if (!force && cached && Date.now() - cached.at < PRODUCT_CACHE_MS) return cached.value;
  if (!force && cached?.promise) return cached.promise;

  const q = query(collection(db, "wishlist"), where("userId", "==", uid));
  const promise = getDocs(q)
    .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    .then((value) => {
      wishlistCache.set(uid, { value, at: Date.now() });
      return value;
    });
  wishlistCache.set(uid, { promise });
  return promise;
}

export async function addToWishlist(uid, productId) {
  const existing = await getWishlist(uid, { force: true });
  const found = existing.find((item) => item.productId === productId);
  if (found) return found;
  const ref = await addDoc(collection(db, "wishlist"), { userId: uid, productId, createdAt: serverTimestamp() });
  const next = [...existing, { id: ref.id, userId: uid, productId }];
  wishlistCache.set(uid, { value: next, at: Date.now() });
  return ref;
}

export async function removeFromWishlist(wishId) {
  await deleteDoc(doc(db, "wishlist", wishId));
  for (const [uid, cached] of wishlistCache.entries()) {
    if (!cached?.value) continue;
    const next = cached.value.filter((item) => item.id !== wishId);
    if (next.length !== cached.value.length) wishlistCache.set(uid, { value: next, at: Date.now() });
  }
}
