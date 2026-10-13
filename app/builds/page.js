"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useCatalog } from "@/lib/CatalogContext";
import { getUserBuilds, deleteBuild, updateBuild } from "@/lib/data";
import { fmt, CAT_LABEL, BUILD_SLOTS, lowest } from "@/lib/catalog";
import { downloadBuildPDF } from "@/lib/pdf";
// "My Builds"- all previously saved PC builds (moved here from /profile).
export default function MyBuildsPage() {
const router = useRouter();
const { user, loading } = useAuth();
const { products } = useCatalog();
const [builds, setBuilds] = useState([]);
const [busy, setBusy] = useState(true);
const [editingId, setEditingId] = useState(null);
const [editName, setEditName] = useState("");
const [picked, setPicked] = useState([]); // build ids ticked for comparison
useEffect(() => {
if (loading) return;
if (!user) { setBusy(false); return; }
getUserBuilds(user.uid)
.then((b) => setBuilds(
[...b].sort((x, y) => (y.createdAt?.toMillis?.() ?? 0)- (x.createdAt?.toMillis?.() ?? 0))
))
.catch((err) => console.error("Failed to load builds", err))
.finally(() => setBusy(false));
}, [user, loading]);
async function remove(id) {
if (!confirm("Delete this saved build?")) return;
await deleteBuild(id);
setBuilds((prev) => prev.filter((b) => b.id !== id));
setPicked((prev) => prev.filter((x) => x !== id));
}
async function rename(id) {
    const name = editName.trim() || "My PC Build";
await updateBuild(id, { name });
setBuilds((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
setEditingId(null);
}
function togglePick(id) {
setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
}
function buildSlots(build) {
return BUILD_SLOTS.map((cat) => {
const pid = build.components?.[cat];
const product = pid ? products.find((p) => p.id === pid) : null;
const low = product ? lowest(product) : null;
const lowestShop = low ? (low.shopName || low.shop) : null;
return { cat, label: CAT_LABEL[cat], product, lowestPrice: low?.price, lowestShop };
}).filter((s) => s.product);
}
if (loading || busy) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;
if (!user) {
return (
<div className="max-w-[1240px] mx-auto px-7 py-16 text-center">
<h1 className="text-xl mb-2">Log in to see your builds</h1>
<Link href="/login" className="btn btn-primary mt-3">Log in</Link>
</div>
);
}
return (
<div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
<div className="flex items-center justify-between flex-wrap gap-3 mb-6">
<div>
<h1 className="text-2xl mb-1">My Builds</h1>
<p className="text-ink-soft text-[13.5px]">Your previously saved PC builds. Tick 2-4 builds to compare them.</p>
</div>
<div className="flex gap-2">
<button
disabled={picked.length < 2}
onClick={() => router.push(`/compare/builds?ids=${picked.join(",")}`)}
className="btn btn-primary btn-sm"
>
Compare selected ({picked.length})
</button>
<Link href="/builder" className="btn btn-ghost btn-sm">+ New build</Link>
</div>
</div>
{builds.length === 0 ? (
<div className="text-ink-soft text-sm">No saved builds yet — create one in the <Link href="/builder" className="text-pcb-dark
font-semibold">PC Builder</Link>.</div>
) : (
<div className="grid md:grid-cols-2 gap-4">
{builds.map((b) => {
const slots = buildSlots(b);
const total = slots.reduce((s, x) => s + (x.lowestPrice || 0), 0);
return (
<div key={b.id} className="card p-4">
<div className="flex items-center justify-between mb-2 gap-2">
{editingId === b.id ? (
<div className="flex gap-2 flex-1">
<input value={editName} onChange={(e) => setEditName(e.target.value)} className="border border-line rounded-md px-2
py-1 text-sm flex-1" />
<button onClick={() => rename(b.id)} className="btn btn-sm btn-primary">Save</button>
</div>
) : (
    <>
<label className="flex items-center gap-2 min-w-0 cursor-pointer">
→
<input type="checkbox" className="accent-pcb" checked={picked.includes(b.id)} disabled={!picked.includes(b.id) &&
picked.length >= 4} onChange={() => togglePick(b.id)} />
<h3 className="text-[15px] font-semibold truncate">{b.name}</h3>
</label>
→
<button onClick={() => { setEditingId(b.id); setEditName(b.name); }} className="text-[12px] text-pcb-dark
font-semibold">Rename</button>
</>
)}
</div>
<div className="text-[12.5px] text-ink-soft mb-3">{slots.length} components · {fmt(total)} (current lowest prices)</div>
<ul className="text-[13px] mb-3 space-y-1">
{slots.map((s) => (
<li key={s.label} className="flex justify-between gap-3"><span className="text-ink-soft
shrink-0">{s.label}</span><span className="font-medium text-right">{s.product.name}</span></li>
))}
</ul>
<div className="flex gap-2 flex-wrap">
<Link href={`/builder?buildId=${encodeURIComponent(b.id)}`} className="btn btn-primary btn-sm">Edit Build</Link>
<button onClick={() => downloadBuildPDF(b.name, slots, total, b.budget)} className="btn btn-ghost btn-sm">Download
PDF</button>
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