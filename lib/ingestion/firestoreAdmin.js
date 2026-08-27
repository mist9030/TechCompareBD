// lib/ingestion/firestoreAdmin.js
//
// Server-only Firebase Admin SDK.
//
// Used by:
// - ingestion pipeline
// - /api/admin/* routes
//
// IMPORTANT:
// Firebase Admin SDK bypasses Firestore security rules.
// Therefore admin API routes MUST call requireAdmin()
// before performing privileged operations.
//

import admin from "firebase-admin";
import fs from "node:fs";

// ============================================================
// SERVICE ACCOUNT
// ============================================================

function loadServiceAccount() {
  // Option 1:
  // Raw service-account JSON stored in environment variable.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT
      );
    } catch (err) {
      const error = new Error(
        "FIREBASE_SERVICE_ACCOUNT contains invalid JSON."
      );

      error.status = 500;
      error.code = "INVALID_SERVICE_ACCOUNT_JSON";

      throw error;
    }
  }

  // Option 2:
  // Path to service-account JSON file.
  const keyPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    "./firebase/service-account.json";

  if (!fs.existsSync(keyPath)) {
    const error = new Error(
      `No Firebase Admin credentials found. Set ` +
        `FIREBASE_SERVICE_ACCOUNT or ` +
        `FIREBASE_SERVICE_ACCOUNT_JSON. ` +
        `Checked: ${keyPath}`
    );

    error.status = 500;
    error.code = "MISSING_SERVICE_ACCOUNT";

    throw error;
  }

  try {
    return JSON.parse(
      fs.readFileSync(keyPath, "utf8")
    );
  } catch (err) {
    const error = new Error(
      `Could not read Firebase service-account JSON: ${err.message}`
    );

    error.status = 500;
    error.code = "INVALID_SERVICE_ACCOUNT_FILE";

    throw error;
  }
}

// ============================================================
// ADMIN APP
// ============================================================

let app = null;

export function getAdminApp() {
  if (app) {
    return app;
  }

  if (admin.apps.length > 0) {
    app = admin.app();
    return app;
  }

  const serviceAccount = loadServiceAccount();

  app = admin.initializeApp({
    credential:
      admin.credential.cert(serviceAccount),
  });

  return app;
}

// ============================================================
// FIRESTORE
// ============================================================

export function getAdminDb() {
  return getAdminApp().firestore();
}

// ============================================================
// AUTH
// ============================================================

export function getAdminAuth() {
  return getAdminApp().auth();
}

// ============================================================
// REQUIRE ADMIN
// ============================================================

/**
 * Verify Firebase ID token and require:
 *
 * users/{uid}.role === "admin"
 *
 * Throws:
 *
 * 401 -> missing/invalid/expired token
 * 403 -> authenticated user is not admin
 * 500 -> Firebase Admin configuration problem
 */
export async function requireAdmin(request) {
  // ----------------------------------------------------------
  // 1. Read Authorization header
  // ----------------------------------------------------------

  const authHeader =
    request.headers.get("authorization") || "";

  if (!authHeader) {
    const error = new Error(
      "Missing Authorization header."
    );

    error.status = 401;
    error.code = "MISSING_AUTH_HEADER";

    throw error;
  }

  // ----------------------------------------------------------
  // 2. Extract Bearer token
  // ----------------------------------------------------------

  const match =
    authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const error = new Error(
      "Invalid Authorization header. Expected: Bearer <Firebase ID token>."
    );

    error.status = 401;
    error.code = "INVALID_AUTH_HEADER";

    throw error;
  }

  const token = match[1].trim();

  if (!token) {
    const error = new Error(
      "Firebase ID token is empty."
    );

    error.status = 401;
    error.code = "EMPTY_ID_TOKEN";

    throw error;
  }

  // ----------------------------------------------------------
  // 3. Verify Firebase ID token
  // ----------------------------------------------------------

  let decoded;

  try {
    decoded =
      await getAdminAuth().verifyIdToken(token);
  } catch (err) {
    console.error(
      "[AUTH] Firebase ID token verification failed:",
      {
        code: err?.code,
        message: err?.message,
      }
    );

    const error = new Error(
      `Firebase ID token verification failed: ${
        err?.message || "Unknown authentication error"
      }`
    );

    error.status = 401;
    error.code =
      err?.code || "INVALID_ID_TOKEN";

    throw error;
  }

  // ----------------------------------------------------------
  // 4. Read user document
  // ----------------------------------------------------------

  let userDoc;

  try {
    userDoc =
      await getAdminDb()
        .collection("users")
        .doc(decoded.uid)
        .get();
  } catch (err) {
    console.error(
      "[AUTH] Failed to read admin user document:",
      {
        uid: decoded.uid,
        code: err?.code,
        message: err?.message,
      }
    );

    const error = new Error(
      `Failed to check admin role: ${
        err?.message || "Firestore read failed"
      }`
    );

    error.status = 500;
    error.code =
      err?.code || "ADMIN_ROLE_LOOKUP_FAILED";

    throw error;
  }

  // ----------------------------------------------------------
  // 5. Check admin role
  // ----------------------------------------------------------

  if (!userDoc.exists) {
    const error = new Error(
      "Authenticated Firebase user does not have a users document."
    );

    error.status = 403;
    error.code = "USER_DOCUMENT_NOT_FOUND";

    throw error;
  }

  const userData = userDoc.data() || {};

  if (userData.role !== "admin") {
    const error = new Error(
      `Admin role required. Current role: ${
        userData.role || "none"
      }`
    );

    error.status = 403;
    error.code = "ADMIN_ROLE_REQUIRED";

    throw error;
  }

  // ----------------------------------------------------------
  // 6. Success
  // ----------------------------------------------------------

  console.log(
    `[AUTH] Admin authenticated: ${decoded.uid}`
  );

  return {
    uid: decoded.uid,
    ...userData,
  };
}