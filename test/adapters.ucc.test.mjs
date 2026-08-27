// test/adapters.ucc.test.mjs
//
// See the note at the top of test/adapters.startech.test.mjs — same
// applies here: needs `npm install` (cheerio) which this sandbox can't do
// (no outbound network). Written and reasoned through against the real
// fixtures in test/fixtures/ucc-*.html, not yet executed. Run
// `npm install && npm test` to execute it for real.
//
// This one specifically exercises the path startech's tests don't:
// UCC has NO og:/product: meta tags, so parseProductHtml must fall back
// entirely to visible content (findLabeledLine + table specs), including
// splitting a compound cell ("Base Clock 4.7GHz    Max. Boost Clock Up to
// 5.3GHz") into two separate canonical spec fields.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseListingHtml, parseProductHtml } from "../lib/ingestion/adapters/ucc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

test("parseListingHtml: extracts links + pagination even with 'Call For Price'/'Out Of Stock' cards", () => {
  const { links, totalPages } = parseListingHtml(fixture("ucc-listing.html"));
  assert.equal(totalPages, 4);
  assert.equal(links.length, 3);

  const ryzen = links.find((l) => l.url.includes("amd-ryzen-5-7600x"));
  assert.ok(ryzen);
  assert.equal(ryzen.previewPrice, null); // "Call For Price" has no parseable number — correctly null, not fabricated

  const withPrice = links.find((l) => l.url.includes("ryzen-7-5700x"));
  assert.equal(withPrice.previewPrice, 21500);
});

test("parseProductHtml: falls back to visible Brand/Model/SKU/Stock lines with no meta tags present", () => {
  const product = parseProductHtml(fixture("ucc-product-detail.html"), "https://www.ucc.com.bd/amd-ryzen-5-7600x-processor");
  assert.ok(product);
  assert.equal(product.name, "AMD Ryzen 5 7600X Processor");
  assert.equal(product.brand, "AMD");
  assert.equal(product.model, "Ryzen 5 7600X");
  assert.equal(product.sourceProductId, "AMD ryzen 5 7600X"); // the SKU line, used as source id
  assert.equal(product.availabilityText, "Call For Price");
});

test("parseProductHtml: 'Call For Price' correctly yields no price, rather than a fabricated 0", () => {
  const product = parseProductHtml(fixture("ucc-product-detail.html"), "https://www.ucc.com.bd/amd-ryzen-5-7600x-processor");
  assert.equal(product.price, null);
});

test("parseProductHtml: splits a compound spec cell into separate canonical fields", () => {
  const product = parseProductHtml(fixture("ucc-product-detail.html"), "https://www.ucc.com.bd/amd-ryzen-5-7600x-processor");
  const specMap = Object.fromEntries(product.specs.map((s) => [s.label.toLowerCase(), s.value]));

  // The live cell was one string: "Base Clock 4.7GHz    Max. Boost Clock Up
  // to 5.3GHz" — must come out as two separate fields, not one blob,
  // since Boost Clock is a distinct field in lib/catalog.js's CPU spec group.
  assert.equal(specMap["base clock"], "4.7GHz");
  assert.ok(Object.keys(specMap).some((k) => k.includes("boost clock")));
  assert.equal(specMap["cores"], "6");
  assert.equal(specMap["threads"], "12");
  assert.equal(specMap["socket"], "AM5");
  assert.equal(specMap["default tdp"], "105W");
});

test("parseProductHtml: section-header table rows (single <th>) don't pollute the spec list", () => {
  const product = parseProductHtml(fixture("ucc-product-detail.html"), "https://www.ucc.com.bd/amd-ryzen-5-7600x-processor");
  const labels = product.specs.map((s) => s.label.toLowerCase());
  assert.ok(!labels.includes("cpu specification"));
  assert.ok(!labels.includes("warranty information"));
});
