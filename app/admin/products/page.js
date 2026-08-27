"use client";
import { useEffect, useState } from "react";
import { getProducts, addProduct, updateProduct, deleteProduct, getShops } from "@/lib/data";
import { CAT_LABEL, fmt, lowest } from "@/lib/catalog";

const emptyForm = { cat: "cpu", brand: "", name: "", model: "", discount: 0, specsText: "{}", offers: [] };

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [busy, setBusy] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | product object being edited
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  function load() {
    Promise.all([getProducts(), getShops()]).then(([p, s]) => { setProducts(p); setShops(s); setBusy(false); });
  }
  useEffect(load, []);

  function openNew() {
    setForm(emptyForm);
    setModal("new");
    setError("");
  }
  function openEdit(p) {
    setForm({
      cat: p.cat, brand: p.brand, name: p.name, model: p.model || "", discount: p.discount || 0,
      specsText: JSON.stringify(p.specs || {}, null, 2),
      offers: p.offers || [],
    });
    setModal(p);
    setError("");
  }

  function addOfferRow() {
    setForm((f) => ({ ...f, offers: [...f.offers, { shop: shops[0]?.id || "", price: 0, availability: "in_stock", updated: "Just now" }] }));
  }
  function updateOfferRow(i, field, value) {
    setForm((f) => {
      const offers = [...f.offers];
      offers[i] = { ...offers[i], [field]: field === "price" ? Number(value) : value };
      return { ...f, offers };
    });
  }
  function removeOfferRow(i) {
    setForm((f) => ({ ...f, offers: f.offers.filter((_, idx) => idx !== i) }));
  }

  async function submit(e) {
    e.preventDefault();
    let specs;
    try {
      specs = JSON.parse(form.specsText || "{}");
    } catch {
      setError("Specs must be valid JSON, e.g. {\"Socket\": \"AM5\"}");
      return;
    }
    const payload = { cat: form.cat, brand: form.brand, name: form.name, model: form.model, discount: Number(form.discount) || 0, specs, offers: form.offers };
    if (modal === "new") await addProduct(payload);
    else await updateProduct(modal.id, payload);
    setModal(null);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this product?")) return;
    await deleteProduct(id);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-display">Products</h1>
        <button onClick={openNew} className="btn btn-primary btn-sm">+ New Product</button>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead><tr><th>Product</th><th>Brand</th><th>Category</th><th>Lowest Price</th><th>Retailers</th><th></th></tr></thead>
          <tbody>
            {busy && <tr><td colSpan={6} className="text-adminink-soft p-4">Loading…</td></tr>}
            {!busy && products.length === 0 && <tr><td colSpan={6} className="text-adminink-soft p-4">No products yet. Seed the database or add one above.</td></tr>}
            {products.map((p) => {
              const low = lowest(p);
              return (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td>{p.brand}</td>
                  <td>{CAT_LABEL[p.cat]}</td>
                  <td>{low ? fmt(low.price) : "—"}</td>
                  <td>{p.offers?.length || 0}</td>
                  <td className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="btn btn-sm" style={{ background: "none", border: "1px solid var(--admin-line, #262c35)", color: "#e7e9ec" }}>Edit</button>
                    <button onClick={() => remove(p.id)} className="btn btn-sm btn-danger">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <form onSubmit={submit} className="admin-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[15px] font-display mb-4">{modal === "new" ? "New Product" : "Edit Product"}</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11.5px] text-adminink-soft">Category</label>
                <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1">
                  {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-adminink-soft">Brand</label>
                <input required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11.5px] text-adminink-soft">Product name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11.5px] text-adminink-soft">Model</label>
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1" />
              </div>
              <div>
                <label className="text-[11.5px] text-adminink-soft">Discount %</label>
                <input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11.5px] text-adminink-soft">Specs (JSON key/value)</label>
              <textarea value={form.specsText} onChange={(e) => setForm({ ...form, specsText: e.target.value })} rows={4} className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-xs mt-1 font-mono" />
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11.5px] text-adminink-soft">Shop offers</label>
                <button type="button" onClick={addOfferRow} className="text-[11.5px] text-pcb-tint">+ add offer</button>
              </div>
              <div className="space-y-2">
                {form.offers.map((o, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={o.shop} onChange={(e) => updateOfferRow(i, "shop", e.target.value)} className="bg-transparent border border-adminline rounded-md px-2 py-1 text-xs flex-1">
                      {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input type="number" value={o.price} onChange={(e) => updateOfferRow(i, "price", e.target.value)} placeholder="Price" className="bg-transparent border border-adminline rounded-md px-2 py-1 text-xs w-24" />
                    <select value={o.availability} onChange={(e) => updateOfferRow(i, "availability", e.target.value)} className="bg-transparent border border-adminline rounded-md px-2 py-1 text-xs">
                      <option value="in_stock">In stock</option>
                      <option value="out_of_stock">Out of stock</option>
                    </select>
                    <button type="button" onClick={() => removeOfferRow(i)} className="text-red text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="text-red text-[12.5px] mb-2">{error}</div>}
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setModal(null)} className="btn btn-sm" style={{ background: "none", border: "1px solid #262c35", color: "#e7e9ec" }}>Cancel</button>
              <button className="btn btn-sm btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
