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

/* ============================================================
   Products
   ============================================================ */

export async function getProducts() {
  const snap = await getDocs(
    collection(db, "products")
  );

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function getProduct(id) {
  const snap = await getDoc(
    doc(db, "products", id)
  );

  return snap.exists()
    ? {
        id: snap.id,
        ...snap.data(),
      }
    : null;
}

export async function addProduct(data) {
  return addDoc(
    collection(db, "products"),
    {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function updateProduct(id, data) {
  return updateDoc(
    doc(db, "products", id),
    {
      ...data,
      updatedAt: serverTimestamp(),
    }
  );
}

export async function deleteProduct(id) {
  return deleteDoc(
    doc(db, "products", id)
  );
}


/* ============================================================
   Price History
   ============================================================ */

// Real observations live at:
// products/{id}/priceHistory

export async function getPriceHistory(productId) {
  const q = query(
    collection(
      db,
      "products",
      productId,
      "priceHistory"
    ),
    orderBy("observedAt", "asc")
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}


/* ============================================================
   Match Review
   ============================================================ */

export async function getMatchReview() {
  const q = query(
    collection(db, "match_review"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}


/* ============================================================
   Shops
   ============================================================ */

/*
 * IMPORTANT
 *
 * Normal/Admin shops are stored in Firestore.
 *
 * Firestore is the source of truth for:
 *   - UCC
 *   - Star Tech
 *   - Onix
 *   - Creatus
 *   - Global Brand
 *   - Any newly added retailer
 *
 * SQLite/local shops are handled separately by:
 *
 *   /api/admin/local-sync
 *
 * This file must NOT use localStorage for normal shops.
 */


/* ---------------- Get Shops ---------------- */

export async function getShops() {
  const snap = await getDocs(
    collection(db, "shops")
  );

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}


/* ---------------- Add Shop ---------------- */

export async function addShop(data) {
  const shopData = {
    ...data,

    status:
      data.status || "idle",

    lastRun:
      data.lastRun || "Never",

    offers:
      Number.isFinite(
        Number(data.offers)
      )
        ? Number(data.offers)
        : 0,

    createdAt:
      data.createdAt ||
      serverTimestamp(),

    updatedAt:
      serverTimestamp(),
  };

  const ref = await addDoc(
    collection(db, "shops"),
    shopData
  );

  return {
    id: ref.id,
    ...shopData,
  };
}


/* ---------------- Update Shop ---------------- */

export async function updateShop(id, data) {
  await updateDoc(
    doc(db, "shops", id),
    {
      ...data,
      updatedAt:
        serverTimestamp(),
    }
  );

  return {
    id,
    ...data,
  };
}


/* ---------------- Delete Shop ---------------- */

export async function deleteShop(id) {
  await deleteDoc(
    doc(db, "shops", id)
  );

  return {
    id,
    deleted: true,
  };
}


/* ============================================================
   Categories
   ============================================================ */

export async function getCategories() {
  const snap = await getDocs(
    collection(db, "categories")
  );

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function addCategory(data) {
  return addDoc(
    collection(db, "categories"),
    data
  );
}

export async function deleteCategory(id) {
  return deleteDoc(
    doc(db, "categories", id)
  );
}


/* ============================================================
   Scraping Logs
   ============================================================ */

export async function getScrapingLogs() {
  const q = query(
    collection(db, "scraping_logs"),
    orderBy("startedAt", "desc")
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}


/*
 * Compatibility helper.
 *
 * Real scraping is handled by:
 *
 *   POST /api/admin/sync
 *
 * This function only marks the Firestore shop as running.
 *
 * It does NOT perform a fake/demo scrape.
 */

export async function queueScrapeRun(shop) {
  await updateDoc(
    doc(db, "shops", shop.id),
    {
      status: "running",

      syncStartedAt:
        serverTimestamp(),

      lastSyncStatus:
        "running",

      updatedAt:
        serverTimestamp(),
    }
  );

  return {
    ...shop,
    status: "running",
  };
}


/* ============================================================
   Builds
   ============================================================ */

export async function getUserBuilds(uid) {
  const q = query(
    collection(db, "builds"),
    where("userId", "==", uid)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function saveBuild(uid, build) {
  return addDoc(
    collection(db, "builds"),
    {
      userId: uid,
      ...build,
      createdAt:
        serverTimestamp(),
    }
  );
}

export async function updateBuild(id, build) {
  return updateDoc(
    doc(db, "builds", id),
    build
  );
}

export async function deleteBuild(id) {
  return deleteDoc(
    doc(db, "builds", id)
  );
}


/* ============================================================
   Wishlist
   ============================================================ */

export async function getWishlist(uid) {
  const q = query(
    collection(db, "wishlist"),
    where("userId", "==", uid)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function addToWishlist(
  uid,
  productId
) {
  return addDoc(
    collection(db, "wishlist"),
    {
      userId: uid,
      productId,
      createdAt:
        serverTimestamp(),
    }
  );
}

export async function removeFromWishlist(
  wishId
) {
  return deleteDoc(
    doc(db, "wishlist", wishId)
  );
}