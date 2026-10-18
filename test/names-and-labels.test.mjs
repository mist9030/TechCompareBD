import test from "node:test";
import assert from "node:assert/strict";
import { cleanProductName, looksLikeListingTitle } from "../lib/ingestion/normalize.mjs";
import { parseProductHtml as startech } from "../lib/ingestion/adapters/startech.js";

test("'Price in Bangladesh' is removed from page-title names", () => {
  assert.equal(cleanProductName("GUNNIR Intel Arc A750 Index 8G Graphics Card Price in Bangladesh"), "GUNNIR Intel Arc A750 Index 8G Graphics Card");
  assert.equal(cleanProductName("DeepCool PQ750M Power Supply - Price in BD | Star Tech"), "DeepCool PQ750M Power Supply");
  assert.equal(cleanProductName("Kingston NV2 1TB SSD - Star Tech"), "Kingston NV2 1TB SSD");
  assert.equal(cleanProductName("Plain Name 500GB"), "Plain Name 500GB");
});

test("Star Tech product titles are NOT treated as listing pages; Onix listing titles are", () => {
  assert.equal(looksLikeListingTitle("GUNNIR Intel Arc A750 Index 8G Graphics Card Price in Bangladesh"), false);
  assert.equal(looksLikeListingTitle("WD SSD Price in BD 2026 – Western Digital NVMe & SATA | Onix Computer"), true);
  assert.equal(looksLikeListingTitle("Gaming Laptop Price List"), true);
});

test("Star Tech layout seen on the real page: 'Price To be announced' (no colon) inside .product-short-info", () => {
  const html = `<html><head><meta property="og:title" content="GUNNIR Intel Arc A750 Index 8G Graphics Card Price in Bangladesh"/>
  <meta property="product:price:amount" content="31000.0000"/><meta property="product:availability" content="Out Of Stock"/></head><body>
  <div class="product-short-info"><h1>GUNNIR Intel Arc A750 Index 8GB GDDR6 Graphics Card</h1>
  <ul><li><span>Price</span><b>To be announced</b></li><li><span>Status</span><b>Out Of Stock</b></li><li><span>Product Code</span><b>42055</b></li></ul></div>
  <div class="similar-product"><div class="price">27,500৳</div><div class="price">24,900৳ 28,000৳</div></div></body></html>`;
  const p = startech(html, "https://www.startech.com.bd/g");
  assert.equal(p.price, null);
  assert.equal(p.priceText, "To be announced");
});
