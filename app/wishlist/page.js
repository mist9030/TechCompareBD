"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getWishlist, removeFromWishlist, getProduct } from "@/lib/data";
import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";
import { lowest, getProductImage } from "@/lib/catalog";

export default function WishlistPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!user) { setBusy(false); return; }
    (async () => {
      const wish = await getWishlist(user.uid);
      const withProducts = await Promise.all(
        wish.map(async (w) => ({ wishId: w.id, product: await getProduct(w.productId) }))
      );
      setItems(withProducts.filter((x) => x.product));
      setBusy(false);
    })();
  }, [user]);

  async function remove(wishId) {
    await removeFromWishlist(wishId);
    setItems((prev) => prev.filter((x) => x.wishId !== wishId));
  }

  if (loading || busy) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;

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
                  {low ? <PriceChip price={low.price} size="lg" /> : <span className="badge badge-outofstock">Out of stock</span>}
                </div>
                <button onClick={() => remove(wishId)} className="absolute top-3 right-3 text-ink-soft text-xs bg-white/90 rounded-full w-7 h-7 flex items-center justify-center border border-line-soft hover:text-red" aria-label="Remove from wishlist">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
