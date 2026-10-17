"use client";
import { useEffect, useState } from "react";
import { getCategories, addCategory, deleteCategory } from "@/lib/data";
import { CAT_LABEL } from "@/lib/catalog";

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(true);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  function load() {
    getCategories().then((c) => { setCats(c); setBusy(false); });
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!name || !key) return;
    await addCategory({ key, name });
    setName(""); setKey("");
    load();
  }

  async function remove(id) {
    await deleteCategory(id);
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-display mb-2">Categories</h1>
      <p className="text-adminink-soft text-[12.5px] mb-5 max-w-xl">
        The 10 built-in categories ({Object.values(CAT_LABEL).join(", ")}) power icons and PC Builder slots and are
        fixed in the code. Use this list for additional catalog metadata your team wants to track separately (e.g.
        sub-categories for the scraper to target).
      </p>

      <form onSubmit={submit} className="flex gap-2 mb-6 flex-wrap">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key (e.g. keyboard)" className="bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm w-40" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm w-48" />
        <button className="btn btn-primary btn-sm">Add</button>
      </form>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead><tr><th>Key</th><th>Name</th><th></th></tr></thead>
          <tbody>
            {busy && <tr><td colSpan={3} className="text-adminink-soft p-4">Loading…</td></tr>}
            {!busy && cats.length === 0 && <tr><td colSpan={3} className="text-adminink-soft p-4">No extra categories added.</td></tr>}
            {cats.map((c) => (
              <tr key={c.id}>
                <td className="font-mono">{c.key}</td>
                <td>{c.name}</td>
                <td><button onClick={() => remove(c.id)} className="btn btn-sm btn-danger">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
