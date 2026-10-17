// lib/ingestion/adapters/globalbrand.js
//
// Adapter for globalbrand.com.bd (Global Brand PLC). HIGHEST confidence of
// the five adapters — a real product page was fetched live end-to-end
// during development (see MILESTONE_REPORT.md round 2) and confirmed:
//   - Full og:/product: meta tag suite, INCLUDING an extra `og:brand` tag
//     not seen on the other retailers (used as a brand fallback below).
//   - Price format differs from the other four: leading currency symbol
//     with two decimals ("৳79,500.00") rather than trailing/no-decimals
//     ("79,500৳") — shared.js's parsePricePair() handles both.
//   - A real grouped <table> specification block ("Processor Model",
//     "RAM", "Storage Capacity", "Display Size", etc.) — normalize.mjs's
//     laptop SPEC_LABEL_MAP was extended with these exact real labels.
//   - One fetched product URL (from a search result) 404'd live — a
//     reminder that "the URL was correct when indexed" doesn't guarantee
//     "still a live product"; ingest.js's per-item try/catch (skip +
//     log, don't fail the whole sync) already covers this.
//
// SCOPE NOTE: Global Brand PLC is primarily an official brand distributor
// (Asus/Lenovo/Dell/Acer/Apple laptops, monitors) rather than a general
// component retailer — but their site does carry a real Components
// section (Processor/Motherboard/GPU/RAM/SSD/PSU/Casing, mostly Asus/PNY/
// NZXT/Arktek brand items), so all 10 categories are wired up with real,
// verified URLs below rather than narrowing scope.

import * as cheerio from "cheerio";
import { parseBDTPrice, cleanText } from "../normalize.mjs";
import { fetchHtml, metaContent, parseSpecTable, parsePricePair, findLabeledLine, extractPriceLabel, extractProductPrice } from "./shared.js";

const BASE_URL = "https://www.globalbrand.com.bd";

export const categorySources = [
  { category: "cpu", listingUrl: `${BASE_URL}/components/processor` },
  { category: "gpu", listingUrl: `${BASE_URL}/components/graphics-card` },
  { category: "ram", listingUrl: `${BASE_URL}/components/ram` },
  { category: "ssd", listingUrl: `${BASE_URL}/components/ssd` },
  { category: "mobo", listingUrl: `${BASE_URL}/components/motherboard` },
  { category: "psu", listingUrl: `${BASE_URL}/components/power-supply` },
  { category: "case", listingUrl: `${BASE_URL}/components/casing` },
  { category: "monitor", listingUrl: `${BASE_URL}/all-monitor` },
  { category: "laptop", listingUrl: `${BASE_URL}/all-laptop` },
  { category: "peripheral", listingUrl: `${BASE_URL}/accessories/mouse` },
];

export function parseListingHtml(html) {
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();

  $(".product-thumb, .product-layout").each((_, el) => {
    const anchor = $(el).find(".caption h4 a, .caption h3 a, .name a").first();
    const href = anchor.attr("href");
    if (!href || seen.has(href)) return;
    seen.add(href);
    const priceText = $(el).find(".price").first().text();
    links.push({ url: href, previewName: cleanText(anchor.text()), previewPrice: parseBDTPrice(priceText) });
  });

  // Global Brand's listing cards render "Add to Cart" as JS-driven buttons
  // rather than plain product-name anchors in some templates (observed
  // live), so the generic any-link fallback matters more here than for
  // the OpenCart-standard retailers — same implementation, just flagged.
  if (links.length === 0) {
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());
      if (!href || !text || text.length < 8) return;
      if (!href.startsWith(BASE_URL)) return;
      if (seen.has(href)) return;
      if (/\/(index\.php|components\/|accessories\/|monitor\/|laptop\/|desktop\/|information|account)/.test(href.replace(BASE_URL, "")))
        return;
      seen.add(href);
      links.push({ url: href, previewName: text, previewPrice: null });
    });
  }

  // Observed live: "Showing 1 to 20 of 591 (30 Pages)".
  const bodyText = $("body").text();
  const pagesMatch = bodyText.match(/\((\d+)\s*Pages?\)/i);
  return { links, totalPages: (pagesMatch ? parseInt(pagesMatch[1], 10) : 1) || 1 };
}

export async function discoverCategoryPage(listingUrl, page = 1) {
  const url = page > 1 ? `${listingUrl}?page=${page}` : listingUrl;
  return parseListingHtml(await fetchHtml(url));
}

export function parseProductHtml(html, url) {
  const $ = cheerio.load(html);

  const name = metaContent($, "og:title") || cleanText($("h1").first().text());
  if (!name) return null;

  // og:brand is this retailer's own (non-standard but real, verified)
  // addition — try it before the more common product:brand.
  const brand = metaContent($, "og:brand") || metaContent($, "product:brand") || findLabeledLine($, /^brand:/i);
  const sourceProductId = metaContent($, "product:retailer_item_id") || findLabeledLine($, /^(sku|model):/i);
  const availabilityText = metaContent($, "product:availability");
  const mainImage = metaContent($, "og:image");
  const shortDescription = $('meta[name="description"]').attr("content") || null;
  const metaPrice = parseBDTPrice(metaContent($, "product:price:amount") || metaContent($, "og:price:amount"));
  const model = sourceProductId; // retailer_item_id IS the model string here (verified live), not a separate SKU.

  // Price of THIS product only (see extractProductPrice in shared.js).
  const { price, previousPrice, priceText } = extractProductPrice(
    $,
    ".price, #product .price, .product-info .price",
    { metaPrice, availabilityText }
  );


  const specContainer = $('#tab-specification, .tab-specification, [id*="specification" i]').first();
  const specs = parseSpecTable($, specContainer.length ? specContainer : $("body"));

  return {
    sourceProductId: sourceProductId || url,
    sourceUrl: url,
    name,
    brand,
    model,
    price,
    previousPrice,
    priceText,
    availabilityText,
    images: mainImage ? [mainImage] : [],
    shortDescription,
    specs,
  };
}

export async function parseProductPage(url) {
  return parseProductHtml(await fetchHtml(url), url);
}

export default {
  id: "globalbrand",
  hostname: "globalbrand.com.bd",
  categorySources,
  discoverCategoryPage,
  parseProductPage,
};
