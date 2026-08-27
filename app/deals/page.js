"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getProducts } from "@/lib/data";
import { lowest } from "@/lib/catalog";
import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";

// A "drop" here means: the lowest current in-stock offer has a `prev`
// (previous price) recorded higher than its current price — i.e. a real
// price decrease the ingestion pipeline observed, not a random number.
function priceDrop(product) {
  const low = lowest(product);
  if (!low || !low.prev || low.prev <= low.price) return null;
  const delta = low.prev - low.price;
  return { from: low.prev, to: low.price, delta, pct: Math.round((delta / low.prev) * 100) };
}

function DealRow({ product, drop }) {
  const low = lowest(product);
  if (!low) return null;
  return (
    <Link href={`/products/${product.id}`} className="card hoverable p-3.5 flex items-center gap-3.5 flex-wrap">
      <div className="thumb w-[52px] h-[52px] shrink-0"><div className="thumb-icon"><CategoryIcon cat={product.cat} size={26} /></div></div>
      <div className="flex-1 min-w-[160px]">
        <div className="text-[10.5px] font-bold text-ink-soft uppercase tracking-wide">{product.brand}</div>
        <div className="text-[13.5px] font-semibold">{product.name}</div>
      </div>
      {drop && <PriceChip price={drop.from} strike />}
      <PriceChip price={low.price} gold={Boolean(drop)} />
      {drop && <span className="badge badge-drop">-{drop.pct}%</span>}
      <span className="text-[11.5px] text-ink-soft">{low.shopName || low.shop}</span>
    </Link>
  );
}

export default function DealsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts().then((p) => {
      setProducts(p);
      setLoading(false);
    });
  }, []);

  const withDrop = products.map((p) => ({ p, drop: priceDrop(p) })).filter((x) => x.drop);
  const biggestDrops = [...withDrop].sort((a, b) => b.drop.delta - a.drop.delta).slice(0, 4);
  const bestDiscounts = [...withDrop].sort((a, b) => b.drop.pct - a.drop.pct).slice(0, 4);
  const lowestToday = [...products]
    .filter((p) => lowest(p))
    .sort((a, b) => lowest(a).price - lowest(b).price)
    .slice(0, 4);

  const Section = ({ title, items, render }) =>
    items.length > 0 && (
      <div className="mb-9">
        <div className="sec-head" style={{ paddingTop: 0 }}><h2>{title}</h2></div>
        <div className="flex flex-col gap-2.5">{items.map(render)}</div>
      </div>
    );

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">Deals</h1>
      <p className="text-ink-soft text-[13.5px] mb-7">
        Every deal below reflects retailer price data TechCompare has recorded — not editorial picks.
      </p>

      {loading ? (
        <div className="text-ink-soft text-sm">Loading…</div>
      ) : withDrop.length === 0 && lowestToday.length === 0 ? (
        <div className="text-ink-soft text-sm">
          No recorded price drops yet — deals appear here automatically once the ingestion pipeline observes a real price decrease.
        </div>
      ) : (
        <>
          <Section title="Biggest price drops" items={biggestDrops} render={(x) => <DealRow key={x.p.id} product={x.p} drop={x.drop} />} />
          <Section title="Best discounts" items={bestDiscounts} render={(x) => <DealRow key={x.p.id} product={x.p} drop={x.drop} />} />
          <Section title="Lowest prices today" items={lowestToday} render={(p) => <DealRow key={p.id} product={p} drop={priceDrop(p)} />} />
        </>
      )}
    </div>
  );
}
