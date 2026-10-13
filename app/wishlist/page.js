"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useCatalog } from "@/lib/CatalogContext";
import { useWishlist } from "@/lib/WishlistContext";
import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";
import { lowest, getProductImage, productPriceText } from "@/lib/catalog";

export default function WishlistPage() {
  const { user, loading } = useAuth();
  const { products: cachedProducts, loading: catalogLoading } = useCatalog();
  const { entries, loading: wishlistLoading, remove } = useWishlist();
  const busy = wishlistLoading;

  // Wishlist entries come from WishlistContext (fetched once per login,
  // shared across every page — see lib/WishlistContext.js). Product
  // details for each entry are resolved from the already-loaded catalog
  // cache below — no per-item getDoc(), and no re-fetch of the wishlist
  // list itself on every visit to this page.
  const items = useMemo(() => {
    if (!entries.length) return [];
    const byId = new Map(cachedProducts.map((p) => [p.id, p]));
    return entries
      .map(({ id: wishId, productId }) => ({ wishId, product: byId.get(productId) || null }))
      .filter((x) => x.product);
  }, [entries, cachedProducts]);

  if (loading || busy || catalogLoading) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;

  if (!user) {
    return (
      <div className="max-w-[1240px] mx-auto px-7 py-16 text-center">
        <h1 className="text-xl mb-2">Log in to see your wishlist</h1>
        <Link href="/login" className="btn btn-primary mt-3">Log in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-6">Your Wishlist</h1>
      {items.length === 0 ? (
        <div className="text-ink-soft text-sm">Nothing saved yet — heart a product from its detail page.</div>
      ) : (
        <div className="space-y-3">
          {items.map(({ wishId, product }) => {
            const low = lowest(product);
            const image = getProductImage(product);
            return (
              <div key={wishId} className="card relative p-3.5 md:p-4 flex items-center gap-4">
                <Link href={`/products/${product.id}`} className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-pcb-tint border border-line-soft shrink-0 overflow-hidden flex items-center justify-center">
                  {image ? (
                    <img
                      src={image}
                      alt={product.name}
                      className="w-full h-full object-contain bg-white p-2"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList.remove("hidden");
                      }}
                    />
                  ) : null}
                  <div className={`${image ? "hidden" : ""} flex items-center justify-center w-full h-full`}>
                    <CategoryIcon cat={product.cat} size={42} />
                  </div>
                </Link>
                <Link href={`/products/${product.id}`} className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">{product.brand || product.cat}</div>
                  <div className="font-semibold text-[15px] md:text-[16px] leading-snug mb-2">{product.name}</div>
                  <div className="text-[12px] text-ink-soft">{product.offers?.length || 0} shop{(product.offers?.length || 0) === 1 ? "" : "s"} tracked</div>
                </Link>
                <div className="shrink-0 pr-8">
                  {low ? <PriceChip price={low.price} size="lg" /> : <span className="badge badge-muted">{productPriceText(product)}</span>}                </div>
                <button onClick={() => remove(wishId)} className="absolute top-3 right-3 text-ink-soft text-xs bg-white/90 rounded-full w-7 h-7 flex items-center justify-center border border-line-soft hover:text-red" aria-label="Remove from wishlist">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
