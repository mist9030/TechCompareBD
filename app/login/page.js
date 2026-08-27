"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl mb-6 text-center">Log in to TechCompare BD</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="text-[12.5px] font-semibold text-ink-soft">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-line rounded-md px-3 py-2 text-sm w-full mt-1" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-ink-soft">Password</label>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border border-line rounded-md px-3 py-2 text-sm w-full mt-1" />
        </div>
        {error && <div className="text-red text-[12.5px]">{error}</div>}
        <button disabled={busy} className="btn btn-primary btn-block">{busy ? "Logging in…" : "Log in"}</button>
      </form>
      <p className="text-center text-[13px] text-ink-soft mt-4">
        No account? <Link href="/register" className="text-pcb-dark font-semibold">Sign up</Link>
      </p>
    </div>
  );
}
