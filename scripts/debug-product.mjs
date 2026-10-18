// Shows EXACTLY what the scraper sees on one product page.
//
//   node scripts/debug-product.mjs startech https://www.startech.com.bd/gunnir-intel-arc-a750-index-8g-graphics-card
//   node scripts/debug-product.mjs onix     https://www.onixbd.com/hp-ex900-250gb-ssd
//   node scripts/debug-product.mjs startech saved-page.html      (a page saved from the browser)
//
// shop = startech | onix | ucc | skyland | creatus | globalbrand
import fs from "node:fs";
import * as cheerio from "cheerio";
import { fetchHtml, productInfoScope, extractProductPrice } from "../lib/ingestion/adapters/shared.js";

const [shop, target] = process.argv.slice(2);
if (!shop || !target) {
  console.log("usage: node scripts/debug-product.mjs <shop> <url | saved.html>");
  process.exit(1);
}

const adapter = await import(`../lib/ingestion/adapters/${shop}.js`);
const isFile = !/^https?:\/\//i.test(target);
const html = isFile ? fs.readFileSync(target, "utf8") : await fetchHtml(target);
if (!isFile) {
  // Keep exactly what the scraper downloaded, so it can be inspected/shared.
  const out = `debug-${shop}.html`;
  fs.writeFileSync(out, html);
  console.log(`(saved the downloaded page as ${out}, ${html.length} characters)`);
}
const url = isFile ? `https://example.test/${shop}` : target;
const $ = cheerio.load(html);

console.log("\n=== PRODUCT BLOCK the scraper looks at ===");
const scope = productInfoScope($);
if (!scope) console.log("(no <h1> found)");
else {
  console.log("container:", `<${scope.get(0).tagName} class="${scope.attr("class") || ""}" id="${scope.attr("id") || ""}">`);
  console.log("text size:", scope.text().replace(/\s+/g, " ").length, "characters");
  const full = scope.text().replace(/\s+/g, " ").trim();
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const at = full.indexOf(h1);
  console.log("text right after the title:\n  ", full.slice(at >= 0 ? at + h1.length : 0).slice(0, 300));
}

console.log("\n=== every .price element on the page ===");
$(".price").each((i, el) => {
  const similar = $(el).closest('[class*="similar"], [class*="related"], [class*="slider"], [class*="carousel"], [class*="swiper"]').length > 0;
  const insideScope = scope ? scope.find(el).length > 0 : false;
  console.log(`#${i + 1} "${$(el).text().replace(/\s+/g, " ").trim().slice(0, 40)}"  inside product block: ${insideScope}  inside similar/slider block: ${similar}`);
});

console.log("\n=== images ===");
console.log("og:image =", $('meta[property="og:image"]').attr("content"));

console.log("\n=== where the price came from ===");
const metaRaw = $('meta[property="product:price:amount"]').attr("content");
console.log("product:price:amount meta tag =", metaRaw ?? "(none)");
console.log("product:availability meta tag =", $('meta[property="product:availability"]').attr("content") ?? "(none)");
const dbg = extractProductPrice($, ".price, #product .price, .product-info .price", {
  metaPrice: metaRaw ? Number(String(metaRaw).replace(/[^0-9.]/g, "")) || null : null,
  availabilityText: $('meta[property="product:availability"]').attr("content") || "",
});
console.log(dbg);

console.log("\n=== RESULT of the adapter ===");
const r = adapter.parseProductHtml(html, url);
if (!r) {
  console.log("adapter returned NULL -> a sync would SKIP this product (no name / not a product page)");
} else {
  console.log({ name: r.name, price: r.price, previousPrice: r.previousPrice, priceText: r.priceText, availability: r.availabilityText, images: r.images });
}
