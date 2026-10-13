"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export default function Header() {
  const { user, profile, isAdmin, logout } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");

  function submitSearch(e) {
    e.preventDefault();
    router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  }

  return (
    <header className="sticky top-0 z-50 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-[1240px] mx-auto px-4 md:px-7 h-[66px] flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg shrink-0">
          <span className="w-[30px] h-[30px] rounded-[7px] bg-pcb flex items-center justify-center text-white text-xs">TC</span>
          Tech<span className="text-gold">Compare</span>&nbsp;BD
        </Link>
        <nav className="hidden lg:flex gap-1 text-sm font-semibold text-ink-soft shrink-0">
          <Link href="/products" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Products</Link>
          <Link href="/categories" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Categories</Link>
          <Link href="/compare" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Compare</Link>
          <Link href="/builder" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">PC Builder</Link>
{user && (
<Link href="/builds" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">My Builds</Link>
)}          <Link href="/history" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Price History</Link>
          <Link href="/deals" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Deals</Link>
          <Link href="/guides" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Guides</Link>
          {isAdmin && (
            <Link href="/admin" className="px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint">Admin</Link>
          )}
        </nav>

        <form onSubmit={submitSearch} className="header-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, brands, models…"
          />
        </form>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Link href="/wishlist" className="icon-btn" title="Wishlist">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M12 20s-7.5-4.6-10-9.3C.5 6.9 2.7 3.5 6.3 3.2c2-.2 3.9.8 5.7 2.9 1.8-2.1 3.7-3.1 5.7-2.9 3.6.3 5.8 3.7 4.3 7.5C19.5 15.4 12 20 12 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </Link>
          {user ? (
            <>
              <Link href="/profile" className="btn btn-ghost btn-sm">{profile?.name || "Profile"}</Link>
              <button onClick={logout} className="btn btn-ghost btn-sm">Log out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link href="/register" className="btn btn-primary btn-sm">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
