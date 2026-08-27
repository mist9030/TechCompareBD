// lib/ingestion/adapters/creatus.js
//
// Adapter for creatus.com.bd (Creatus Computer). Real category URLs and
// listing content verified via live research — confirmed OpenCart
// (`index.php?route=...`), confirmed full og: meta tag suite at the
// category-listing level (og:title/description/image/type/url), and the
// listing cards' price format ("14,900৳ 15,500৳" / "Save: 600৳ (4%)") was
// directly observed. Same confidence profile as onix.js: meta-first with
// a visible-content fallback, since only the category page (not an
// individual product page) was fetched live during development.

import * as cheerio from "cheerio";
import { parseBDTPrice, cleanText } from "../normalize.mjs";
import { fetchHtml, metaContent, parseSpecTable, parsePricePair, findLabeledLine } from "./shared.js";

const BASE_URL = "https://www.creatus.com.bd";

export const categorySources = [
  { category: "cpu", listingUrl: `${BASE_URL}/processor` },
  { category: "gpu", listingUrl: `${BASE_URL}/graphics-card` },
  { category: "ram", listingUrl: `${BASE_URL}/desktop-ram` },
  { category: "ssd", listingUrl: `${BASE_URL}/ssd` },
  { category: "mobo", listingUrl: `${BASE_URL}/motherboard` },
  { category: "psu", listingUrl: `${BASE_URL}/power-supply` },
  { category: "case", listingUrl: `${BASE_URL}/casing` },
  { category: "monitor", listingUrl: `${BASE_URL}/monitor` },
  { category: "laptop", listingUrl: `${BASE_URL}/laptops` },
  { category: "peripheral", listingUrl: `${BASE_URL}/mouse` },
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

  if (links.length === 0) {
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());
      if (!href || !text || text.length < 8) return;
      if (!href.startsWith(BASE_URL)) return;
      if (seen.has(href)) return;
      if (/\/(index\.php|category|information|account)/.test(href)) return;
      seen.add(href);
      links.push({ url: href, previewName: text, previewPrice: null });
    });
  }

  // Observed live: "Showing 1 to 20 of 332 (17 Pages)".
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

  const brand = metaContent($, "product:brand") || findLabeledLine($, /^brand:/i);
  const sourceProductId = metaContent($, "product:retailer_item_id") || findLabeledLine($, /^(sku|product code):/i);
  const availabilityText = metaContent($, "product:availability") || findLabeledLine($, /^(stock|availability):/i);
  const mainImage = metaContent($, "og:image");
  const shortDescription = $('meta[name="description"]').attr("content") || null;
  const metaPrice = parseBDTPrice(metaContent($, "product:price:amount"));
  const model = findLabeledLine($, /^model:/i);

  const priceBlockText = $(".price, #product .price, .product-info .price").first().text();
  let { price, previousPrice } = parsePricePair(priceBlockText);
  if (price == null) price = metaPrice;

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
  id: "creatus",
  hostname: "creatus.com.bd",
  categorySources,
  discoverCategoryPage,
  parseProductPage,
};
