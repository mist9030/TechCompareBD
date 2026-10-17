import test from "node:test";
import assert from "node:assert/strict";
import { parseProductHtml as startech } from "../lib/ingestion/adapters/startech.js";
import { parseProductHtml as onix } from "../lib/ingestion/adapters/onix.js";
import { isUsableImage, absoluteUrl } from "../lib/ingestion/normalize.mjs";

// The product block and the "Similar Product" list live in ONE big wrapper, and
// the list comes first in the HTML (worst case for "first .price on the page").
const BIG_WRAPPER_TBA = `<html><body>
<div class="page">
  <div class="similar-products"><div class="p-item"><span class="price">26,900৳</span></div></div>
  <div class="main"><h1>GUNNIR Intel Arc A750 Index 8GB GDDR6 Graphics Card</h1>
    <span>Price: <b>To be announced</b></span> <span>Status: <b>Out Of Stock</b></span> <span>Product Code: <b>42055</b></span>
  </div>
  <div class="sidebar"><div class="similar"><span class="price">38,000৳</span></div></div>
</div></body></html>`;

test("price of another product is never used, even if it is the first .price in the page", () => {
  const p = startech(BIG_WRAPPER_TBA, "https://www.startech.com.bd/g");
  assert.equal(p.price, null);
  assert.equal(p.priceText, "To be announced");
});

const ONIX_SOLD_OUT = `<html><head><meta property="og:image" content="/image/catalog/website/og-logo.png"/></head><body>
<img src="/image/catalog/website/logo.png" alt="Onix">
<div class="product"><h1>HP EX900 M.2 250GB PCIe NVMe Internal SSD</h1>
<div>Out of Stock</div><div>Model: EX900 250GB</div>
<div class="price">0৳</div>
<a class="thumbnail" href="/image/cache/catalog/products/hp-ex900-1000x1000.jpg"><img src="/image/cache/catalog/products/hp-ex900-80x80.jpg" alt="HP EX900 M.2 250GB PCIe NVMe Internal SSD"></a>
</div></body></html>`;

test("Onix sold-out item shows 0৳: no price and NOT labelled 'Out Of Stock'", () => {
  const p = onix(ONIX_SOLD_OUT, "https://www.onixbd.com/hp-ex900-250gb-ssd");
  assert.equal(p.price, null);
  assert.equal(p.priceText, null);
});

test("Onix photo: gallery image (absolute), never the og:image site logo", () => {
  const p = onix(ONIX_SOLD_OUT, "https://www.onixbd.com/hp-ex900-250gb-ssd");
  assert.deepEqual(p.images, ["https://www.onixbd.com/image/cache/catalog/products/hp-ex900-1000x1000.jpg"]);
});

test("Onix page with only the logo as image -> no image at all", () => {
  const html = `<html><head><meta property="og:image" content="/image/catalog/website/og-logo.png"/></head><body>
  <h1>Some Product 500GB</h1><div class="price">1,000৳</div></body></html>`;
  assert.deepEqual(onix(html, "https://www.onixbd.com/some-product-500gb").images, []);
});

test("image helpers", () => {
  assert.equal(isUsableImage("https://x.com/image/catalog/website/og-logo.png"), false);
  assert.equal(isUsableImage("/image/cache/catalog/a.jpg"), false); // relative
  assert.equal(isUsableImage("https://x.com/image/cache/catalog/a.jpg"), true);
  assert.equal(absoluteUrl("/image/a.jpg", "https://x.com/p"), "https://x.com/image/a.jpg");
});
