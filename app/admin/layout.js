"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

// Grouped to match the prototype's admin sidebar (Overview / Catalog /
// Data Sources / Insights). "Candidates" in the prototype is the same
// concept as our Match Review queue (spec section 7's exception-handling
// workflow); "Jobs" is covered by the existing Scraping Logs page rather
// than a separate duplicate route.
const NAV_GROUPS = [
  { label: "Overview", items: [{ href: "/admin", label: "Dashboard" }] },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products" },
      { href: "/admin/brands", label: "Brands" },
      { href: "/admin/categories", label: "Categories" },
    ],
  },
  {
    label: "Data Sources",
    items: [
      { href: "/admin/shops", label: "Shops" },
      { href: "/admin/scraping", label: "Scraping / Jobs" },
      { href: "/admin/match-review", label: "Match Review" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/history", label: "Price History" },
      { href: "/admin/users", label: "Users" },
    ],
  },
];

export default function AdminLayout({ children }) {
  const { user, isAdmin, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return <div className="admin-shell py-16 text-center text-adminink-soft">Loading…</div>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="admin-shell py-20 px-6 text-center">
        <h1 className="text-xl font-display mb-2">Admin access required</h1>
        <p className="text-adminink-soft text-sm mb-4">
          Log in with an account whose Firestore <code>users/&#123;uid&#125;</code> document has <code>role: "admin"</code>.
        </p>
        <Link href="/login" className="btn btn-primary">Log in</Link>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="max-w-[1320px] mx-auto flex">
        <aside className="w-[220px] shrink-0 p-4 border-r border-adminline min-h-screen hidden md:block">
          <div className="font-display font-bold text-[15px] mb-6 px-2">TechCompare Admin</div>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="px-3 text-[10.5px] font-bold uppercase tracking-wide text-adminink-soft/70 mb-1.5">{group.label}</div>
              <nav className="admin-nav flex flex-col gap-1">
                {group.items.map((n) => (
                  <Link key={n.href} href={n.href} className={pathname === n.href ? "active" : ""}>{n.label}</Link>
                ))}
              </nav>
            </div>
          ))}
          <Link href="/" className="block mt-4 px-3 text-[12px] text-adminink-soft">← Back to site</Link>
        </aside>
        <div className="flex-1 p-5 md:p-7 min-w-0">
          {/* Phones: the sidebar is hidden, so show the admin links as a scrollable strip */}
          <nav className="admin-nav md:hidden flex gap-2 overflow-x-auto pb-3 mb-4 whitespace-nowrap">
            {NAV_GROUPS.flatMap((g) => g.items).map((n) => (
              <Link key={n.href} href={n.href} className={pathname === n.href ? "active" : ""}>{n.label}</Link>
            ))}
            <Link href="/">← Site</Link>
          </nav>
          {children}
        </div>
      </div>
    </div>
  );
}
