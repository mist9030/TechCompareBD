"use client";
import { Suspense, useEffect, useMemo, useState } from "react";import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCatalog } from "@/lib/CatalogContext";
import { CAT_LABEL, fmt, lowest, productPriceText } from "@/lib/catalog";import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";

function CompareInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { products: all } = useCatalog();
  const [ids, setIds] = useState((params.get("ids") || "").split(",").filter(Boolean));
// No ?ids= in the URL-> restore the last compare list; always remember it.
useEffect(() => {
try {
if (!params.get("ids")) {
const saved = JSON.parse(window.localStorage.getItem("techcompare:compare-ids") || "[]");
if (Array.isArray(saved) && saved.length) setIds(saved.slice(0, 4));
}
} catch (err) {
console.error("Failed to restore compare list", err);
}
}, [params]);
useEffect(() => {
try {
window.localStorage.setItem("techcompare:compare-ids", JSON.stringify(ids));
} catch (err) {
console.error("Failed to save compare list", err);
}
}, [ids]);
  const [query, setQuery] = useState("");

  const selected = ids.map((id) => all.find((p) => p.id === id)).filter(Boolean);

  function addId(id) {
    if (ids.includes(id) || ids.length >= 4) return;
    const next = [...ids, id];
    setIds(next);
    router.replace(`/compare?ids=${next.join(",")}`);
  }
  function removeId(id) {
    const next = ids.filter((x) => x !== id);
    setIds(next);
    router.replace(`/compare?ids=${next.join(",")}`);
  }

  const suggestions = useMemo(() => {
    if (!query) return [];
    return all.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && !ids.includes(p.id)).slice(0, 6);
  }, [query, all, ids]);

  const allSpecKeys = useMemo(() => {
    const keys = new Set();
    selected.forEach((p) => Object.keys(p.specs || {}).forEach((k) => keys.add(k)));
    return [...keys];
  }, [selected]);

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">Compare products</h1>
      <p className="text-ink-soft text-[13.5px] mb-6">Pick up to 4 products to compare specifications and price across shops. <Link
href="/compare/builds" className="text-pcb-dark font-semibold">Compare my saved builds &rarr;</Link></p>
      {ids.length < 4 && (
        <div className="relative mb-8 max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a product to add…"
            className="border border-line rounded-md px-3 py-2 text-sm w-full"
          />
          {suggestions.length > 0 && (
            <div className="card absolute z-10 mt-1 w-full max-h-64 overflow-auto">
              {suggestions.map((p) => (
                <button key={p.id} onClick={() => { addId(p.id); setQuery(""); }} className="block w-full text-left px-3 py-2 text-[13px] hover:bg-pcb-tint">
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected.length === 0 ? (
        <div className="text-ink-soft text-sm">No products selected yet. Search above, or open a product page and click &quot;Add to Compare&quot;.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11.5px] text-ink-soft uppercase w-40">&nbsp;</th>
                {selected.map((p) => (
                  <th key={p.id} className="p-3 align-top">
                    <div className="card p-3 relative">
                      <button onClick={() => removeId(p.id)} className="absolute top-1.5 right-1.5 text-ink-soft text-xs">✕</button>
<div className="thumb w-16 h-16 mx-auto mb-2">
  <div className="thumb-icon w-full h-full flex items-center justify-center">
    {p.images?.[0] ? (
      <img
        src={p.images[0]}
        alt={p.name}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    ) : (
      <CategoryIcon cat={p.cat} size={30} />
    )}
  </div>
</div>                      <div className="text-[12.5px] font-semibold leading-snug">{p.name}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <td className="p-3 text-[12.5px] font-semibold text-ink-soft">Best price</td>
                {selected.map((p) => {
                  const low = lowest(p);
                  return <td key={p.id} className="p-3 text-center">{low ? <PriceChip price={low.price} /> : <span className="text-ink-soft text-[12.5px]">{productPriceText(p)}</span>}
</td>;
                })}
              </tr>
              <tr className="border-t border-line-soft">
                <td className="p-3 text-[12.5px] font-semibold text-ink-soft">Brand</td>
                {selected.map((p) => <td key={p.id} className="p-3 text-center text-[13px]">{p.brand}</td>)}
              </tr>
              {allSpecKeys.map((key) => (
                <tr key={key} className="border-t border-line-soft">
                  <td className="p-3 text-[12.5px] font-semibold text-ink-soft">{key}</td>
                  {selected.map((p) => (
                    <td key={p.id} className="p-3 text-center text-[13px]">{p.specs?.[key] || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="max-w-[1240px] mx-auto px-7 py-8 text-ink-soft text-sm">Loading…</div>}>
      <CompareInner />
    </Suspense>
  );
}
