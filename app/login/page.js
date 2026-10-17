"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { authErrorMessage, isValidEmail, safeNext } from "@/lib/authHelpers";
import { AuthShell, TextField, PasswordField, GoogleButton, OrDivider, Alert, PrimaryButton } from "@/components/AuthUI";

function LoginInner() {
  const { user, loading, login, loginWithGoogle, resetPassword, sendLoginLink, isLoginLink, completeLoginLink } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [view, setView] = useState("signin"); // "signin" | "reset"
  const [tab, setTab] = useState(params.get("mode") === "link" ? "link" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [finishing, setFinishing] = useState(false); // completing an emailed sign-in link
  const [askEmail, setAskEmail] = useState(false); // link opened on another device

  // Already logged in -> leave this page.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [user, loading, router, next]);

  // Came back from the emailed sign-in link.
  async function finishLink(address) {
    setFinishing(true);
    setError("");
    try {
      await completeLoginLink(address);
      router.replace(next);
    } catch (err) {
      if (err?.code === "auth/missing-email") setAskEmail(true);
      else {
        setError(authErrorMessage(err));
        setAskEmail(false);
      }
    } finally {
      setFinishing(false);
    }
  }
  useEffect(() => {
    if (isLoginLink()) finishLink(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(t) {
    setTab(t);
    setError("");
    setInfo("");
  }

  async function submitPassword(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await login(email.trim(), password, remember);
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setBusy(false);
  }

  async function submitLink(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    setBusy(true);
    try {
      await sendLoginLink(email.trim());
      setInfo(`We sent a sign-in link to ${email.trim()}. Open it on this device to log in — no password needed. New here? That link also creates your account.`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setBusy(false);
  }

  async function submitReset(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!isValidEmail(email)) return setError("Enter the email address of your account.");
    setBusy(true);
    try {
      await resetPassword(email.trim());
      // Same message whether or not the account exists (no account probing).
      setInfo("If an account exists for that email, a password reset link is on its way.");
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setBusy(false);
  }

  async function google() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await loginWithGoogle(remember);
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setBusy(false);
  }

  const registerHref = next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  /* ----- completing an emailed link ----- */
  if (finishing || askEmail) {
    return (
      <AuthShell title="Finishing sign-in" subtitle="Confirm the email address this link was sent to.">
        {finishing ? (
          <p className="text-ink-soft text-sm">Signing you in…</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); finishLink(email.trim()); }} className="space-y-4">
            <Alert>{error}</Alert>
            <TextField label="Email" icon="mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <PrimaryButton type="submit" busy={busy} busyText="Signing in…">Continue</PrimaryButton>
          </form>
        )}
      </AuthShell>
    );
  }

  /* ----- forgot password ----- */
  if (view === "reset") {
    return (
      <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one."
        footer={<button onClick={() => { setView("signin"); setError(""); setInfo(""); }} className="text-pcb-dark font-semibold">&larr; Back to log in</button>}>
        <form onSubmit={submitReset} className="space-y-4">
          <Alert>{error}</Alert>
          <Alert type="ok">{info}</Alert>
          <TextField label="Email" icon="mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <PrimaryButton type="submit" busy={busy} busyText="Sending…">Send reset link</PrimaryButton>
        </form>
      </AuthShell>
    );
  }

  /* ----- normal sign-in ----- */
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your saved builds, wishlist and comparisons."
      footer={<>New to TechCompare BD? <Link href={registerHref} className="text-pcb-dark font-semibold">Create an account</Link></>}
    >
      <GoogleButton onClick={google} busy={busy}>Continue with Google</GoogleButton>
      <OrDivider>or use your email</OrDivider>

      <div className="grid grid-cols-2 gap-1 p-1 bg-paper border border-line rounded-lg mb-5 text-[13px] font-semibold" role="tablist">
        {[["password", "Password"], ["link", "Email link"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => switchTab(id)}
            className={`rounded-md py-2 transition ${tab === id ? "bg-white text-pcb-dark shadow-sm" : "text-ink-soft hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "password" ? (
        <form onSubmit={submitPassword} className="space-y-4">
          <Alert>{error}</Alert>
          <TextField label="Email" icon="mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <PasswordField required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
          <div className="flex items-center justify-between text-[13px]">
            <label className="flex items-center gap-2 text-ink-soft cursor-pointer">
              <input type="checkbox" className="accent-pcb w-4 h-4" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button type="button" onClick={() => { setView("reset"); setError(""); setInfo(""); }} className="text-pcb-dark font-semibold hover:underline">
              Forgot password?
            </button>
          </div>
          <PrimaryButton type="submit" busy={busy} busyText="Logging in…">Log in</PrimaryButton>
        </form>
      ) : (
        <form onSubmit={submitLink} className="space-y-4">
          <Alert>{error}</Alert>
          <Alert type="ok">{info}</Alert>
          <TextField label="Email" icon="mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
            hint="We'll email you a one-time link. No password to remember." />
          <PrimaryButton type="submit" busy={busy} busyText="Sending…">Email me a sign-in link</PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LoginInner />
    </Suspense>
  );
}
