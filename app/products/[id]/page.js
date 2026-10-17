"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getProduct, getPriceHistory } from "@/lib/data";
import { useCatalog } from "@/lib/CatalogContext";
import { useWishlist } from "@/lib/WishlistContext";
import { CAT_LABEL, SPEC_GROUPS, fmt, lowest, BUILD_SLOTS, getProductImage, hasPrice, offerPriceText, productPriceText, offerUrl } from
"@/lib/catalog";
import { genHistory, formatRealHistory, RANGE_DAYS } from "@/lib/history";
import { useAuth } from "@/lib/AuthContext";
import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";
import ProductCard from "@/components/ProductCard";

export default function ProductDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { products: cachedProducts, loading: catalogLoading } = useCatalog();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const [fallbackProduct, setFallbackProduct] = useState(null);
  const [realHistory, setRealHistory] = useState(null); // null = not loaded yet, [] = loaded but empty
  const [range, setRange] = useState("30D");
  const [builderSaved, setBuilderSaved] = useState(false);

  // Cache-first lookup: once the catalog has loaded, a product already in
  // it never touches Firestore at all — this is what makes navigating
  // Products -> Details -> Back instant instead of re-fetching. The
  // getProduct() fallback only fires for a product genuinely missing from
  // the cache (e.g. a very fresh admin add opened via a direct link before
  // this tab's delta sync has caught up), and only after the catalog has
  // finished its own first load.
  const cachedProduct = useMemo(() => cachedProducts.find((p) => p.id === id) || null, [cachedProducts, id]);
  const product = cachedProduct || fallbackProduct;

  useEffect(() => {
    setFallbackProduct(null);
    if (!id || catalogLoading || cachedProduct) return;

    let cancelled = false;
    getProduct(id)
      .then((p) => {
        if (!cancelled) setFallbackProduct(p);
      })
      .catch((err) => console.error("Failed to load product", err));
    return () => { cancelled = true; };
  }, [id, catalogLoading, cachedProduct]);

  // Similar products come straight from the already-loaded cache — no
  // separate Firestore query per product page.
  const similar = useMemo(() => {
    if (!product) return [];
    return cachedProducts.filter((p) => p.cat === product.cat && p.id !== product.id).slice(0, 4);
  }, [cachedProducts, product]);

  // Price history is real per-product time-series data that doesn't belong
  // in the catalog cache — it stays a direct, per-product Firestore read.
  useEffect(() => {
    setRealHistory(null);
    if (!id) return;
    let cancelled = false;
    getPriceHistory(id)
      .then((historyData) => {
        if (!cancelled) setRealHistory(historyData);
      })
      .catch((err) => {
        console.error("Failed to load price history", err);
        if (!cancelled) setRealHistory([]);
      });
    return () => { cancelled = true; };
  }, [id]);

  // Wishlist state now comes from WishlistContext (fetched once per
  // login, shared across every page) instead of a per-mount getWishlist()
  // call here.
  const saved = isWishlisted(id);

  useEffect(() => {
    if (!id) return;
    const key = user?.uid ? `techcompare:pc-builder:${user.uid}` : "techcompare:pc-builder:guest";
    try {
      const current = JSON.parse(window.localStorage.getItem(key) || "{}");
      setBuilderSaved(current?.[product?.cat] === id);
    } catch (err) {
      console.error("Failed to read PC Builder state", err);
    }
  }, [user, id, product?.cat]);

  // Real observations come from the ingestion pipeline
  // (products/{id}/priceHistory). Seeded/demo products don't have any yet,
  // so we fall back to a placeholder trend rather than showing an empty
  // chart — this keeps the existing demo working unchanged (spec section
  // 20: "existing pages must continue to work") while real synced
  // products automatically get a real chart with no code change needed.
  const history = useMemo(() => {
    if (!product) return [];
    if (realHistory && realHistory.length > 1) {
      return formatRealHistory(realHistory).slice(-RANGE_DAYS[range]);
    }
    const low = lowest(product);
if (!low) return []; // no price announced-> don't draw a made-up trend
return genHistory(low.price, RANGE_DAYS[range]);
  }, [product, realHistory, range]);
  const isRealHistory = Boolean(realHistory && realHistory.length > 1);

  if (!product) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;

  const low = lowest(product);
// Priced offers first (cheapest first); "price not announced" offers last.
const offersSorted = [...(product.offers || [])].sort(
(a, b) => (hasPrice(a) ? a.price : Infinity)- (hasPrice(b) ? b.price : Infinity)
);
// Links to this product's original page on each shop's own website.
const sourceLinks = offersSorted
.map((offer) => ({ offer, url: offerUrl(offer) }))
.filter((x) => x.url);
  const groups = SPEC_GROUPS[product.cat] || [];

  async function handleWishlist() {
    if (!user || saved) return;
    await toggleWishlist(product.id);
  }

  function addToCompare() {
let list = [];
try {
list = JSON.parse(window.localStorage.getItem("techcompare:compare-ids") || "[]");
if (!Array.isArray(list)) list = [];
} catch {
list = [];
}
if (!list.includes(product.id)) list = [...list, product.id].slice(-4); // keep newest 4
try {
window.localStorage.setItem("techcompare:compare-ids", JSON.stringify(list));
} catch (err) {
console.error("Failed to save compare list", err);
}
router.push(`/compare?ids=${list.join(",")}`);
}
function handleUseInBuilder() {
    if (!product?.id || !BUILD_SLOTS.includes(product.cat)) return;

    const key = user?.uid ? `techcompare:pc-builder:${user.uid}` : "techcompare:pc-builder:guest";
    try {
      const current = JSON.parse(window.localStorage.getItem(key) || "{}");
      // Exactly one saved product per builder category; a new one replaces the old one.
      current[product.cat] = product.id;
      window.localStorage.setItem(key, JSON.stringify(current));
      setBuilderSaved(true);
    } catch (err) {
      console.error("Failed to save product for PC Builder", err);
    }
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <div className="text-[12.5px] text-ink-soft mb-5">
        <Link href="/">Home</Link> / <Link href={`/products?category=${product.cat}`}>{CAT_LABEL[product.cat]}</Link> / <span className="text-ink">{product.name}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-10">
<div>
<div className="thumb">
          {getProductImage(product) ? (
            <img
              src={getProductImage(product)}
              alt={product.name || "Product"}
              className="!object-contain bg-white p-6"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div className={`${getProductImage(product) ? "hidden" : ""} thumb-icon`}>
            <CategoryIcon cat={product.cat} size={90} />
</div>
</div>
{/* Open the product on the shop's original website */}
{sourceLinks.length > 0 && (
<div className="mt-3 flex flex-col gap-2">
{sourceLinks.map(({ offer, url }, i) => (
<a
key={`${offer.shop}-${i}`}

href={url}
target="_blank"
rel="noopener noreferrer"
className={`btn w-full justify-center ${i === 0 ? "btn-primary" : "btn-ghost"}`}>
{i === 0 ? "Open this product on the original website" : "Also open on"} &middot; {offer.shopName || offer.shop} &rarr;
</a>
))}
</div>
)}
</div>
        <div>
          <div className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-2">{CAT_LABEL[product.cat]} · {product.brand}</div>
          <h1 className="text-2xl mb-1">{product.name}</h1>
          <div className="text-[12.5px] text-ink-soft mb-4">Model: {product.model}</div>
          <div className="flex items-center gap-3 mb-5">
            {low ? <PriceChip price={low.price} size="lg" /> : <span className="badge badge-muted
text-[13px]">{productPriceText(product)}</span>}            {product.discount > 0 && <span className="badge badge-discount">-{product.discount}%</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={addToCompare} className="btn btn-ghost btn-sm">Add to Compare</button>            <button onClick={handleWishlist} disabled={!user || saved} className="btn btn-ghost btn-sm">
              {saved ? "Added to wishlist" : "❤ Add to Wishlist"}
            </button>
            {BUILD_SLOTS.includes(product.cat) && (
              <button onClick={handleUseInBuilder} className="btn btn-primary btn-sm">{builderSaved ? "Saved to PC Builder ✓" : "Use in PC Builder"}</button>
            )}
          </div>
          {!user && <div className="text-[12px] text-ink-soft mt-2">Log in to save to your wishlist.</div>}
        </div>
      </div>

      {/* Offers table */}
      <section className="mb-10">
        <h2 className="text-lg mb-3">Price across shops</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft text-[11.5px] uppercase tracking-wide">
                <th className="p-3">Shop</th><th className="p-3">Price</th><th className="p-3">Availability</th><th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {offersSorted.map((o, i) => (
                <tr key={o.shop} className="border-b border-line-soft last:border-0">
                  <td className="p-3 font-semibold">
{offerUrl(o) ? (
<a href={offerUrl(o)} target="_blank" rel="noopener noreferrer" className="hover:underline">{o.shopName || o.shop}
&rarr;</a>
) : (o.shopName || o.shop)}
</td>
                  <td className="p-3">
{hasPrice(o) ? <PriceChip price={o.price} /> : <span className="text-ink-soft
font-semibold">{offerPriceText(o)}</span>}
{i === 0 && hasPrice(o) && <span className="badge badge-best ml-2">Best</span>}
</td>   
               <td className="p-3">
                    <span className={o.availability === "in_stock" ? "badge badge-stock" : "badge badge-outofstock"}>
                      {o.availability === "in_stock" ? "In stock" : "Out of stock"}
                    </span>
                  </td>
                  <td className="p-3 text-ink-soft">{o.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Price history */}
      <section className="mb-10">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h2 className="text-lg">
            Price history
            {!isRealHistory && (
              <span className="text-[11px] font-normal text-ink-soft ml-2">(estimated trend — no synced history yet)</span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <div className="range-tabs">
              {Object.keys(RANGE_DAYS).map((r) => (
                <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
            <Link href={`/history?id=${product.id}`} className="btn btn-ghost btn-sm">Full history →</Link>
          </div>
        </div>
        <div className="card p-4" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Line type="monotone" dataKey="price" stroke="#0E7C6B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Specs */}
      <section className="mb-10">
        <h2 className="text-lg mb-3">Specifications</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {groups.map(([label, keys]) => (
            <div key={label} className="card p-4">
              <div className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-2">{label}</div>
              {keys.map((k) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-line-soft last:border-0 text-[13.5px]">
                  <span className="text-ink-soft">{k}</span>
                  <span className="font-semibold">{product.specs?.[k] || "—"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Similar */}
      {similar.length > 0 && (
        <section>
          <h2 className="text-lg mb-3">Similar {CAT_LABEL[product.cat].toLowerCase()}s</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {similar.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
