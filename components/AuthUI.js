"use client";
import { useState } from "react";
import Link from "next/link";
import { passwordStrength } from "@/lib/authHelpers";

/* ---------- tiny inline icons ---------- */
const PATHS = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  compare: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
};

export function Icon({ name, size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

/* ---------- page shell: brand panel + form ---------- */
const FEATURES = [
  { icon: "compare", title: "Compare prices", text: "Live prices from leading Bangladeshi IT & gadget shops, side by side." },
  { icon: "chip", title: "Build a compatible PC", text: "Pick parts slot by slot — sockets, memory and power are checked for you." },
  { icon: "save", title: "Save & take it to the shop", text: "Keep your builds, compare them, and download a PDF list." },
];

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid lg:grid-cols-[1.05fr_1fr] min-h-[calc(100vh-66px)]">
      {/* brand panel (desktop) */}
      <aside
        className="hidden lg:flex flex-col justify-between relative overflow-hidden text-white p-12 xl:p-16"
        style={{
          background:
            "radial-gradient(circle at 15% 10%, rgba(255,255,255,.14), transparent 40%), radial-gradient(circle at 90% 85%, rgba(201,138,44,.35), transparent 45%), linear-gradient(145deg, #0A5C4F 0%, #0E7C6B 55%, #0b6b5c 100%)",
        }}
      >
        <div aria-hidden="true" className="absolute inset-0 opacity-[.08]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
        <Link href="/" className="relative flex items-center gap-2.5 font-display font-bold text-xl">
          <span className="w-9 h-9 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center text-sm">TC</span>
          TechCompare BD
        </Link>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl xl:text-[44px] leading-[1.1] font-bold mb-4">
            Compare. Build.<br /><span className="text-[#F3C77B]">Choose smart.</span>
          </h2>
          <p className="text-white/80 text-[15px] mb-9">
            One account keeps your wishlist, saved PC builds and comparisons in sync.
          </p>
          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="shrink-0 w-10 h-10 rounded-xl bg-white/12 border border-white/20 flex items-center justify-center">
                  <Icon name={f.icon} />
                </span>
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="block text-[13.5px] text-white/75">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12.5px] text-white/60">Bangladesh IT &amp; gadget price comparison</p>
      </aside>

      {/* form side */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8 bg-paper">
        <div className="w-full max-w-[440px]">
          <Link href="/" className="lg:hidden flex items-center justify-center gap-2 font-display font-bold text-lg mb-6 text-pcb-dark">
            <span className="w-8 h-8 rounded-lg bg-pcb text-white flex items-center justify-center text-xs">TC</span>
            TechCompare BD
          </Link>
          <div className="bg-surface border border-line rounded-2xl shadow-[0_24px_48px_-28px_rgba(15,23,42,.35)] p-6 sm:p-8">
            <h1 className="font-display text-[26px] font-bold leading-tight">{title}</h1>
            {subtitle && <p className="text-ink-soft text-[14px] mt-1.5 mb-6">{subtitle}</p>}
            {children}
          </div>
          {footer && <div className="text-center text-[13.5px] text-ink-soft mt-5">{footer}</div>}
        </div>
      </section>
    </div>
  );
}

/* ---------- form pieces ---------- */
const inputCls =
  "w-full rounded-lg border border-line bg-white py-2.5 text-[14.5px] placeholder:text-[#9aa3af] focus:outline-none focus:border-pcb focus:ring-2 focus:ring-pcb/20 transition";

export function TextField({ label, icon, hint, className = "", ...props }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[12.5px] font-semibold text-ink-soft mb-1.5">{label}</span>
      <span className="relative block">
        {icon && <Icon name={icon} size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3af]" />}
        <input {...props} className={`${inputCls} ${icon ? "pl-10" : "pl-3"} pr-3`} />
      </span>
      {hint && <span className="block text-[12px] text-ink-soft mt-1">{hint}</span>}
    </label>
  );
}

export function PasswordField({ label = "Password", showMeter = false, ...props }) {
  const [show, setShow] = useState(false);
  const strength = passwordStrength(props.value);
  const colors = ["#e4e2dc", "#C4472F", "#C98A2C", "#7AA82B", "#0E7C6B"];
  return (
    <div>
      <label className="block">
        <span className="block text-[12.5px] font-semibold text-ink-soft mb-1.5">{label}</span>
        <span className="relative block">
          <Icon name="lock" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3af]" />
          <input {...props} type={show ? "text" : "password"} className={`${inputCls} pl-10 pr-11`} />
          <button type="button" onClick={() => setShow((v) => !v)} tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-ink-soft hover:text-pcb-dark hover:bg-pcb-tint">
            <Icon name={show ? "eyeOff" : "eye"} size={17} />
          </button>
        </span>
      </label>
      {showMeter && props.value && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ background: strength.score >= i ? colors[strength.score] : colors[0] }} />
            ))}
          </div>
          <div className="flex justify-between text-[12px] mt-1.5 text-ink-soft">
            <span>{strength.label}</span>
            <span>8+ characters, mix of letters, numbers &amp; symbols</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function GoogleButton({ onClick, busy, children }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="w-full flex items-center justify-center gap-3 rounded-lg border border-line bg-white py-2.5 text-[14.5px] font-semibold hover:border-pcb hover:bg-pcb-tint/40 transition disabled:opacity-60">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
      {children}
    </button>
  );
}

export function OrDivider({ children = "or" }) {
  return (
    <div className="flex items-center gap-3 my-5 text-[12px] uppercase tracking-wider text-[#9aa3af]">
      <span className="flex-1 h-px bg-line" />{children}<span className="flex-1 h-px bg-line" />
    </div>
  );
}

export function Alert({ type = "error", children }) {
  if (!children) return null;
  const cls = type === "error" ? "bg-red-tint text-red border-red/20" : "bg-pcb-tint text-pcb-dark border-pcb/20";
  return (
    <div role={type === "error" ? "alert" : "status"} className={`text-[13px] rounded-lg border px-3 py-2.5 ${cls}`}>
      {children}
    </div>
  );
}

export function PrimaryButton({ busy, busyText, children, ...props }) {
  return (
    <button {...props} disabled={busy || props.disabled}
      className="w-full rounded-lg bg-pcb hover:bg-pcb-dark text-white font-semibold py-3 text-[14.5px] transition disabled:opacity-60 disabled:cursor-not-allowed">
      {busy ? busyText : children}
    </button>
  );
}
