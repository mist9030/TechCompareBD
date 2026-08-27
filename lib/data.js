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
export async function getProducts() {
  const snap = await getDocs(collection(db, "products"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addProduct(data) {
  return addDoc(collection(db, "products"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProduct(id, data) {
  return updateDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProduct(id) {
  return deleteDoc(doc(db, "products", id));
}

/* ---------------- Price history (written by the ingestion pipeline) ---------------- */
// Real observations live at products/{id}/priceHistory (see
// lib/ingestion/ingest.js). Demo/seeded products won't have this
// subcollection populated yet — callers should fall back to a placeholder
// chart when this returns [].
export async function getPriceHistory(productId) {
  const q = query(collection(db, "products", productId, "priceHistory"), orderBy("observedAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
export async function getWishlist(uid) {
  const q = query(collection(db, "wishlist"), where("userId", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addToWishlist(uid, productId) {
  return addDoc(collection(db, "wishlist"), { userId: uid, productId, createdAt: serverTimestamp() });
}

export async function removeFromWishlist(wishId) {
  return deleteDoc(doc(db, "wishlist", wishId));
}
