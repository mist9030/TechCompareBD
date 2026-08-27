// app/api/admin/match-review/resolve/route.js
//
// POST { reviewId, action: "confirm" | "create_new" | "reject", productId? }
// Resolves one match_review doc. "confirm" requires productId (which
// existing product this listing actually is); "create_new" creates a
// canonical Product from the review's normalized payload — this is the
// one place outside of ingest.js's auto-match path that a Product gets
// created, and it's an explicit admin action, not silent automation.

import { NextResponse } from "next/server";
import { requireAdmin, getAdminDb } from "@/lib/ingestion/firestoreAdmin";
import { applyMatchToExistingProduct, createProductFromReview } from "@/lib/ingestion/ingest";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.reviewId || !body?.action) {
    return NextResponse.json({ error: "reviewId and action are required" }, { status: 400 });
  }

  const db = getAdminDb();
  const reviewRef = db.collection("match_review").doc(body.reviewId);
  const reviewSnap = await reviewRef.get();
  if (!reviewSnap.exists) {
    return NextResponse.json({ error: "Review item not found" }, { status: 404 });
  }
  const review = reviewSnap.data();
  const shop = { id: review.shopId, name: review.shopName };

  try {
    if (body.action === "confirm") {
      if (!body.productId) return NextResponse.json({ error: "productId is required for confirm" }, { status: 400 });
      await applyMatchToExistingProduct(body.productId, review.normalized, shop);
      await reviewRef.update({ status: "confirmed", resolvedProductId: body.productId });
      return NextResponse.json({ ok: true, productId: body.productId });
    }

    if (body.action === "create_new") {
      const newId = await createProductFromReview(review.normalized, shop);
      await reviewRef.update({ status: "created_new", resolvedProductId: newId });
      return NextResponse.json({ ok: true, productId: newId });
    }

    if (body.action === "reject") {
      await reviewRef.update({ status: "rejected" });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
