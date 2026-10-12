"use client";
// Raw IndexedDB wrapper for the persistent, client-side public-catalog
// cache (products/shops/categories + a small sync-watermark table).
//
// This module has NO Firestore knowledge — it only knows how to persist
// and retrieve plain JS objects in the browser. lib/cache/catalogSync.js
// is the layer that decides *when* to read from/write to it. Keeping the
// two separate is what stops IndexedDB/localStorage logic from getting
// scattered across components.

const DB_NAME = "techcompare-catalog";
const DB_VERSION = 1;
const STORES = ["products", "shops", "categories", "meta"];

let dbPromise = null;

function isSupported() {
  return typeof indexedDB !== "undefined";
}

function openDB() {
  if (!isSupported()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains("products")) idb.createObjectStore("products", { keyPath: "id" });
      if (!idb.objectStoreNames.contains("shops")) idb.createObjectStore("shops", { keyPath: "id" });
      if (!idb.objectStoreNames.contains("categories")) idb.createObjectStore("categories", { keyPath: "id" });
      if (!idb.objectStoreNames.contains("meta")) idb.createObjectStore("meta", { keyPath: "key" });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another open tab"));
  }).catch((err) => {
    dbPromise = null; // allow a retry on the next call instead of staying broken forever
    throw err;
  });

  return dbPromise;
}

function runTx(storeNames, mode, work) {
  return openDB().then(
    (idb) =>
      new Promise((resolve, reject) => {
        const t = idb.transaction(storeNames, mode);
        const result = work(t);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
      })
  );
}

export async function getAll(store) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const req = idb.transaction([store], "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function putAll(store, items) {
  if (!items?.length) return;
  return runTx([store], "readwrite", (t) => {
    const os = t.objectStore(store);
    items.forEach((item) => os.put(item));
  });
}

export async function clearStore(store) {
  return runTx([store], "readwrite", (t) => t.objectStore(store).clear());
}

// Applies a delta batch (upserts + deletes-by-id) to a store in a single
// transaction, so a partial sync can never leave the store half-updated.
export async function applyDelta(store, { upserts = [], deletes = [] } = {}) {
  if (!upserts.length && !deletes.length) return;
  return runTx([store], "readwrite", (t) => {
    const os = t.objectStore(store);
    upserts.forEach((item) => os.put(item));
    deletes.forEach((id) => os.delete(id));
  });
}

export async function getMeta(key) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(["meta"], "readonly").objectStore("meta").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key, value) {
  return runTx(["meta"], "readwrite", (t) => t.objectStore("meta").put({ key, value }));
}

// Full wipe — used on logout-triggered schema mismatches or a "clear cache"
// debug action. Never called as part of normal sync/delete flows (those go
// through applyDelta so unaffected records are left alone).
export async function wipeAll() {
  return runTx(STORES, "readwrite", (t) => STORES.forEach((s) => t.objectStore(s).clear()));
}

export { isSupported };
