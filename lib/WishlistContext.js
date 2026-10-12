"use client";

// lib/WishlistContext.js
//
// User-specific data — deliberately kept separate from CatalogContext,
// which only ever holds the shared public catalog (products/shops/
// categories). Wishlist entries still live in Firestore as the source of
// truth (small, per-user, needs to follow the user across devices), but
// this context fetches them ONCE per login and keeps them in React state
// for the whole session — every page (product detail, wishlist page)
// reads the same in-memory list instead of each calling getWishlist()
// on its own mount.
//
// Product details for each entry still resolve through CatalogContext's
// already-cached array, never a per-item getDoc().
//
// Resets on logout / account switch so one user's wishlist can never
// leak into another session on a shared browser.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/AuthContext";
import { getWishlist, addToWishlist, removeFromWishlist } from "@/lib/data";

const WishlistCtx = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]); // [{ id: wishDocId, userId, productId }]
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      // Logged out, or switched accounts — never carry over the previous
      // user's wishlist state.
      setEntries([]);
      return;
    }

    setLoading(true);
    getWishlist(user.uid)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        console.error("Failed to load wishlist:", err);
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isWishlisted = useCallback(
    (productId) => entries.some((e) => e.productId === productId),
    [entries]
  );

  const add = useCallback(
    async (productId) => {
      if (!user) return;
      // Optimistic update so the heart/button state flips instantly.
      const tempId = `pending:${productId}`;
      setEntries((prev) => [...prev, { id: tempId, userId: user.uid, productId }]);
      try {
        const ref = await addToWishlist(user.uid, productId);
        setEntries((prev) =>
          prev.map((e) => (e.id === tempId ? { ...e, id: ref.id } : e))
        );
      } catch (err) {
        // Roll back on failure.
        setEntries((prev) => prev.filter((e) => e.id !== tempId));
        throw err;
      }
    },
    [user]
  );

  const remove = useCallback(async (wishId) => {
    const entry = entries.find((e) => e.id === wishId);
    setEntries((prev) => prev.filter((e) => e.id !== wishId));
    try {
      await removeFromWishlist(wishId);
    } catch (err) {
      // Roll back on failure.
      if (entry) setEntries((prev) => [...prev, entry]);
      throw err;
    }
  }, [entries]);

  const toggle = useCallback(
    (productId) => {
      const existing = entries.find((e) => e.productId === productId);
      return existing ? remove(existing.id) : add(productId);
    },
    [entries, add, remove]
  );

  const value = useMemo(
    () => ({
      entries,
      loading,
      isWishlisted,
      add,
      remove,
      toggle,
    }),
    [entries, loading, isWishlisted, add, remove, toggle]
  );

  return <WishlistCtx.Provider value={value}>{children}</WishlistCtx.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistCtx);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
