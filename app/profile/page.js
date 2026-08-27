"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserBuilds, deleteBuild, updateBuild, getProducts } from "@/lib/data";
import { fmt, CAT_LABEL, BUILD_SLOTS, lowest } from "@/lib/catalog";
import { downloadBuildPDF } from "@/lib/pdf";

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const [builds, setBuilds] = useState([]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!user) { setBusy(false); return; }
    Promise.all([getUserBuilds(user.uid), getProducts()]).then(([b, p]) => {
      setBuilds(b);
      setProducts(p);
      setBusy(false);
    }).catch((err) => {
      console.error("Failed to load profile builds", err);
      setBusy(false);
    });
  }, [user]);

  async function remove(id) {
    await deleteBuild(id);
    setBuilds((prev) => prev.filter((b) => b.id !== id));
  }

  async function rename(id) {
    const name = editName.trim() || "My PC Build";
    await updateBuild(id, { name });
    setBuilds((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
    setEditingId(null);
  }

  function buildSlots(build) {
    return BUILD_SLOTS.map((cat) => {
      const pid = build.components?.[cat];
      const product = pid ? products.find((p) => p.id === pid) : null;
      const low = product ? lowest(product) : null;
      const lowestShop = low
        ? (products.length && product.offers?.find((o) => o.shop === low.shop)?.shopName || low.shopName || low.shop)
        : null;
      return { cat, label: CAT_LABEL[cat], product, lowestPrice: low?.price, lowestShop };
    }).filter((s) => s.product);
  }

  if (loading || busy) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;

  if (!user) {
    return (
      <div className="max-w-[1240px] mx-auto px-7 py-16 text-center">
        <h1 className="text-xl mb-2">Log in to see your profile</h1>
        <Link href="/login" className="btn btn-primary mt-3">Log in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">{profile?.name || "Your Profile"}</h1>
      <p className="text-ink-soft text-[13.5px] mb-8">{user.email}</p>

      <h2 className="text-lg mb-3">My Builds</h2>
      {builds.length === 0 ? (
        <div className="text-ink-soft text-sm">No saved builds yet — create one in the <Link href="/builder" className="text-pcb-dark font-semibold">PC Builder</Link>.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {builds.map((b) => {
            const slots = buildSlots(b);
            const total = b.total ?? slots.reduce((s, x) => s + (x.lowestPrice || 0), 0);
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  {editingId === b.id ? (
                    <div className="flex gap-2 flex-1">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="border border-line rounded-md px-2 py-1 text-sm flex-1" />
                      <button onClick={() => rename(b.id)} className="btn btn-sm btn-primary">Save</button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-[15px] font-semibold">{b.name}</h3>
                      <button onClick={() => { setEditingId(b.id); setEditName(b.name); }} className="text-[12px] text-pcb-dark font-semibold">Rename</button>
                    </>
                  )}
                </div>
                <div className="text-[12.5px] text-ink-soft mb-3">{slots.length} components · {fmt(total)}</div>
                <ul className="text-[13px] mb-3 space-y-1">
                  {slots.map((s) => (
                    <li key={s.label} className="flex justify-between gap-3"><span className="text-ink-soft shrink-0">{s.label}</span><span className="font-medium text-right">{s.product.name}</span></li>
                  ))}
                </ul>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/builder?buildId=${encodeURIComponent(b.id)}`} className="btn btn-primary btn-sm">Edit Build</Link>
                  <button onClick={() => downloadBuildPDF(b.name, slots, total, b.budget)} className="btn btn-ghost btn-sm">Download PDF</button>
                  <button onClick={() => remove(b.id)} className="btn btn-sm btn-danger">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
