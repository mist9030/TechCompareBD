// app/api/admin/sync/route.js
//
// POST { shopId, categories? } — runs one ingestion sync for a shop.
// Server-side only (uses firebase-admin + cheerio, needs the Node runtime,
// not Edge). Requires a Firebase ID token for a user whose Firestore
// users/{uid}.role === "admin" (see requireAdmin in firestoreAdmin.js —
// this is the actual authorization boundary; Firestore rules alone can't
// cover this because the write happens via the Admin SDK, which bypasses
// rules by design).
//
// Called from app/admin/shops/page.js's "Sync Real Data" button.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/ingestion/firestoreAdmin";
import { runSync } from "@/lib/ingestion/ingest";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  try {
    const summary = await runSync({ shopId: body.shopId, categories: body.categories, dryRun: Boolean(body.dryRun) });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
