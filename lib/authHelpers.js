// Small pure helpers for the login / register pages (unit-tested in
// test/auth-helpers.test.mjs).

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

// Only allow redirects to pages of THIS site ("/products"), never to
// "https://evil.example" or "//evil.example".
export function safeNext(next) {
  const n = String(next || "");
  return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/";
}

export const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];

export function passwordStrength(password) {
  const pw = String(password || "");
  const checks = {
    length: pw.length >= 8,
    mixedCase: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  let score = Object.values(checks).filter(Boolean).length;
  if (!checks.length) score = Math.min(score, 1); // short passwords can never be "good"
  if (!pw) score = 0;
  return { score, label: STRENGTH_LABELS[score], checks };
}

// A password we accept on sign-up: 8+ characters and at least one more kind
// of character (case mix, digit or symbol).
export function isPasswordAcceptable(password) {
  const s = passwordStrength(password);
  return s.checks.length && s.score >= 2;
}

// Turns a Firebase Auth error into something a user can act on.
// Returns "" for errors that need no message (the user just closed a popup).
export function authErrorMessage(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Log in instead — or use the method you signed up with (e.g. Google).";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your internet connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    case "auth/account-exists-with-different-credential":
      return "This email is already registered with a different sign-in method. Use the method you used before.";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't turned on yet. (Firebase Console → Authentication → Sign-in method.)";
    case "auth/unauthorized-domain":
      return "This domain isn't authorised for sign-in. (Firebase Console → Authentication → Settings → Authorized domains.)";
    case "auth/expired-action-code":
    case "auth/invalid-action-code":
      return "This sign-in link has expired or was already used. Request a new one.";
    case "auth/missing-email":
      return "Enter the email address the link was sent to.";
    case "auth/requires-recent-login":
      return "Please log in again to do that.";
    default:
      return String(err?.message || "Something went wrong. Please try again.").replace("Firebase: ", "");
  }
}
