"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(name, email, password);
      router.push("/");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl mb-6 text-center">Create your account</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="text-[12.5px] font-semibold text-ink-soft">Name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="border border-line rounded-md px-3 py-2 text-sm w-full mt-1" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-ink-soft">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-line rounded-md px-3 py-2 text-sm w-full mt-1" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-ink-soft">Password</label>
          <input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border border-line rounded-md px-3 py-2 text-sm w-full mt-1" />
        </div>
        {error && <div className="text-red text-[12.5px]">{error}</div>}
        <button disabled={busy} className="btn btn-primary btn-block">{busy ? "Creating…" : "Sign up"}</button>
      </form>
      <p className="text-center text-[13px] text-ink-soft mt-4">
        Already have an account? <Link href="/login" className="text-pcb-dark font-semibold">Log in</Link>
      </p>
    </div>
  );
}
