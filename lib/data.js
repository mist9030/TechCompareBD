"use client";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
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
      const value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  const value = await getDoc(doc(db, "products", id)).then((snap) =>
    snap.exists() ? { id: snap.id, ...snap.data() } : null
  );
  productCache.set(id, { value, at: Date.now() });
  return value;
}

export async function getProductsByCategory(cat) {
  if (!cat) return [];
  const cached = categoryCache.get(cat);
  if (cached && Date.now() - cached.at < PRODUCT_CACHE_MS) return cached.value;

  const q = query(collection(db, "products"), where("cat", "==", cat));
  const snap = await getDocs(q);
  const value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  categoryCache.set(cat, { value, at: Date.now() });
  value.forEach((p) => productCache.set(p.id, { value: p, at: Date.now() }));
  return value;
}

function invalidateProductCaches(id = null) {
  productListCache.value = null;
  productListCache.at = 0;
  if (id) productCache.delete(id);
  categoryCache.clear();
}

export async function addProduct(data) {
  const ref = await addDoc(collection(db, "products"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  invalidateProductCaches();
  return ref;
}

export async function updateProduct(id, data) {
  const result = await updateDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() });
  invalidateProductCaches(id);
  return result;
}

export async function deleteProduct(id) {
  const result = await deleteDoc(doc(db, "products", id));
  invalidateProductCaches(id);
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addShop(data) {
  return addDoc(collection(db, "shops"), { ...data, createdAt: serverTimestamp() });
}

export async function updateShop(id, data) {
  return updateDoc(doc(db, "shops", id), data);
}

export async function deleteShop(id) {
  return deleteDoc(doc(db, "shops", id));
}

/* ---------------- Categories ---------------- */
export async function getCategories() {
  const snap = await getDocs(collection(db, "categories"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addCategory(data) {
  return addDoc(collection(db, "categories"), data);
}

export async function deleteCategory(id) {
  return deleteDoc(doc(db, "categories", id));
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
