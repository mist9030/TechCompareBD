// lib/ingestion/normalize.mjs
//
// Pure, dependency-free normalization helpers shared by every retailer
// adapter. Deliberately has NO Firebase / fetch / cheerio imports so it can
// be unit-tested with plain `node --test` (see test/normalize.test.mjs)
// without needing `npm install` first.

import { createHash } from "node:crypto";

/**
 * Parse a Bangladeshi Taka price string into an integer amount.
 * Handles "৳4,300", "4,300৳", "4300", "৳ 4,300.00" etc.
 * Returns null if no parseable number is found.
 */
/**
 * Parse a Bangladeshi Taka price string into an integer amount.
 *
 * Handles:
 *   ৳88,900
 *   ৳ 88,900
 *   88,900৳
 *   ৳88,900.00
 *   88,900
 *   4300
 *
 * Also tolerates the previously encountered mojibake form:
 *   à§³88,900
 *
 * Returns null if no parseable number is found.
 */
export function parseBDTPrice(input) {
  if (input == null) return null;

  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input) : null;
  }

  let cleaned = String(input)
    .replace(/\u00A0/g, " ")
    .trim();

  // Support both the real Bangladeshi Taka symbol and the
  // mojibake version that appeared in some extracted text.
  cleaned = cleaned
    .replace(/৳/g, "")
    .replace(/à§³/g, "")
    .replace(/[,\s]/g, "");

  const match = cleaned.match(/-?\d+(?:\.\d+)?/);

  if (!match) return null;

  const n = Number.parseFloat(match[0]);

  if (!Number.isFinite(n)) return null;

  return Math.round(n);
}

/**
 * Map a retailer's freeform availability/stock text to our canonical enum.
 */
export function normalizeAvailability(text) {
  if (!text) return "unknown";
  const t = String(text).trim().toLowerCase();
  if (t.includes("in stock") || t.includes("in-stock")) return "in_stock";
  if (t.includes("out of stock") || t.includes("out-of-stock") || t.includes("stock out")) return "out_of_stock";
  if (t.includes("pre order") || t.includes("pre-order") || t.includes("preorder")) return "preorder";
  if (t.includes("upcoming") || t.includes("up coming")) return "preorder";
  return "unknown";
}

// Maps a retailer's raw spec label (lowercased, trimmed) to the canonical
// spec key our frontend expects (see lib/catalog.js SPEC_GROUPS). Extend
// this per-category as more retailers/categories are added.
export const SPEC_LABEL_MAP = {
  cpu: {
    "socket": "Socket",
    "socket supported": "Socket",
    "cpu socket": "Socket",
    "cores": "Cores",
    "cpu cores": "Cores",
    "threads": "Threads",
    "cpu threads": "Threads",
    "base frequency": "Base Clock",
    "base clock": "Base Clock",
    "base clock speed": "Base Clock",
    "maximum turbo frequency": "Boost Clock",
    "max turbo frequency": "Boost Clock",
    "boost clock": "Boost Clock",
    "turbo frequency max": "Boost Clock",
    "default tdp": "TDP",
    "tdp": "TDP",
  },
  gpu: {
    "boost clock": "Boost Clock",
    "gpu clock": "Boost Clock",
    "memory": "Memory",
    "memory size": "Memory",
    "vram": "Memory",
    "memory bus": "Memory Bus",
    "memory interface": "Memory Bus",
    "recommended psu": "Recommended PSU",
    "power connector": "Power Connector",
    "length": "Length",
    "card length": "Length",
  },
  ram: {
    "capacity": "Capacity",
    "speed": "Speed",
    "memory speed": "Speed",
    "cas latency": "CAS Latency",
    "timing": "CAS Latency",
    "voltage": "Voltage",
    "heat spreader": "Heat Spreader",
  },
  ssd: {
    "capacity": "Capacity",
    "interface": "Interface",
    "read speed": "Read Speed",
    "sequential read": "Read Speed",
    "write speed": "Write Speed",
    "sequential write": "Write Speed",
    "form factor": "Form Factor",
  },
  mobo: {
    "socket": "Socket",
    "chipset": "Chipset",
    "memory": "Memory",
    "form factor": "Form Factor",
    "m.2 slots": "M.2 Slots",
  },
  psu: {
    "wattage": "Wattage",
    "power": "Wattage",
    "efficiency": "Efficiency",
    "80 plus": "Efficiency",
    "modular": "Modular",
    "fan": "Fan",
    "fan size": "Fan",
  },
  monitor: {
    "size": "Size",
    "screen size": "Size",
    "resolution": "Resolution",
    "refresh rate": "Refresh Rate",
    "panel": "Panel",
    "panel type": "Panel",
    "response time": "Response Time",
  },
  laptop: {
    "cpu": "CPU",
    "processor": "CPU",
    "processor model": "CPU",
    "processor brand": "Brand",
    "gpu": "GPU",
    "graphics": "GPU",
    "graphics model": "GPU",
    "ram": "RAM",
    "memory": "RAM",
    "storage": "Storage",
    "storage capacity": "Storage",
    "storage type": "Storage Type",
    "display": "Display",
    "display size": "Display",
    "display resolution": "Resolution",
  },
  peripheral: {
    "sensor": "Sensor",
    "buttons": "Buttons",
    "lighting": "Lighting",
    "connection": "Connection",
    "connectivity": "Connection",
  },
  case: {
    "form factor support": "Form Factor Support",
    "supported motherboard": "Form Factor Support",
  },
};

/**
 * Normalize a list of raw {label, value} spec pairs scraped from a retailer
 * page into our canonical spec keys for the given category. Unrecognized
 * labels are kept as-is (title-cased) so no data is silently dropped, but
 * only canonical keys are guaranteed to render in the existing product
 * detail UI (lib/catalog.js SPEC_GROUPS).
 */
export function normalizeSpecs(category, rawPairs) {
  const map = SPEC_LABEL_MAP[category] || {};
  const out = {};
  for (const { label, value } of rawPairs || []) {
    if (!label || value == null || value === "") continue;
    const key = map[String(label).trim().toLowerCase()];
    const cleanValue = String(value).replace(/\s+/g, " ").trim();
    if (key) {
      // Canonical key wins; don't overwrite if already set by an earlier,
      // more specific label mapping to the same key.
      if (!out[key]) out[key] = cleanValue;
    } else {
      const fallbackKey = String(label).trim();
      if (!out[fallbackKey]) out[fallbackKey] = cleanValue;
    }
  }
  return out;
}

/**
 * Stable content hash used for cheap change-detection between syncs — if
 * this hash is unchanged since the last check, we can skip writing an
 * update (still bump `checkedAt` if you want a "last verified" timestamp,
 * but avoid a spurious PriceHistory entry / updatedAt bump).
 */
export function buildSourceHash(fields) {
  const h = createHash("sha256");
  h.update(JSON.stringify(fields));
  return h.digest("hex").slice(0, 24);
}

/**
 * Very small brand/model cleanup — trims, collapses whitespace, and strips
 * a few retailer-specific marketing suffixes that hurt matching (e.g.
 * "(Rebox)", "(TRAY)"). Intentionally conservative: we'd rather under-clean
 * than accidentally mangle a real model number.
 */
export function cleanText(s) {
  if (!s) return s;
  return String(s)
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeModelForMatching(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop parenthetical marketing text
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Product images
// ---------------------------------------------------------------------------

// Site logos, banners, icons and placeholders are never a product photo
// (e.g. Onix's default og:image "/image/catalog/website/og-logo.png").
const NOT_A_PRODUCT_IMAGE =
  /(^|[\/_.-])(og-)?logo|placeholder|no[-_]?image|default[-_]?image|banner|sprite|favicon|loader|payment|badge|avatar|emi[-_.]/i;

// "/image/x.jpg" + "https://shop.com/p" -> "https://shop.com/image/x.jpg"
export function absoluteUrl(src, base) {
  if (!src || typeof src !== "string") return null;
  try {
    return new URL(src.trim(), base).href;
  } catch {
    return null;
  }
}

// Absolute http(s) URL that is not a logo/banner/placeholder.
export function isUsableImage(url) {
  return (
    typeof url === "string" &&
    /^https?:\/\//i.test(url.trim()) &&
    !NOT_A_PRODUCT_IMAGE.test(url)
  );
}

// ---------------------------------------------------------------------------
// Product names from page titles
// ---------------------------------------------------------------------------

// "GUNNIR Intel Arc A750 Index 8G Graphics Card Price in Bangladesh"
//   -> "GUNNIR Intel Arc A750 Index 8G Graphics Card"
// Shops append "Price in BD/Bangladesh" (and sometimes their own name) to the
// page title; that is not part of the product's name.
export function cleanProductName(name) {
  return cleanText(name)
    .replace(/\s*[-\u2013\u2014|]?\s*\bprice\s+(?:in|of)\s+(?:bd|bangladesh)\b.*$/i, "")
    .replace(/\s*[-\u2013\u2014|]\s*(?:star\s*tech|skyland|ucc|onix(?:\s*computer)?|creatus|global\s*brand)\s*$/i, "")
    .trim();
}

// A category/brand LISTING page mistaken for a product, e.g.
// "WD SSD Price in BD 2026 - Western Digital NVMe & SATA | Onix Computer".
// Real product titles say "Price in Bangladesh" too (Star Tech), so only the
// listing style counts: a YEAR after it, or "price list".
export function looksLikeListingTitle(name) {
  const n = String(name || "");
  return (
    /\bprice\s+(?:in|of)\b[^|]{0,60}\b(?:bd|bangladesh)\s*(?:19|20)\d{2}\b/i.test(n) ||
    /\bprice\s+list\b/i.test(n)
  );
}
