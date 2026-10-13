"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useWishlist } from "@/lib/WishlistContext";
import { getUserBuilds } from "@/lib/data";
export default function ProfilePage() {
const { user, profile, loading, isAdmin, logout, refreshProfile } = useAuth();
const { entries: wishlist } = useWishlist();
const [buildCount, setBuildCount] = useState(null);
const [name, setName] = useState("");
const [editing, setEditing] = useState(false);
const [saving, setSaving] = useState(false);
const [msg, setMsg] = useState(null); // { type: "ok" | "error", text }
useEffect(() => {
if (!user) return;
getUserBuilds(user.uid)
.then((b) => setBuildCount(b.length))
.catch(() => setBuildCount(0));
}, [user]);
async function saveName(e) {
e.preventDefault();
const next = name.trim();
if (!next) return;
setSaving(true);
setMsg(null);
try {
await updateProfile(auth.currentUser, { displayName: next });
await updateDoc(doc(db, "users", user.uid), { name: next });
await refreshProfile();
setEditing(false);
setMsg({ type: "ok", text: "Profile updated." });
} catch (err) {
console.error("Failed to update profile", err);
setMsg({ type: "error", text: err?.message || "Could not update profile." });
} finally {
setSaving(false);
}
}
async function resetPassword() {
setMsg(null);
try {
await sendPasswordResetEmail(auth, user.email);
setMsg({ type: "ok", text: `Password reset email sent to ${user.email}.` });
} catch (err) {
console.error("Failed to send reset email", err);
setMsg({ type: "error", text: err?.message || "Could not send reset email." });
}
}
if (loading) return <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">Loading…</div>;
if (!user) {
return (
<div className="max-w-[1240px] mx-auto px-7 py-16 text-center">
<h1 className="text-xl mb-2">Log in to see your profile</h1>
<Link href="/login" className="btn btn-primary mt-3">Log in</Link>
</div>
);
}
const displayName = profile?.name || user.displayName || "Your Profile";
const since = profile?.createdAt?.toDate
? profile.createdAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
: "—";
return (
<div className="max-w-[1000px] mx-auto px-4 md:px-7 py-8">
<h1 className="text-2xl mb-6">My Profile</h1>
{msg && (
<div className={`mb-4 text-[13px] rounded-md px-3 py-2 ${msg.type === "ok" ? "badge-ok" : "badge-error"}`} style={{
textTransform: "none" }}>
{msg.text}
</div>
)}
<div className="grid md:grid-cols-3 gap-5">
{/* Account info */}
<div className="card p-5 md:col-span-2">
<div className="flex items-center gap-4 mb-5">
<div className="w-14 h-14 rounded-full bg-pcb text-white flex items-center justify-center text-xl font-bold">
{displayName.charAt(0).toUpperCase()}
</div>
<div className="min-w-0">
<div className="text-lg font-semibold truncate">{displayName}</div>
<div className="text-[13px] text-ink-soft truncate">{user.email}</div>
</div>
{isAdmin && <span className="badge badge-best ml-auto">Admin</span>}
</div>
{editing ? (
<form onSubmit={saveName} className="flex gap-2 mb-4">
<input
value={name}
onChange={(e) => setName(e.target.value)}
className="border border-line rounded-md px-3 py-2 text-sm flex-1"
placeholder="Your name"
autoFocus
/>
<button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save"}</button>
<button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">Cancel</button>
</form>
) : (
<button onClick={() => { setName(displayName); setEditing(true); setMsg(null); }} className="btn btn-ghost btn-sm mb-4">
Edit name</button>
)}
<dl className="text-[13.5px] divide-y divide-line-soft">
<div className="flex justify-between py-2"><dt className="text-ink-soft">Name</dt><dd
className="font-medium">{displayName}</dd></div>
<div className="flex justify-between py-2"><dt className="text-ink-soft">Email</dt><dd
className="font-medium">{user.email}</dd></div>
<div className="flex justify-between py-2"><dt className="text-ink-soft">Account type</dt><dd
className="font-medium">{isAdmin ? "Administrator" : "User"}</dd></div>
<div className="flex justify-between py-2"><dt className="text-ink-soft">Member since</dt><dd
className="font-medium">{since}</dd></div>
</dl>
<div className="flex gap-2 flex-wrap mt-5">
<button onClick={resetPassword} className="btn btn-ghost btn-sm">Send password reset email</button>
<button onClick={logout} className="btn btn-sm btn-danger">Log out</button>
</div>
</div>
{/* Quick links */}
<div className="space-y-3">
<Link href="/builds" className="card hoverable block p-4">
<div className="text-[12px] font-semibold text-ink-soft uppercase mb-1">My Builds</div>
<div className="text-2xl font-display font-bold">{buildCount ?? "…"}</div>
<div className="text-[12.5px] text-ink-soft">Saved PC builds &rarr;</div>
</Link>
<Link href="/wishlist" className="card hoverable block p-4">
<div className="text-[12px] font-semibold text-ink-soft uppercase mb-1">Wishlist</div>
<div className="text-2xl font-display font-bold">{wishlist.length}</div>
<div className="text-[12.5px] text-ink-soft">Saved products &rarr;</div>
</Link>
<Link href="/compare/builds" className="card hoverable block p-4">
<div className="text-[12px] font-semibold text-ink-soft uppercase mb-1">Compare builds</div>
<div className="text-[12.5px] text-ink-soft">Put your saved builds side by side &rarr;</div>
</Link>
</div>
</div>
</div>
);
}
