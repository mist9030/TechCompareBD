"use client";
import Link from "next/link";
import { useCatalog } from "@/lib/CatalogContext";
import { CAT_LABEL, lowest } from "@/lib/catalog";
import ProductCard from "@/components/ProductCard";
import CategoryIcon from "@/components/CategoryIcon";

export default function Home() {
  const { products, loading } = useCatalog();

  const deals = [...products].filter((p) => p.discount > 0).sort((a, b) => b.discount - a.discount).slice(0, 4);
  const cats = Object.keys(CAT_LABEL);

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7">
      {/* Hero */}
      <section className="py-14 md:py-20 text-center">
        <div className="badge badge-stock mb-4 inline-flex">Live from 5 Bangladeshi retailers</div>
        <h1 className="text-3xl md:text-5xl mb-4">Compare. Build. <span className="text-pcb-dark">Choose Smart.</span></h1>
        <p className="text-ink-soft max-w-xl mx-auto mb-7 text-[15px]">
          Track real-time prices across Bangladesh&apos;s top IT & gadget shops, compare specs side by side,
          and build a fully compatible PC — then take the list to any store.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/products" className="btn btn-primary">Browse Products</Link>
          <Link href="/builder" className="btn btn-ghost">Start PC Builder</Link>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8">
        <h2 className="text-xl mb-4">Shop by category</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {cats.map((c) => (
            <Link key={c} href={`/products?category=${c}`} className="card hoverable p-4 flex flex-col items-center gap-2 text-center">
              <CategoryIcon cat={c} size={26} />
              <span className="text-[12.5px] font-semibold">{CAT_LABEL[c]}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trending deals */}
      <section className="py-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl">Trending price drops</h2>
          <Link href="/products" className="text-[13px] font-semibold text-pcb-dark">View all →</Link>
        </div>
        {loading ? (
          <div className="text-ink-soft text-sm">Loading…</div>
        ) : deals.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {deals.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="text-ink-soft text-sm">
            No products yet — seed the database (see README) or add products from the admin panel.
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="py-10 grid md:grid-cols-3 gap-4">
        {[
          ["1. Compare", "Search any component or gadget and see live prices side by side across every tracked shop."],
          ["2. Build", "Pick a CPU, motherboard, RAM, GPU and more — TechCompare checks socket, memory and PSU compatibility as you go."],
          ["3. Buy smart", "Download or print your build list with the cheapest shop per component, then walk in and buy."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5">
            <h3 className="text-[15px] mb-2">{t}</h3>
            <p className="text-[13.5px] text-ink-soft">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
