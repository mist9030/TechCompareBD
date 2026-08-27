// lib/ingestion/registry.js
//
// Maps a shop's hostname (from its `url` field, e.g. "startech.com.bd") to
// the adapter that knows how to scrape it. Admin only ever enters a name +
// website (spec section 2) — the adapter is auto-detected from here, never
// picked manually.
//
// Adding retailer #2, #3, ... (spec section 8/26 "add retailers one by
// one"): write lib/ingestion/adapters/<name>.js implementing the shape in
// adapters/base.js, then add one line below. Nothing else in the ingestion
// pipeline, API routes, or Firestore schema needs to change.

import startech from "./adapters/startech.js";
import ucc from "./adapters/ucc.js";
import onix from "./adapters/onix.js";
import creatus from "./adapters/creatus.js";
import globalbrand from "./adapters/globalbrand.js";
import { assertValidAdapter } from "./adapters/base.js";

const ADAPTERS = [startech, ucc, onix, creatus, globalbrand];

ADAPTERS.forEach(assertValidAdapter);

function hostnameOf(url) {
  if (!url) return null;
  try {
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^www\./, "").split("/")[0];
  }
}

/**
 * @param {string} shopUrl  The `url` field on a `shops/{id}` doc, e.g. "startech.com.bd".
 * @returns {import("./adapters/base.js").RetailerAdapter | null}
 */
export function resolveAdapterForShop(shopUrl) {
  const host = hostnameOf(shopUrl);
  if (!host) return null;
  return ADAPTERS.find((a) => host === a.hostname || host.endsWith(`.${a.hostname}`)) || null;
}

export function listAdapters() {
  return ADAPTERS.map((a) => ({ id: a.id, hostname: a.hostname, categories: a.categorySources.map((c) => c.category) }));
}
