"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

// Every top-level page. `auth` = only when logged in, `admin` = admins only.
const LINKS = [
  { href: "/products", label: "Products" },
  { href: "/categories", label: "Categories" },
  { href: "/compare", label: "Compare" },
  { href: "/builder", label: "PC Builder" },
  { href: "/builds", label: "My Builds", auth: true },
  { href: "/history", label: "Price History" },
  { href: "/deals", label: "Deals" },
  { href: "/guides", label: "Guides" },
  { href: "/admin", label: "Admin", admin: true },
];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const { user, profile, isAdmin, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false); // search bar under the header (small/medium screens)
  const [menuOpen, setMenuOpen] = useState(false); // hamburger menu (below xl)
  const searchRef = useRef(null);

  const links = LINKS.filter((l) => (!l.auth || user) && (!l.admin || isAdmin));

  // Close the panels whenever the page changes.
  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Esc closes the panels; opening the search bar focuses the input.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function submitSearch(e) {
    e.preventDefault();
    const term = q.trim();
    setSearchOpen(false);
    setMenuOpen(false);
    router.push(term ? `/products?q=${encodeURIComponent(term)}` : "/products");
  }

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
  }

  const linkCls = "px-2.5 py-2 rounded-md hover:text-pcb-dark hover:bg-pcb-tint whitespace-nowrap";

  return (
    <header className="sticky top-0 z-50 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-[1400px] mx-auto px-4 md:px-7 h-[66px] flex items-center gap-3 md:gap-5">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-base md:text-lg shrink-0">
          <span className="w-[30px] h-[30px] rounded-[7px] bg-pcb flex items-center justify-center text-white text-xs">TC</span>
          <span>Tech<span className="text-gold">Compare</span>&nbsp;BD</span>
        </Link>

        {/* Full navigation: only on wide screens (>= 1280px). Narrower -> hamburger. */}
        <nav className="hidden xl:flex gap-0.5 text-[13.5px] font-semibold text-ink-soft min-w-0">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`${linkCls} ${pathname === l.href ? "text-pcb-dark bg-pcb-tint" : ""}`}>
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Inline search box: only on very wide screens (>= 1536px). */}
        <div className="hidden 2xl:block flex-1 min-w-0 max-w-[360px]">
          <form onSubmit={submitSearch} role="search" className="header-search">
            <SearchIcon />
            <input
              type="search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, brands, models…"
              aria-label="Search products"
            />
          </form>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Search icon button (everything below 1536px): opens the search bar */}
          <button
            type="button"
            className="icon-btn 2xl:hidden"
            aria-label="Search"
            title="Search"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            <SearchIcon />
          </button>

          <Link href="/wishlist" className="icon-btn" title="Wishlist" aria-label="Wishlist">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 20s-7.5-4.6-10-9.3C.5 6.9 2.7 3.5 6.3 3.2c2-.2 3.9.8 5.7 2.9 1.8-2.1 3.7-3.1 5.7-2.9 3.6.3 5.8 3.7 4.3 7.5C19.5 15.4 12 20 12 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </Link>

          {/* Account buttons (tablet and up). On phones they live in the menu. */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <Link href="/profile" className="btn btn-ghost btn-sm max-w-[150px] truncate">{profile?.name || "Profile"}</Link>
                <button onClick={handleLogout} className="btn btn-ghost btn-sm hidden 2xl:inline-flex">Log out</button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link href="/register" className="btn btn-primary btn-sm">Sign up</Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="icon-btn xl:hidden"
            aria-label="Menu"
            title="Menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((v) => !v);
              setSearchOpen(false);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Search bar under the header (below 1536px) */}
      {searchOpen && (
        <div className="2xl:hidden border-t border-line bg-paper">
          <div className="max-w-[1400px] mx-auto px-4 md:px-7 py-3">
            <form onSubmit={submitSearch} role="search" className="flex gap-2">
              <div className="header-search" style={{ maxWidth: "none" }}>
                <SearchIcon />
                <input
                  ref={searchRef}
                  type="search"
                  name="q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search products, brands, models…"
                  aria-label="Search products"
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm">Search</button>
            </form>
          </div>
        </div>
      )}

      {/* Hamburger menu (below 1280px) */}
      {menuOpen && (
        <div className="xl:hidden border-t border-line bg-paper max-h-[calc(100vh-66px)] overflow-y-auto">
          <nav className="max-w-[1400px] mx-auto px-4 md:px-7 py-3 flex flex-col text-[15px] font-semibold text-ink-soft">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-2.5 rounded-md hover:bg-pcb-tint hover:text-pcb-dark ${pathname === l.href ? "text-pcb-dark bg-pcb-tint" : ""}`}
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-line mt-2 pt-3 flex gap-2 flex-wrap">
              {user ? (
                <>
                  <Link href="/profile" className="btn btn-ghost btn-sm">{profile?.name || "Profile"}</Link>
                  <button onClick={handleLogout} className="btn btn-ghost btn-sm">Log out</button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost btn-sm">Log in</Link>
                  <Link href="/register" className="btn btn-primary btn-sm">Sign up</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
