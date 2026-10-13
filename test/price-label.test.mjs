import test from "node:test";
import assert from "node:assert/strict";
import { extractPriceLabel } from "../lib/ingestion/adapters/shared.js";
import { parseProductHtml } from "../lib/ingestion/adapters/ucc.js";
import fs from "node:fs";
test("extractPriceLabel: keeps the shop's own no-price wording", () => {
assert.equal(extractPriceLabel("Up Coming"), "Up Coming");
assert.equal(extractPriceLabel(" Call For Price "), "Call For Price");
assert.equal(extractPriceLabel("To Be Announced"), "To Be Announced");
assert.equal(extractPriceLabel("Model: X Stock: Call For Price Brand: Y 123"), "Call For Price");
});
test("extractPriceLabel: nothing to report when there is no wording", () => {
assert.equal(extractPriceLabel(""), null);
assert.equal(extractPriceLabel(null), null);
assert.equal(extractPriceLabel("4,300\u09F3 4,900\u09F3"), null);
});
test("UCC 'Call For Price' page-> price null AND priceText kept", () => {
const html = fs.readFileSync(new URL("./fixtures/ucc-product-detail.html", import.meta.url), "utf8");
const p = parseProductHtml(html, "https://www.ucc.com.bd/x");
assert.equal(p.price, null);
assert.equal(p.priceText, "Call For Price");
});