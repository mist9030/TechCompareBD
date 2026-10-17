"use client";
import { useEffect, useState } from "react";
import { getScrapingLogs } from "@/lib/data";
import { useCatalog } from "@/lib/CatalogContext";
import { fmt } from "@/lib/catalog";

export default function AdminDashboard() {
  // Products/shops come from the already-synced local catalog cache (no extra
  // Firestore reads); only the scraping logs are fetched here.
  const { products, shops, loading } = useCatalog();
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    getScrapingLogs().then(setLogs).catch(() => setLogs([]));
  }, []);

  if (loading || !logs) return <div className="text-adminink-soft text-sm">Loading…</div>;

  const stats = {
    products: products.length,
    shops: shops.length,
    totalOffers: products.reduce((sum, p) => sum + (p.offers?.length || 0), 0),
    lastLogs: logs.slice(0, 6),
    failedTotal: logs.reduce((sum, l) => sum + (l.failed || 0), 0),
    activeShops: shops.filter((x) => x.status === "active").length,
  };

  const cards = [
    ["Products tracked", stats.products],
    ["Connected shops", stats.shops],
    ["Active scrapers", stats.activeShops],
    ["Offers tracked", stats.totalOffers],
  ];

  return (
    <div>
      <h1 className="text-xl font-display mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map(([label, value]) => (
          <div key={label} className="admin-card p-4">
            <div className="text-[11px] text-adminink-soft uppercase tracking-wide mb-1">{label}</div>
            <div className="text-2xl font-display font-bold">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="text-[15px] mb-3">Recent scraping runs</h2>
      <div className="admin-card overflow-hidden">
        <table className="admin-table">
          <thead><tr><th>Shop</th><th>Found</th><th>Matched</th><th>Failed</th><th>Status</th></tr></thead>
          <tbody>
            {stats.lastLogs.length === 0 && (
              <tr><td colSpan={5} className="text-adminink-soft p-4">No scraping runs yet — trigger one from the Shops page.</td></tr>
            )}
            {stats.lastLogs.map((l) => (
              <tr key={l.id}>
                <td>{l.shopName}</td>
                <td>{l.found}</td>
                <td>{l.matched}</td>
                <td>{l.failed}</td>
                <td className="capitalize">{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
