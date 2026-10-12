"use client";
// App-wide access point for the cached public catalog (products/shops/
// categories). Mounted ONCE at the root layout. Every page reads from this
// context instead of calling lib/data.js's getProducts()/getShops()/
// getCategories() directly — see lib/cache/catalogSync.js for how the
// underlying IndexedDB cache is actually kept in sync with Firestore.
import { createContext, useContext, useEffect, useState } from "react";
import { ensureCatalogSynced, subscribe, getSnapshot, stopCatalogSync } from "@/lib/cache/catalogSync";

const CatalogCtx = createContext(null);

export function CatalogProvider({ children }) {
  const [state, setState] = useState(getSnapshot());

  useEffect(() => {
    const unsubscribe = subscribe(setState);
    ensureCatalogSynced().catch((err) => console.error("Catalog sync failed to start", err));
    setState({ ...getSnapshot() });

    return () => {
      unsubscribe();
      // Note: intentionally NOT calling stopCatalogSync() here in normal
      // operation — CatalogProvider lives at the root layout for the whole
      // app session, so tearing down the Firestore listener on every
      // Fast-Refresh/remount would be wasteful. stopCatalogSync is exported
      // for tests and for an explicit "log out fully" flow if one is ever
      // needed.
    };
  }, []);

  const value = {
    products: state.products,
    shops: state.shops,
    categories: state.categories,
    // `loading` is true only until the FIRST paintable data exists — either
    // an already-populated cache (near-instant) or, on a brand-new browser,
    // the initial full sync. Background delta syncs after that never flip
    // this back to true, so navigating around never shows a spinner again.
    loading: !state.ready,
    syncError: state.error || null,
  };

  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogCtx);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}

export { stopCatalogSync };
