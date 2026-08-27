"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProducts, getShops, saveBuild } from "@/lib/data";
import { BUILD_SLOTS, CAT_LABEL, fmt, lowest } from "@/lib/catalog";
import { checkCompatibility } from "@/lib/compat";
import { downloadBuildPDF } from "@/lib/pdf";
import { useAuth } from "@/lib/AuthContext";
import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";

function BuilderInner() {
  const params = useSearchParams();
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [build, setBuild] = useState({});
  const [pickerSlot, setPickerSlot] = useState(null);
  const [buildName, setBuildName] = useState("My PC Build");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getProducts().then(setProducts);
    getShops().then(setShops);
  }, []);

  useEffect(() => {
    const slot = params.get("slot");
    const pid = params.get("pid");
    if (slot && pid && products.length) {
      const p = products.find((x) => x.id === pid);
      if (p) setBuild((b) => ({ ...b, [slot]: p }));
    }
  }, [params, products]);

  const issues = useMemo(() => checkCompatibility(build), [build]);

  const slots = BUILD_SLOTS.map((cat) => {
    const product = build[cat];
    const low = product ? lowest(product) : null;
    return {
      cat,
      label: CAT_LABEL[cat],
      product,
      lowestPrice: low?.price,
      lowestShop: low ? (shops.find((s) => s.id === low.shop)?.name || low.shop) : null,
    };
  });

  const total = slots.reduce((sum, s) => sum + (s.lowestPrice || 0), 0);
  const filledCount = slots.filter((s) => s.product).length;

  const shopTotals = useMemo(() => {
    return shops
      .map((shop) => {
        let sum = 0, count = 0;
        slots.forEach((s) => {
          if (!s.product) return;
          const offer = s.product.offers?.find((o) => o.shop === shop.id && o.availability === "in_stock");
          if (offer) { sum += offer.price; count++; }
        });
        return { shop, sum, count };
      })
      .filter((x) => x.count === filledCount && filledCount > 0)
      .sort((a, b) => a.sum - b.sum);
  }, [shops, slots, filledCount]);

  const cheapestPlan = useMemo(() => {
    let sum = 0;
    const picks = [];
    slots.forEach((s) => {
      if (!s.product) return;
      const cheapest = [...(s.product.offers || [])].filter((o) => o.availability === "in_stock").sort((a, b) => a.price - b.price)[0];
      if (cheapest) { sum += cheapest.price; picks.push({ slot: s.label, shop: shops.find((x) => x.id === cheapest.shop)?.name || cheapest.shop, price: cheapest.price }); }
    });
    return { sum, picks };
  }, [slots, shops]);

  function pick(cat, product) {
    setBuild((b) => ({ ...b, [cat]: product }));
    setPickerSlot(null);
    setSaved(false);
  }
  function clearSlot(cat) {
    setBuild((b) => { const n = { ...b }; delete n[cat]; return n; });
    setSaved(false);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const components = {};
    Object.entries(build).forEach(([cat, p]) => { components[cat] = p.id; });
    await saveBuild(user.uid, { name: buildName, budget: Number(budget) || null, components, total });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">PC Builder</h1>
      <p className="text-ink-soft text-[13.5px] mb-6">Pick a component for each slot — TechCompare checks compatibility and finds the cheapest source as you go.</p>

      <div className="grid lg:grid-cols-[1fr_340px] gap-8">
        <div>
          <div className="flex gap-3 mb-5 flex-wrap">
            <input value={buildName} onChange={(e) => setBuildName(e.target.value)} className="border border-line rounded-md px-3 py-2 text-sm flex-1 min-w-[180px]" placeholder="Build name" />
            <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" className="border border-line rounded-md px-3 py-2 text-sm w-40" placeholder="Budget (৳)" />
          </div>

          <div className="space-y-2">
            {slots.map((s) => (
              <div key={s.cat} className="card p-3 flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-pcb-tint flex items-center justify-center shrink-0">
                  <CategoryIcon cat={s.cat} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-ink-soft uppercase">{s.label}</div>
                  {s.product ? (
                    <div className="text-[13.5px] font-semibold truncate">{s.product.name}</div>
                  ) : (
                    <div className="text-[13.5px] text-ink-soft">Not selected</div>
                  )}
                </div>
                {s.product && s.lowestPrice != null && <PriceChip price={s.lowestPrice} />}
                <button onClick={() => setPickerSlot(s.cat)} className="btn btn-ghost btn-sm">{s.product ? "Change" : "Select"}</button>
                {s.product && <button onClick={() => clearSlot(s.cat)} className="text-ink-soft text-xs px-1">✕</button>}
              </div>
            ))}
          </div>

          {/* Compatibility */}
          {issues.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[15px] mb-2">Compatibility</h2>
              <div className="space-y-2">
                {issues.map((iss, i) => (
                  <div key={i} className={`badge badge-${iss.level} !inline-flex !normal-case !text-[12.5px] !font-medium py-2 px-3 rounded-md w-full`}>
                    {iss.level === "error" ? "⚠" : iss.level === "warning" ? "!" : "✓"} {iss.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cheapest multi-shop plan */}
          {cheapestPlan.picks.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[15px] mb-2">Cheapest purchase plan (multi-shop)</h2>
              <div className="card p-3 text-[13px]">
                {cheapestPlan.picks.map((p) => (
                  <div key={p.slot} className="flex justify-between py-1.5 border-b border-line-soft last:border-0">
                    <span className="text-ink-soft">{p.slot} — {p.shop}</span>
                    <span className="font-semibold">{fmt(p.price)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-semibold">
                  <span>Total</span><span>{fmt(cheapestPlan.sum)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Best single shop */}
          {shopTotals.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[15px] mb-2">Buy everything from one shop</h2>
              <div className="card overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-line text-left text-ink-soft text-[11px] uppercase"><th className="p-2.5">Shop</th><th className="p-2.5">Total</th></tr></thead>
                  <tbody>
                    {shopTotals.map((st, i) => (
                      <tr key={st.shop.id} className="border-b border-line-soft last:border-0">
                        <td className="p-2.5">{st.shop.name}</td>
                        <td className="p-2.5 font-semibold">{fmt(st.sum)} {i === 0 && <span className="badge badge-best ml-1">Best</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sticky total sidebar */}
        <div>
          <div className="card p-5 sticky top-20">
            <div className="text-[12px] font-semibold text-ink-soft uppercase mb-1">Estimated total</div>
            <div className="text-2xl font-display font-bold mb-1">{fmt(total)}</div>
            {budget && <div className={`text-[12.5px] mb-3 ${total > Number(budget) ? "text-red" : "text-pcb-dark"}`}>{total > Number(budget) ? `৳${(total - budget).toLocaleString()} over budget` : `৳${(budget - total).toLocaleString()} under budget`}</div>}
            <div className="text-[12.5px] text-ink-soft mb-4">{filledCount} / {slots.length} components selected</div>

            {user ? (
              <button onClick={handleSave} disabled={saving || filledCount === 0} className="btn btn-primary btn-block mb-2">
                {saved ? "Saved ✓" : saving ? "Saving…" : "Save Build"}
              </button>
            ) : (
              <div className="text-[12.5px] text-ink-soft mb-2">Log in to save this build.</div>
            )}
            <button
              onClick={() => downloadBuildPDF(buildName, slots, total, budget)}
              disabled={filledCount === 0}
              className="btn btn-ghost btn-block"
            >
              Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* Picker modal */}
      {pickerSlot && (
        <Picker cat={pickerSlot} products={products.filter((p) => p.cat === pickerSlot)} onPick={(p) => pick(pickerSlot, p)} onClose={() => setPickerSlot(null)} />
      )}
    </div>
  );
}

function Picker({ cat, products, onPick, onClose }) {
  const [q, setQ] = useState("");
  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h3 className="text-[15px]">Select {CAT_LABEL[cat]}</h3>
          <button onClick={onClose} className="text-ink-soft">✕</button>
        </div>
        <div className="p-3 border-b border-line">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="border border-line rounded-md px-3 py-2 text-sm w-full" />
        </div>
        <div className="overflow-y-auto">
          {filtered.map((p) => {
            const low = lowest(p);
            return (
              <button key={p.id} onClick={() => onPick(p)} className="w-full flex items-center gap-3 p-3 hover:bg-pcb-tint text-left border-b border-line-soft last:border-0">
                <div className="w-10 h-10 rounded-lg bg-pcb-tint flex items-center justify-center shrink-0"><CategoryIcon cat={cat} size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{p.name}</div>
                  <div className="text-[11.5px] text-ink-soft">{p.brand}</div>
                </div>
                {low && <PriceChip price={low.price} />}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="p-4 text-ink-soft text-sm">No matches.</div>}
        </div>
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<div className="max-w-[1240px] mx-auto px-7 py-8 text-ink-soft text-sm">Loading…</div>}>
      <BuilderInner />
    </Suspense>
  );
}
