import test from "node:test";
import assert from "node:assert/strict";
import { parseProductHtml as startech } from "../lib/ingestion/adapters/startech.js";
import onix, { parseListingHtml as onixListing, parseProductHtml as onixProduct } from "../lib/ingestion/adapters/onix.js";

const TBA_PAGE = `<html><head>
<meta property="og:title" content="DeepCool PQ750M 80 PLUS Gold Modular Power Supply"/>
<meta property="product:price:amount" content="7800"/>
<meta property="product:availability" content="Out Of Stock"/></head><body>
<div class="topbar"><span class="price">1,111৳</span></div>
<div class="product-main"><h1>DeepCool PQ750M 80 PLUS Gold Modular Power Supply</h1>
<div class="short-info"><span>Price: <b>To be announced</b></span> <span>Status: <b>Out Of Stock</b></span> <span>Product Code: <b>24424</b></span></div></div>
<div class="similar"><h3>Similar Product</h3><div class="p-item"><h4>Another PSU</h4><div class="price">7,800৳</div></div></div>
</body></html>`;

const NORMAL_PAGE = `<html><head><meta property="og:title" content="Some SSD 512GB"/></head><body>
<div class="product-main"><h1>Some SSD 512GB</h1>
<div class="short-info"><span>Price: <b class="price">4,300৳ 4,900৳</b></span> <span>Status: <b>In Stock</b></span></div></div>
<div class="similar"><h3>Similar Product</h3><div class="p-item"><div class="price">999৳</div></div></div>
</body></html>`;

test("'To be announced' page: no price, wording kept, other products' prices ignored", () => {
  const p = startech(TBA_PAGE, "https://www.startech.com.bd/x");
  assert.equal(p.price, null);
  assert.equal(p.priceText, "To be announced");
});

test("normal page: own price wins over similar-product prices", () => {
  const p = startech(NORMAL_PAGE, "https://www.startech.com.bd/y");
  assert.equal(p.price, 4300);
  assert.equal(p.priceText, null);
});

test("Onix: a category/brand LISTING page is not a product", () => {
  const html = `<html><head><meta property="og:title" content="WD SSD Price in BD 2026"/></head><body>
  <h1>Western Digital Price in Bangladesh 2026</h1><div>Showing 1 to 16 of 22 (2 Pages)</div></body></html>`;
  assert.equal(onixProduct(html, "https://www.onixbd.com/western-digital-ssd"), null);
});

test("Onix listing fallback: brand/category links are not product links", () => {
  const html = `<html><body>
  <a href="https://www.onixbd.com/western-digital-ssd">Western Digital SSD</a>
  <a href="https://www.onixbd.com/ssd">SSD category page</a>
  <a href="https://www.onixbd.com/western-digital-sn750-250gb-ssd">WD Black SN750 250GB NVMe</a></body></html>`;
  const { links } = onixListing(html);
  assert.deepEqual(links.map((l) => l.url), ["https://www.onixbd.com/western-digital-sn750-250gb-ssd"]);
});
