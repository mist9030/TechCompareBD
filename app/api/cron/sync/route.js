// app/api/cron/sync/route.js
//
// Scheduled/automatic sync trigger (spec section 15/16: "design so future
// automatic sync can be added without redesigning the catalog... every 6
// hours: Retailer A -> discover changes -> ingest -> update offers ->
// record price changes, then Retailer B -> same process").
//
// This is meant to be called by an external scheduler (Vercel Cron, a
// GitHub Actions workflow on a schedule, a plain server cron + curl —
// anything that can hit an HTTPS endpoint on a timer), NOT by a logged-in
// admin, so it can't use a Firebase ID token like /api/admin/sync does.
// Auth is a shared secret instead, checked the same way Vercel Cron's own
// docs recommend so it works with zero extra config on that platform:
//
//   Authorization: Bearer <CRON_SECRET env var>
//
// USAGE
// -----
// Scoped (recommended for production): one call per shop (optionally
// restricted to a few categories), so each invocation finishes well within
// a serverless function's execution time limit and one slow retailer
// can't block the others:
//
//   GET /api/cron/sync?shopId=startech
//   GET /api/cron/sync?shopId=ucc&categories=cpu,gpu
//
// Unscoped (fine for a small catalog / local testing, but does every
// registered shop's every category in one request — can be slow):
//
//   GET /api/cron/sync
//
// See vercel.json.example for a staggered per-shop schedule.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/ingestion/firestoreAdmin";
import { runSync } from "@/lib/ingestion/ingest";
import { resolveAdapterForShop } from "@/lib/ingestion/registry";

export const runtime = "nodejs";
// Serverless hosts cap function duration (Vercel's exact limit depends on
// plan — check current docs). Keep each cron call scoped (one shop, maybe
// one category) rather than raising this indefinitely.
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the operator hasn't set one
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Set CRON_SECRET and call with header: Authorization: Bearer <CRON_SECRET>" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shopId");
  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",").filter(Boolean) : undefined;

  try {
    if (shopId) {
      const summary = await runSync({ shopId, categories });
      return NextResponse.json({ shopId, ...summary });
    }

    // Unscoped: every shop with a registered adapter, one after another.
    const db = getAdminDb();
    const shopsSnap = await db.collection("shops").get();
    const results = [];
    for (const doc of shopsSnap.docs) {
      const shop = { id: doc.id, ...doc.data() };
      if (!resolveAdapterForShop(shop.url)) continue; // no adapter -> not our concern here
      try {
        results.push({ shopId: shop.id, ...(await runSync({ shopId: shop.id })) });
      } catch (err) {
        results.push({ shopId: shop.id, error: String(err.message || err) });
      }
    }
    return NextResponse.json({ shopsSynced: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request);
}
export async function POST(request) {
  return handle(request);
}
