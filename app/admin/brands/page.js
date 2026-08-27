"use client";
import { useEffect, useState } from "react";
import { getProducts, updateProduct } from "@/lib/data";
import { CAT_LABEL } from "@/lib/catalog";

// Brand is a plain string field on each Product (no separate Brand
// collection) — matching spec section 19 ("preserve compatibility with
// the existing frontend... don't create duplicate parallel systems").
// This page aggregates that field across products rather than managing a
// Brand entity that doesn't exist in the schema; "rename" is a bulk
// update across every product carrying the old brand string.
export default function AdminBrands() {
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(true);
  const [editing, setEditing] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setBusy(true);
    getProducts().then((p) => {
      setProducts(p);
      setBusy(false);
    });
  }
  useEffect(load, []);

  const brands = {};
  for (const p of products) {
    const key = p.brand || "Unbranded";
    if (!brands[key]) brands[key] = { name: key, count: 0, cats: new Set() };
    brands[key].count++;
    brands[key].cats.add(p.cat);
  }
  const rows = Object.values(brands).sort((a, b) => b.count - a.count);

  async function saveRename(oldName) {
    if (!renameValue.trim() || renameValue.trim() === oldName) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const affected = products.filter((p) => (p.brand || "Unbranded") === oldName);
    await Promise.all(affected.map((p) => updateProduct(p.id, { brand: renameValue.trim() })));
    setSaving(false);
    setEditing(null);
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-display mb-1">Brands</h1>
      <p className="text-adminink-soft text-[12.5px] mb-5">
        Brand is a plain field on each product (not a separate collection) — this view aggregates it across your
        catalog. Renaming here bulk-updates every product currently carrying that brand name.
      </p>

      {busy ? (
        <div className="text-adminink-soft text-sm">Loading…</div>
      ) : (
        <div className="admin-card overflow-hidden">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-adminline text-left">
                {["Brand", "Products", "Categories", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-wide text-adminink-soft font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.name} className="border-b border-adminline last:border-0">
                  <td className="px-4 py-3 font-semibold">
                    {editing === b.name ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveRename(b.name)}
                        className="bg-transparent border border-adminline rounded-md px-2 py-1 text-sm w-full max-w-[200px]"
                      />
                    ) : (
                      b.name
                    )}
                  </td>
                  <td className="px-4 py-3">{b.count}</td>
                  <td className="px-4 py-3 text-adminink-soft">
                    {[...b.cats].map((c) => CAT_LABEL[c] || c).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing === b.name ? (
                      <div className="flex gap-2 justify-end">
                        <button disabled={saving} onClick={() => saveRename(b.name)} className="btn btn-sm btn-primary">
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditing(null)} className="btn btn-sm">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditing(b.name);
                          setRenameValue(b.name);
                        }}
                        className="btn btn-sm"
                      >
                        Rename
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-adminink-soft">No products yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
