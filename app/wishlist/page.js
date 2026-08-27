"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getWishlist, removeFromWishlist, getProduct } from "@/lib/data";
import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";
import { lowest } from "@/lib/catalog";

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(({ wishId, product }) => {
            const low = lowest(product);
            return (
              <div key={wishId} className="card p-3.5 relative">
                <button onClick={() => remove(wishId)} className="absolute top-2 right-2 text-ink-soft text-xs z-10">✕</button>
                <Link href={`/products/${product.id}`}>
                  <div className="thumb mb-3"><div className="thumb-icon"><CategoryIcon cat={product.cat} size={44} /></div></div>
                  <div className="font-semibold text-[14px] leading-snug mb-2 line-clamp-2">{product.name}</div>
                  {low ? <PriceChip price={low.price} /> : <span className="badge badge-outofstock">Out of stock</span>}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
