"use client";
import { useEffect, useState } from "react";
import { getScrapingLogs } from "@/lib/data";

export default function AdminScraping() {
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    getScrapingLogs().then((l) => { setLogs(l); setBusy(false); });
  }, []);

  return (
    <div>
      <h1 className="text-xl font-display mb-1">Scraping Logs</h1>
      <p className="text-adminink-soft text-[12.5px] mb-5">
        Each run is written by the scraper job (see <code>/scripts/seed.mjs</code> for the data shape, and the README
        for where to plug in a real scraper). Trigger test runs from the Shops page.
      </p>
      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead><tr><th>Shop</th><th>Found</th><th>Matched</th><th>Failed</th><th>Status</th><th>Started</th></tr></thead>
          <tbody>
            {busy && <tr><td colSpan={6} className="text-adminink-soft p-4">Loading…</td></tr>}
            {!busy && logs.length === 0 && <tr><td colSpan={6} className="text-adminink-soft p-4">No runs logged yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="font-semibold">{l.shopName}</td>
                <td>{l.found}</td>
                <td>{l.matched}</td>
                <td>{l.failed}</td>
                <td className="capitalize">{l.status}</td>
                <td className="text-adminink-soft">{l.startedAt?.toDate ? l.startedAt.toDate().toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
