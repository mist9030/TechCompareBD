// test/adapters.startech.test.mjs
//
// NOTE ON RUNNING THIS FILE: it imports cheerio (via
// lib/ingestion/adapters/startech.js), which is not installed in the
// sandbox this pipeline was built in (no outbound network access for
// `npm install`). It was written and reasoned through carefully against
// the real fixtures in test/fixtures/, but has NOT been executed yet.
// Run `npm install && npm test` in a real dev environment to execute it —
// see MILESTONE_REPORT.md for the full status breakdown of what has vs.
// hasn't been run.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseListingHtml, parseProductHtml } from "../lib/ingestion/adapters/startech.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

test("parseListingHtml: extracts product links, names, preview prices, and page count", () => {
  const html = fixture("startech-listing.html");
  const { links, totalPages } = parseListingHtml(html);

  assert.equal(totalPages, 7);
  assert.equal(links.length, 4);

  const ryzen = links.find((l) => l.url.includes("amd-ryzen-3-2200g-processor"));
  assert.ok(ryzen, "expected the Ryzen 3 2200G card to be discovered");
  assert.equal(ryzen.previewName, "AMD Ryzen 3 2200G Quad-Core Processor With Radeon Vega 8 Graphics");
  assert.equal(ryzen.previewPrice, 4300); // the discounted/current price, not the strikethrough one

  const noDiscount = links.find((l) => l.url.includes("intel-core-i3-12100t"));
  assert.ok(noDiscount);
  assert.equal(noDiscount.previewPrice, 15500);
});

test("parseProductHtml: extracts core fields from og:/product: meta tags", () => {
  const html = fixture("startech-product-detail.html");
  const url = "https://www.startech.com.bd/amd-ryzen-3-2200g-processor";
  const product = parseProductHtml(html, url);

  assert.ok(product, "expected a parsed product, not null");
  assert.equal(product.name, "AMD Ryzen 3 2200G Quad-Core Processor With Radeon Vega 8 Graphics");
  assert.equal(product.brand, "AMD");
  assert.equal(product.sourceProductId, "7217");
  assert.equal(product.availabilityText, "In Stock");
  assert.equal(product.images[0], "https://www.startech.com.bd/image/cache/catalog/processor/AMD/ryzen-3/ryzen-3-500x500.jpg");
});

test("parseProductHtml: prefers the visible discounted price over the meta price", () => {
  const html = fixture("startech-product-detail.html");
  const product = parseProductHtml(html, "https://www.startech.com.bd/amd-ryzen-3-2200g-processor");
  // Visible price panel: "4,300৳ 4,900৳" (current, then regular).
  // product:price:amount meta is 4900 (the pre-discount price) — the
  // visible current price should win since it's what a buyer actually pays.
  assert.equal(product.price, 4300);
  assert.equal(product.previousPrice, 4900);
});

test("parseProductHtml: extracts a model number from the 'Model: ...' bullet", () => {
  const html = fixture("startech-product-detail.html");
  const product = parseProductHtml(html, "https://www.startech.com.bd/amd-ryzen-3-2200g-processor");
  assert.equal(product.model, "Ryzen 3 2200G");
});

test("parseProductHtml: extracts specification label/value pairs, including non-numeric values", () => {
  const html = fixture("startech-product-detail.html");
  const product = parseProductHtml(html, "https://www.startech.com.bd/amd-ryzen-3-2200g-processor");

  const specMap = Object.fromEntries(product.specs.map((s) => [s.label.toLowerCase(), s.value]));
  assert.equal(specMap["base frequency"], "3.5GHz");
  assert.equal(specMap["cores"], "4");
  assert.equal(specMap["threads"], "4");
  assert.equal(specMap["default tdp"], "65W");
  // Non-numeric value — this is the case the known-label-prefix matching
  // (as opposed to the plain digit-starts-value regex) is specifically for.
  assert.ok(
    Object.entries(specMap).some(([k, v]) => k.includes("graphics") && v.includes("Vega")),
    "expected a non-numeric spec value (Processor Graphics) to be captured"
  );
});

test("parseProductHtml: returns null for a page with no product title (defensive, doesn't throw)", () => {
  const product = parseProductHtml("<html><body><p>Not a product</p></body></html>", "https://example.com/x");
  assert.equal(product, null);
});
