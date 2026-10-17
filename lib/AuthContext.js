"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendEmailVerification,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthCtx = createContext(null);
const EMAIL_LINK_KEY = "techcompare:emailForSignIn";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // Firestore users/{uid} doc, includes role
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        setProfile(snap.exists() ? snap.data() : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Every sign-in method (password, Google, email link) must end up with a
  // users/{uid} document: it holds the role and the display name.
  async function ensureUserDoc(u, name) {
    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setProfile(snap.data());
      return snap.data();
    }
    const data = {
      name: name || u.displayName || (u.email || "").split("@")[0] || "User",
      email: u.email || "",
      role: "user",
      photoURL: u.photoURL || null,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    setProfile(data);
    return data;
  }

  // ---- email + password ---------------------------------------------------
  async function register(name, email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, name);
    // Best effort: a failed verification mail must not fail the sign-up.
    sendEmailVerification(cred.user).catch((err) => console.warn("Verification email not sent", err));
    return cred.user;
  }

  async function login(email, password, remember = true) {
    // "Remember me" off -> the session ends when the browser/tab is closed.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  // ---- Google ---------------------------------------------------------------
  async function loginWithGoogle(remember = true) {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
    return cred.user;
  }

  // ---- passwordless email link ---------------------------------------------
  async function sendLoginLink(email) {
    await sendSignInLinkToEmail(auth, email, {
      url: `${window.location.origin}/login`,
      handleCodeInApp: true,
    });
    window.localStorage.setItem(EMAIL_LINK_KEY, email);
  }

  function isLoginLink() {
    return typeof window !== "undefined" && isSignInWithEmailLink(auth, window.location.href);
  }

  // Finishes a sign-in started from an emailed link. If this browser doesn't
  // remember the address (link opened on another device) the caller has to
  // pass it in; otherwise an "auth/missing-email" error is thrown.
  async function completeLoginLink(email) {
    const address = email || window.localStorage.getItem(EMAIL_LINK_KEY);
    if (!address) {
      const err = new Error("Email needed");
      err.code = "auth/missing-email";
      throw err;
    }
    const cred = await signInWithEmailLink(auth, address, window.location.href);
    window.localStorage.removeItem(EMAIL_LINK_KEY);
    await ensureUserDoc(cred.user);
    return cred.user;
  }

  async function logout() {
    await signOut(auth);
  }

  // Re-read users/{uid} so the header/profile show an edited name immediately.
  async function refreshProfile() {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    setProfile(snap.exists() ? snap.data() : null);
  }

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === "admin",
    register,
    login,
    loginWithGoogle,
    resetPassword,
    sendLoginLink,
    isLoginLink,
    completeLoginLink,
    logout,
    refreshProfile,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
