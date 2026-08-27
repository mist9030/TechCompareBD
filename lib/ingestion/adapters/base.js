// lib/ingestion/adapters/base.js
//
// Interface every retailer adapter must implement. There's no abstract
// class enforcement here (kept as plain JSDoc + a runtime shape check) —
// adapters are plain objects, see adapters/startech.js for a real one.
//
// Why this shape: ingest.js (the orchestrator) is retailer-agnostic. Adding
// a new retailer means writing one new adapter file and registering it in
// registry.js — nothing in ingest.js, the API route, or the Firestore
// schema needs to change (see spec section 3: "Create a reusable adapter
// architecture").

/**
 * @typedef {object} DiscoveredLink
 * @property {string} url            Absolute product detail page URL.
 * @property {string} [previewName]  Name as shown on the listing page, if available.
 * @property {number} [previewPrice] Price as shown on the listing page, if available.
 */

/**
 * @typedef {object} RawSpecPair
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {object} ParsedProduct  Raw (pre-normalize.mjs) extraction from a
 *   product detail page. Adapters return this shape; lib/ingestion/ingest.js
 *   runs it through normalize.mjs before matching/writing.
 * @property {string} sourceProductId    Retailer SKU / internal product id.
 * @property {string} sourceUrl
 * @property {string} name
 * @property {string} [brand]
 * @property {string} [model]
 * @property {number} [price]            Current price, in BDT, already parsed to a number.
 * @property {number} [previousPrice]    "Regular"/pre-discount price if shown.
 * @property {string} [availabilityText] Raw text — normalize.mjs maps this to the canonical enum.
 * @property {string[]} [images]
 * @property {string} [shortDescription]
 * @property {RawSpecPair[]} [specs]
 */

/**
 * @typedef {object} RetailerAdapter
 * @property {string} id            Matches the `shops/{id}` document id, e.g. "startech".
 * @property {string} hostname      Used to auto-detect this adapter from a shop's `url` field.
 * @property {Array<{category: string, listingUrl: string}>} categorySources
 *   One entry per catalog category (see lib/catalog.js CAT_LABEL keys) this
 *   adapter knows how to discover. Not every retailer needs to cover all 10.
 * @property {(listingUrl: string, page: number) => Promise<{links: DiscoveredLink[], totalPages: number}>} discoverCategoryPage
 *   Fetch one page of a category listing and return the product links on it
 *   plus how many pages exist in total (so the orchestrator knows when to stop).
 * @property {(url: string) => Promise<ParsedProduct|null>} parseProductPage
 *   Fetch + parse a single product detail page. Returns null if the page
 *   doesn't look like a real product (e.g. redirected to a 404/search page)
 *   rather than throwing, so one bad URL doesn't fail the whole sync.
 */

/** Throws if `adapter` is missing required fields — used defensively in ingest.js. */
export function assertValidAdapter(adapter) {
  const required = ["id", "hostname", "categorySources", "discoverCategoryPage", "parseProductPage"];
  const missing = required.filter((k) => adapter?.[k] == null);
  if (missing.length) {
    throw new Error(`Adapter is missing required field(s): ${missing.join(", ")}`);
  }
}
