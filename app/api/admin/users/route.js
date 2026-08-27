// app/api/admin/users/route.js
//
// The prototype's admin nav has a "Users" section (Insights group) that
// the built app never implemented. Deliberately NOT done by loosening
// firestore.rules to let any signed-in client list/write other users'
// role fields — that would be a real privilege-escalation hole (a normal
// user could otherwise script a client-side write to grant themselves
// admin). Same pattern as the ingestion routes: verify admin server-side
// with the Admin SDK, which bypasses rules by design and is the actual
// authorization boundary here.

import { NextResponse } from "next/server";
import { requireAdmin, getAdminDb } from "@/lib/ingestion/firestoreAdmin";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 401 });
  }
  const db = getAdminDb();
  const snap = await db.collection("users").get();
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ users });
}

export async function POST(request) {
  let caller;
  try {
    caller = await requireAdmin(request);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.uid || !body?.role) {
    return NextResponse.json({ error: "uid and role are required" }, { status: 400 });
  }
  if (!["user", "admin"].includes(body.role)) {
    return NextResponse.json({ error: 'role must be "user" or "admin"' }, { status: 400 });
  }
  if (body.uid === caller.uid && body.role !== "admin") {
    return NextResponse.json({ error: "You can't demote your own account." }, { status: 400 });
  }

  const db = getAdminDb();
  await db.collection("users").doc(body.uid).update({ role: body.role });
  return NextResponse.json({ ok: true });
}
