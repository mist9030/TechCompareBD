"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load users");
      setUsers(json.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  async function setRole(uid, role) {
    setActing(uid);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update role");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-display mb-1">Users</h1>
      <p className="text-adminink-soft text-[12.5px] mb-5">
        Promote or demote admin access. Backed by a server-side route (not client Firestore writes) since role
        changes are a real privilege boundary.
      </p>

      {error && <div className="admin-card p-3 mb-4 text-[12.5px]" style={{ color: "#C4472F" }}>{error}</div>}
      {busy ? (
        <div className="text-adminink-soft text-sm">Loading…</div>
      ) : (
        <div className="admin-card overflow-hidden">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-adminline text-left">
                {["Name", "Email", "Role", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-wide text-adminink-soft font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-adminline last:border-0">
                  <td className="px-4 py-3 font-semibold">{u.name || "—"}</td>
                  <td className="px-4 py-3 text-adminink-soft">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.role === "admin" ? "badge-best" : "badge-muted"}`}>{u.role || "user"}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === "admin" ? (
                      <button disabled={acting === u.id} onClick={() => setRole(u.id, "user")} className="btn btn-sm btn-danger">
                        Demote
                      </button>
                    ) : (
                      <button disabled={acting === u.id} onClick={() => setRole(u.id, "admin")} className="btn btn-sm btn-primary">
                        Make admin
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-adminink-soft">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
