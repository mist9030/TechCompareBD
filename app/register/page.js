"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { authErrorMessage, isPasswordAcceptable, isValidEmail, safeNext } from "@/lib/authHelpers";
import { AuthShell, TextField, PasswordField, GoogleButton, OrDivider, Alert, PrimaryButton, Icon } from "@/components/AuthUI";

function RegisterInner() {
  const { user, loading, register, loginWithGoogle } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // email of the account just created

  // Already logged in (and not looking at the "account created" screen).
  useEffect(() => {
    if (!loading && user && !created) router.replace(next);
  }, [user, loading, created, router, next]);

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    if (!isPasswordAcceptable(password)) {
      return setError("Password needs at least 8 characters and a mix of letters, numbers or symbols.");
    }
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      setCreated(email.trim());
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setBusy(false);
  }

  async function google() {
    setError("");
    setBusy(true);
    try {
      await loginWithGoogle(true);
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setBusy(false);
  }

  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  if (created) {
    return (
      <AuthShell title="You're in!" subtitle="Your account has been created.">
        <div className="flex items-start gap-3 rounded-lg bg-pcb-tint text-pcb-dark p-4 text-[13.5px] mb-6">
          <Icon name="mail" className="shrink-0 mt-0.5" />
          <span>We sent a verification email to <b>{created}</b>. You can start using the site right away.</span>
        </div>
        <PrimaryButton type="button" onClick={() => router.replace(next)}>Continue to TechCompare BD</PrimaryButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Save PC builds, compare them and keep a wishlist."
      footer={<>Already have an account? <Link href={loginHref} className="text-pcb-dark font-semibold">Log in</Link></>}
    >
      <GoogleButton onClick={google} busy={busy}>Sign up with Google</GoogleButton>
      <OrDivider>or sign up with email</OrDivider>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <TextField label="Full name" icon="user" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <TextField label="Email" icon="mail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <PasswordField showMeter required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
        <div>
          <PasswordField label="Confirm password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat the password" />
          {mismatch && <p className="text-[12px] text-red mt-1.5">Passwords don&apos;t match yet.</p>}
          {confirm && !mismatch && <p className="text-[12px] text-pcb-dark mt-1.5 flex items-center gap-1"><Icon name="check" size={14} /> Passwords match</p>}
        </div>
        <PrimaryButton type="submit" busy={busy} busyText="Creating account…">Create account</PrimaryButton>
      </form>

      <p className="text-[12.5px] text-ink-soft text-center mt-5">
        Prefer no password?{" "}
        <Link href="/login?mode=link" className="text-pcb-dark font-semibold">Get an email sign-in link</Link>
      </p>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <RegisterInner />
    </Suspense>
  );
}
