// lib/ingestion/adapters/ucc.js
//
// Adapter for ucc.com.bd (United Computer Center).
//
// UCC is an OpenCart-based retailer. The listing pages expose products
// inside `.product-layout` cards. Product URLs are taken only from those
// cards so category/navigation URLs are not accidentally ingested.
//
// Product pages expose Brand, Model, SKU and Stock as visible product-info
// fields. Specifications are read from the specification table.
//
// Some UCC products show "Call For Price" / "৳0". In those cases the price
// remains null; the ingestion pipeline must not fabricate a price.
//

import * as cheerio from "cheerio";

import { parseBDTPrice, cleanText } from "../normalize.mjs";

import {
  fetchHtml,
  parseSpecTable,
  parsePricePair,
  findLabeledLine,
} from "./shared.js";

const BASE_URL = "https://www.ucc.com.bd";

// ---------------------------------------------------------------------------
// Category sources
// ---------------------------------------------------------------------------

export const categorySources = [
  { category: "cpu", listingUrl: `${BASE_URL}/processors` },
  { category: "gpu", listingUrl: `${BASE_URL}/graphics-card` },
  { category: "ram", listingUrl: `${BASE_URL}/desktop-ram` },
  { category: "ssd", listingUrl: `${BASE_URL}/solid-state-drives` },
  { category: "mobo", listingUrl: `${BASE_URL}/motherboards` },
  { category: "psu", listingUrl: `${BASE_URL}/power-supply-unit` },
  { category: "case", listingUrl: `${BASE_URL}/casing-chassis` },
  { category: "monitor", listingUrl: `${BASE_URL}/monitors` },
  { category: "laptop", listingUrl: `${BASE_URL}/laptops` },
  {
    category: "peripheral",
    listingUrl: `${BASE_URL}/computer-accessories-mouse`,
  },
];

// ---------------------------------------------------------------------------
// Listing page parser
// ---------------------------------------------------------------------------

/**
 * Parse one UCC category/listing page.
 *
 * IMPORTANT:
 * We intentionally DO NOT use a generic `a[href]` fallback here.
 *
 * UCC pages contain many category/navigation links, and the previous
 * fallback was incorrectly treating those links as products.
 *
 * Actual product cards are:
 *
 *   .product-layout
 *      └── .product-thumb
 *           └── ...
 *           └── .caption
 *                └── h4/h3 a
 */
export function parseListingHtml(html) {
  const $ = cheerio.load(html);

  const links = [];
  const seen = new Set();

  $(".product-layout").each((_, el) => {
    const card = $(el);

    // UCC product cards expose the actual product URL through
    // <a class="product-img" href="..."> inside .product-thumb.
    const anchor = card
      .find(".product-thumb a.product-img")
      .first();

    const href = anchor.attr("href");

    if (!href) return;

    const absoluteUrl = href.startsWith("http")
      ? href
      : new URL(href, BASE_URL).href;

    if (!absoluteUrl.startsWith(BASE_URL)) return;

    if (seen.has(absoluteUrl)) return;

    // Never treat category/navigation pages as products.
    if (
      /\/(processors|graphics-card|desktop-ram|solid-state-drives|motherboards|power-supply-unit|casing-chassis|monitors|laptops|computer-accessories-mouse|category|information|account|search|compare|wishlist|cart|upcoming-product|latest-offer|gaming-laptops)(\/|$|\?)/i.test(
        absoluteUrl
      )
    ) {
      return;
    }

    // Product name:
    // Prefer the caption title because the image anchor itself has no text.
    const name = cleanText(
      card.find(".caption h4 a, .caption h3 a").first().text()
    ) || cleanText(
      anchor.find("img").attr("alt")
    ) || cleanText(
      anchor.find("img").attr("title")
    );

    if (!name || name.length < 5) return;

    const priceText = card.find(".price").first().text();
    const previewPrice = parseBDTPrice(priceText);

    seen.add(absoluteUrl);

    links.push({
      url: absoluteUrl,
      previewName: name,
      previewPrice,
    });
  });

  const bodyText = cleanText($("body").text());

  const pagesMatch = bodyText.match(/\((\d+)\s*Pages?\)/i);

  const totalPages =
    pagesMatch && Number.isFinite(parseInt(pagesMatch[1], 10))
      ? parseInt(pagesMatch[1], 10)
      : 1;

  return {
    links,
    totalPages: Math.max(1, totalPages),
  };
}

// ---------------------------------------------------------------------------
// Category discovery
// ---------------------------------------------------------------------------

export async function discoverCategoryPage(listingUrl, page = 1) {
  const url =
    page > 1
      ? `${listingUrl}?page=${page}`
      : listingUrl;

  const html = await fetchHtml(url);

  return parseListingHtml(html);
}

// ---------------------------------------------------------------------------
// Product page parser
// ---------------------------------------------------------------------------

export function parseProductHtml(html, url) {
  const $ = cheerio.load(html);

  // -------------------------------------------------------------------------
  // Product name
  // -------------------------------------------------------------------------

  const name = cleanText($("h1").first().text());

  if (!name) {
    return null;
  }

  // -------------------------------------------------------------------------
  // Product information
  //
  // UCC exposes these as visible labelled fields:
  //
  // Brand: Intel
  // Model: Core i3-12100
  // SKU: Core i3-12100
  // Stock: Call For Price / In Stock / Out Of Stock
  // -------------------------------------------------------------------------

  const brand = findLabeledLine($, /^brand:/i);

  const model = findLabeledLine($, /^model:/i);

  const sku = findLabeledLine($, /^sku:/i);

  const stockText = findLabeledLine($, /^stock:/i);

  // -------------------------------------------------------------------------
  // Price
  //
  // Some UCC products show:
  //
  //   ৳84,500
  //   ৳84,500 ৳89,500
  //   Call For Price
  //   ৳0
  //
  // parsePricePair() handles the numeric cases. For "Call For Price"
  // price remains null.
  // -------------------------------------------------------------------------

  const priceBlockText = $(
    ".price, #product .price, .product-info, .product-price-group"
  )
    .first()
    .text();

  const {
    price,
    previousPrice,
  } = parsePricePair(priceBlockText);

  // -------------------------------------------------------------------------
  // Main image
  // -------------------------------------------------------------------------

  const mainImage =
    $('meta[property="og:image"]').attr("content") ||
    $(".product-image img").first().attr("src") ||
    $(".swiper-slide img").first().attr("src") ||
    $("img").first().attr("src") ||
    null;

  // -------------------------------------------------------------------------
  // Short description
  // -------------------------------------------------------------------------

  const shortDescription =
    $('meta[name="description"]').attr("content") ||
    null;

  // -------------------------------------------------------------------------
  // Specifications
  // -------------------------------------------------------------------------

  const specContainer = $(
    '[id*="specification" i], .tab-specification, #tab-specification'
  ).first();

  const specs = parseSpecTable(
    $,
    specContainer.length ? specContainer : $("body")
  );

  // -------------------------------------------------------------------------
  // Final parsed product
  // -------------------------------------------------------------------------

  return {
    sourceProductId: sku || url,
    sourceUrl: url,

    name,

    brand,
    model,
    sku: sku || null,

    price,
    previousPrice,

    availabilityText: stockText,

    images: mainImage ? [mainImage] : [],

    shortDescription,

    specs,
  };
}

// ---------------------------------------------------------------------------
// Product page discovery/parsing
// ---------------------------------------------------------------------------

export async function parseProductPage(url) {
  const html = await fetchHtml(url);

  return parseProductHtml(html, url);
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export default {
  id: "ucc",
  hostname: "ucc.com.bd",

  categorySources,

  discoverCategoryPage,
  parseProductPage,
};