// lib/ingestion/adapters/startech.js

// Adapter for startech.com.bd.
// Parses real Star Tech listing pages and product detail pages.

import * as cheerio from "cheerio";
import { parseBDTPrice, cleanText } from "../normalize.mjs";
import {
  fetchHtml,
  metaContent,
  parseSpecTable,
  parsePricePair,
  findLabeledLine,
  extractPriceLabel,
  extractProductPrice,
} from "./shared.js";

const BASE_URL = "https://www.startech.com.bd";

export const categorySources = [
  { category: "cpu", listingUrl: `${BASE_URL}/component/processor` },
  { category: "gpu", listingUrl: `${BASE_URL}/component/graphics-card` },
  { category: "ram", listingUrl: `${BASE_URL}/component/ram` },
  { category: "ssd", listingUrl: `${BASE_URL}/ssd` },
  { category: "mobo", listingUrl: `${BASE_URL}/component/motherboard` },
  { category: "psu", listingUrl: `${BASE_URL}/component/power-supply` },
  { category: "case", listingUrl: `${BASE_URL}/component/casing` },
  { category: "monitor", listingUrl: `${BASE_URL}/monitor` },
  { category: "laptop", listingUrl: `${BASE_URL}/laptop-notebook/laptop` },
  { category: "peripheral", listingUrl: `${BASE_URL}/accessories/mouse` },
];

/**
 * Parse one Star Tech category/listing page.
 *
 * Current verified structure:
 *
 * .product-listing
 *   └── .main-content.p-items-wrap
 *       └── .p-item
 *
 * Each .p-item represents one real product.
 */
export function parseListingHtml(html) {
  const $ = cheerio.load(html);

  const links = [];
  const seen = new Set();

  $(".main-content.p-items-wrap .p-item").each((_, el) => {
    /*
     * Each product card contains multiple links to the same product.
     * The first link may be an image link with no text.
     *
     * Therefore:
     * - only accept Star Tech product URLs
     * - require non-empty link text
     * - ignore category/navigation URLs
     */
    const productLink = $(el)
      .find(`a[href^="${BASE_URL}/"]`)
      .filter((_, a) => {
        const href = $(a).attr("href") || "";
        const text = cleanText($(a).text());

        if (!text) return false;

        if (
          /\/(component|category|accessories|information|account|tool|desktops|television)\//i.test(
            href
          )
        ) {
          return false;
        }

        return true;
      })
      .first();

    const href = productLink.attr("href");

    if (!href || seen.has(href)) return;

    const previewName = cleanText(productLink.text());

    /*
     * Star Tech currently shows prices like:
     *
     * 4,300৳ 4,900৳
     *
     * We only need the first/current price for listing preview.
     */
    const priceText = $(el)
      .find(".p-item-price, .price, .special")
      .first()
      .text();

    const priceMatch = priceText.match(/[\d,]+(?:\.\d+)?/);

    const previewPrice = priceMatch
      ? parseBDTPrice(priceMatch[0])
      : null;

    seen.add(href);

    links.push({
      url: href,
      previewName,
      previewPrice,
    });
  });

  /*
   * Pagination example:
   *
   * Showing 1 to 20 of 123 (7 Pages)
   */
  const bodyText = $(".product-listing").text();

  const pagesMatch = bodyText.match(
    /Showing\s+\d+\s+to\s+\d+\s+of\s+\d+\s+\((\d+)\s+Pages?\)/i
  );

  return {
    links,
    totalPages: (pagesMatch ? parseInt(pagesMatch[1], 10) : 1) || 1,
  };
}

/**
 * Discover one category page.
 */
export async function discoverCategoryPage(listingUrl, page = 1) {
  const url =
    page > 1
      ? `${listingUrl}?page=${page}`
      : listingUrl;

  return parseListingHtml(await fetchHtml(url));
}

/**
 * Parse one Star Tech product detail page.
 */
export function parseProductHtml(html, url) {
  const $ = cheerio.load(html);

  const name =
    metaContent($, "og:title") ||
    cleanText($("h1").first().text());

  if (!name) return null;

  const brand = metaContent($, "product:brand");

  const sourceProductId =
    metaContent($, "product:retailer_item_id");

  const availabilityText =
    metaContent($, "product:availability");

  const mainImage =
    metaContent($, "og:image");

  const shortDescription =
    $('meta[name="description"]').attr("content") || null;

  const metaPrice =
    parseBDTPrice(
      metaContent($, "product:price:amount")
    );

  /*
   * Prefer visible product-page price.
   * Star Tech may show:
   *
   * current price + previous/regular price
   */
  // Price of THIS product only (see extractProductPrice in shared.js).
  const { price, previousPrice, priceText } = extractProductPrice(
    $,
    ".price, #product .price, .product-info .price",
    { metaPrice, availabilityText }
  );

  const model =
    findLabeledLine($, /^model:/i);

  /*
   * Product specification section.
   */
  const specContainer = $(
    '#tab-specification, .tab-specification, [id*="specification" i]'
  ).first();

  const specs = parseSpecTable(
    $,
    specContainer.length
      ? specContainer
      : $("body")
  );

  return {
    sourceProductId:
      sourceProductId || url,

    sourceUrl: url,

    name,

    brand,

    model,

    price,

    previousPrice,

    priceText,

    availabilityText,

    images:
      mainImage
        ? [mainImage]
        : [],

    shortDescription,

    specs,
  };
}

/**
 * Fetch and parse one product page.
 */
export async function parseProductPage(url) {
  return parseProductHtml(
    await fetchHtml(url),
    url
  );
}

export default {
  id: "startech",
  hostname: "startech.com.bd",
  categorySources,
  discoverCategoryPage,
  parseProductPage,
};