import * as cheerio from "cheerio";
import { parseBDTPrice, cleanText } from "../normalize.mjs";
import {
  fetchHtml,
  metaContent,
  parseSpecTable,
  parsePricePair,
  findLabeledLine,
  extractPriceLabel,
} from "./shared.js";

const BASE_URL = "https://www.skyland.com.bd";

export const categorySources = [
  { category: "cpu", listingUrl: `${BASE_URL}/processor` },
  { category: "gpu", listingUrl: `${BASE_URL}/component/graphics-card` },
  { category: "ram", listingUrl: `${BASE_URL}/component/desktop-ram` },
  { category: "ssd", listingUrl: `${BASE_URL}/ssd` },
  { category: "mobo", listingUrl: `${BASE_URL}/component/motherboard` },
  { category: "psu", listingUrl: `${BASE_URL}/power-supply` },
  { category: "case", listingUrl: `${BASE_URL}/casing` },
  { category: "monitor", listingUrl: `${BASE_URL}/monitor` },
  { category: "laptop", listingUrl: `${BASE_URL}/laptop-notebook` },
  { category: "peripheral", listingUrl: `${BASE_URL}/mouse` },
];

const NON_PRODUCT_PATHS =
  /\/(processor|graphics-card|desktop-ram|ssd|motherboard|power-supply|casing|monitor|laptop-notebook|mouse|keyboard|component|accessories|category|information|account|search|compare|wishlist|cart|checkout|pc-builder|brand|manufacturer)(\/|$|\?)/i;

const absoluteUrl = (href) => {
  if (!href) return null;
  try { return new URL(href, BASE_URL).href; } catch { return null; }
};

function isProductUrl(url) {
  return Boolean(url && url.startsWith(BASE_URL) && !NON_PRODUCT_PATHS.test(url));
}

function cardAnchor($, card) {
  const selectors = [
    ".caption h4 a", ".caption h3 a", ".caption a",
    ".product-thumb a[href]", ".product-image a[href]",
    "h4 a", "h3 a", "a[href]"
  ];
  for (const selector of selectors) {
    const nodes = card.find(selector);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes.eq(i);
      const href = absoluteUrl(a.attr("href"));
      const text = cleanText(a.text());
      if (href && text && text.length >= 8 && isProductUrl(href)) {
        return { href, text };
      }
    }
  }
  return null;
}

function cardPrice($, card) {
  for (const selector of [
    ".price-new", ".special", ".price", ".product-price", "[class*='price']"
  ]) {
    const node = card.find(selector).first();
    if (!node.length) continue;
    const pair = parsePricePair(node.text());
    if (pair.price != null) return pair.price;
    const direct = parseBDTPrice(node.text());
    if (direct != null) return direct;
  }
  return null;
}

export function parseListingHtml(html) {
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();

  for (const selector of [
    ".product-layout", ".product-thumb", ".product-item",
    ".product-grid .product-layout", ".product-list .product-layout",
    ".products .product-layout", ".products .product-item"
  ]) {
    $(selector).each((_, el) => {
      const found = cardAnchor($, $(el));
      if (!found || seen.has(found.href)) return;
      seen.add(found.href);
      links.push({
        url: found.href,
        previewName: found.text,
        previewPrice: cardPrice($, $(el)),
      });
    });
    if (links.length) break;
  }

  if (!links.length) {
    $("a[href]").each((_, el) => {
      const href = absoluteUrl($(el).attr("href"));
      const text = cleanText($(el).text());
      if (!href || !text || text.length < 10 || !isProductUrl(href) || seen.has(href)) return;
      if (/^(buy now|add to cart|compare|wishlist|view all|show all)$/i.test(text)) return;
      seen.add(href);
      links.push({ url: href, previewName: text, previewPrice: null });
    });
  }

  const body = cleanText($("body").text());
  const m = body.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+\d+\s+\((\d+)\s+Pages?\)/i)
       || body.match(/\((\d+)\s+Pages?\)/i);

  return { links, totalPages: (m ? parseInt(m[1], 10) : 1) || 1 };
}

export async function discoverCategoryPage(listingUrl, page = 1) {
  const url = page > 1 ? `${listingUrl}?page=${page}` : listingUrl;
  return parseListingHtml(await fetchHtml(url));
}

function labeled($, metaKey, labels) {
  const meta = metaContent($, metaKey);
  if (meta) return cleanText(meta);

  for (const label of labels) {
    const value = findLabeledLine($, new RegExp(`^${label}:`, "i"));
    if (value) return cleanText(value);
  }

  const lines = $("body").text().split(/\r?\n/).map(cleanText).filter(Boolean);
  for (const line of lines) {
    for (const label of labels) {
      const m = line.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "i"));
      if (m) return cleanText(m[1]);
    }
  }
  return null;
}

function mainPrice($) {
  // Scoped first: avoids unrelated price widgets/sidebar products.
  for (const selector of [
    "#product .price", "#content .price", ".product-info .price",
    ".product-details .price", ".product-page .price",
    ".price-container .price", ".product-price"
  ]) {
    const node = $(selector).first();
    if (!node.length) continue;
    const pair = parsePricePair(node.text());
    if (pair.price != null) return pair;
  }

  const body = cleanText($("body").text());
  const cash = body.match(/Cash Discount Price\s*[:\-]?\s*(?:৳\s*)?([\d,]+(?:\.\d+)?)/i);
  if (cash) return { price: parseBDTPrice(cash[1]), previousPrice: null };

  const price = body.match(/(?:^|\s)Price\s*:\s*(?:৳\s*)?([\d,]+(?:\.\d+)?)/im);
  const regular = body.match(/Regular Price\s*:\s*(?:৳\s*)?([\d,]+(?:\.\d+)?)/i);
  return {
    price: price ? parseBDTPrice(price[1]) : null,
    previousPrice: regular ? parseBDTPrice(regular[1]) : null
  };
}

export function parseProductHtml(html, url) {
  const $ = cheerio.load(html);
  const name = metaContent($, "og:title") || cleanText($("h1").first().text());
  if (!name) return null;

  const brand = labeled($, "product:brand", ["Brand"]);
  const model = labeled($, "product:model", ["Model"]);
  const sourceProductId =
    metaContent($, "product:retailer_item_id") ||
    metaContent($, "product:sku") ||
    labeled($, "product:sku", ["SKU", "MPN"]);

  const availabilityText =
    metaContent($, "product:availability") ||
    labeled($, "product:availability", ["Stock", "Availability"]);

  const image = metaContent($, "og:image") || $("meta[property='og:image']").attr("content") || null;
  const shortDescription = $('meta[name="description"]').attr("content") || null;
  const metaPrice = parseBDTPrice(metaContent($, "product:price:amount"));

  let { price, previousPrice } = mainPrice($);
  if (price == null) price = metaPrice;
  const priceText =
price == null
? extractPriceLabel($("#product .price, #content .price, .product-info .price, .product-price").first().text(), availabilityText)
: null;

  const specContainer = $(
    '#tab-specification, .tab-specification, [id*="specification" i], .specification, .product-specification'
  ).first();

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
    images: image ? [absoluteUrl(image)] : [],
    shortDescription,
    specs,
  };
}

export async function parseProductPage(url) {
  return parseProductHtml(await fetchHtml(url), url);
}

export default {
  id: "skyland",
  hostname: "skyland.com.bd",
  categorySources,
  discoverCategoryPage,
  parseProductPage,
};
