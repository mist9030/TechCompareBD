"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useCatalog } from "@/lib/CatalogContext";
import { getUserBuilds } from "@/lib/data";
import { BUILD_SLOTS, CAT_LABEL, fmt, lowest } from "@/lib/catalog";
import { checkCompatibility, compatSummary } from "@/lib/compat";

const STATUS = {
  ok: ["badge badge-ok", "Compatible"],
  warning: ["badge badge-warning", "Warnings"],
  error: ["badge badge-error", "Problems"],
  none: ["badge badge-muted", "Not enough parts"],
};

function CompareBuildsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { products } = useCatalog();
  const [builds, setBuilds] = useState([]);
  const [busy, setBusy] = useState(true);
  const [ids, setIds] = useState((params.get("ids") || "").split(",").filter(Boolean));

  useEffect(() => {
    if (loading) return;
    if (!user) { setBusy(false); return; }
    getUserBuilds(user.uid)
      .then(setBuilds)
      .catch((err) => console.error("Failed to load builds", err))
      .finally(() => setBusy(false));
  }, [user, loading]);

  function toggle(id) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 4 ? ids : [...ids, id];
    setIds(next);
    router.replace(next.length ? `/compare/builds?ids=${next.join(",")}` : "/compare/builds");
  }

  // Resolve every selected build into real products + live totals.
  const selected = ids
    .map((id) => builds.find((b) => b.id === id))
    .filter(Boolean)
    .map((b) => {
      const parts = {};
      BUILD_SLOTS.forEach((cat) => {
        const product = b.components?.[cat] ? products.find((p) => p.id === b.components[cat]) : null;
        if (product) parts[cat] = product;
      });
      const total = BUILD_SLOTS.reduce((sum, cat) => sum + (lowest(parts[cat])?.price || 0), 0);
      const issues = checkCompatibility(parts);
      return { build: b, parts, total, count: Object.keys(parts).length, status: compatSummary(issues) };
    });

  const totals = selected.map((s) => s.total).filter((t) => t > 0);
  const cheapest = totals.length ? Math.min(...totals) : 0;

  if (loading || busy) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;

  if (!user) {
    return (
      <div className="max-w-[1240px] mx-auto px-7 py-16 text-center">
        <h1 className="text-xl mb-2">Log in to compare your builds</h1>
        <Link href="/login" className="btn btn-primary mt-3">Log in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">Compare my builds</h1>
      <p className="text-ink-soft text-[13.5px] mb-6">
        Pick 2-4 saved builds. Prices use today&apos;s lowest shop price. <Link href="/compare" className="text-pcb-dark font-semibold">Compare products instead &rarr;</Link>
      </p>

      {builds.length === 0 ? (
        <div className="text-ink-soft text-sm">No saved builds yet — create one in the <Link href="/builder" className="text-pcb-dark font-semibold">PC Builder</Link>.</div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-8">
          {builds.map((b) => {
            const on = ids.includes(b.id);
            return (
              <label key={b.id} className={`card px-3 py-2 flex items-center gap-2 cursor-pointer text-[13px] ${on ? "border-pcb" : ""}`}>
                <input type="checkbox" className="accent-pcb" checked={on} disabled={!on && ids.length >= 4} onChange={() => toggle(b.id)} />
                {b.name}
              </label>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="p-3 w-36">&nbsp;</th>
                {selected.map((s) => (
                  <th key={s.build.id} className="p-3 align-top text-left">
                    <div className="card p-3">
                      <div className="text-[14px] font-semibold mb-2">{s.build.name}</div>
                      <Link href={`/builder?buildId=${encodeURIComponent(s.build.id)}`} className="text-[12px] text-pcb-dark font-semibold">Open in builder</Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <td className="p-3 text-[12.5px] font-semibold text-ink-soft">Estimated total</td>
                {selected.map((s) => (
                  <td key={s.build.id} className="p-3 text-[14px] font-semibold">
                    {fmt(s.total)}
                    {selected.length > 1 && s.total > 0 && s.total === cheapest && <span className="badge badge-best ml-2">Cheapest</span>}
                    {selected.length > 1 && s.total > cheapest && cheapest > 0 && (
                      <div className="text-[12px] font-normal text-ink-soft">+{fmt(s.total - cheapest)} vs cheapest</div>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-line-soft">
                <td className="p-3 text-[12.5px] font-semibold text-ink-soft">Budget</td>
                {selected.map((s) => {
                  const budget = Number(s.build.budget);
                  return (
                    <td key={s.build.id} className="p-3 text-[13px]">
                      {budget > 0 ? (
                        <>
                          {fmt(budget)}
                          <div className={`text-[12px] ${s.total > budget ? "text-red" : "text-pcb-dark"}`}>
                            {s.total > budget ? `${fmt(s.total - budget)} over` : `${fmt(budget - s.total)} under`}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t border-line-soft">
                <td className="p-3 text-[12.5px] font-semibold text-ink-soft">Components</td>
                {selected.map((s) => <td key={s.build.id} className="p-3 text-[13px]">{s.count} / {BUILD_SLOTS.length}</td>)}
              </tr>
              <tr className="border-t border-line-soft">
                <td className="p-3 text-[12.5px] font-semibold text-ink-soft">Compatibility</td>
                {selected.map((s) => (
                  <td key={s.build.id} className="p-3"><span className={STATUS[s.status][0]}>{STATUS[s.status][1]}</span></td>
                ))}
              </tr>
              {BUILD_SLOTS.map((cat) => {
                const pids = selected.map((s) => s.parts[cat]?.id || "");
                const differs = selected.length > 1 && new Set(pids).size > 1;
                return (
                  <tr key={cat} className="border-t border-line-soft">
                    <td className="p-3 text-[12.5px] font-semibold text-ink-soft">{CAT_LABEL[cat]}</td>
                    {selected.map((s) => {
                      const p = s.parts[cat];
                      const low = lowest(p);
                      return (
                        <td key={s.build.id} className={`p-3 text-[13px] ${differs ? "bg-gold-tint" : ""}`}>
                          {p ? (
                            <>
                              <Link href={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                              {low && <div className="text-[12px] text-ink-soft">{fmt(low.price)}</div>}
                            </>
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selected.length > 1 && <p className="text-[12px] text-ink-soft mt-3">Highlighted rows = parts that differ between the builds.</p>}
        </div>
      )}
    </div>
  );
}

export default function CompareBuildsPage() {
  return (
    <Suspense fallback={<div className="max-w-[1240px] mx-auto px-7 py-8 text-ink-soft text-sm">Loading…</div>}>
      <CompareBuildsInner />
    </Suspense>
  );
}