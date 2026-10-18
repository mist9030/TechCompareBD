// lib/ingestion/adapters/shared.js
//
// Common HTML-parsing helpers shared by every retailer adapter. Pulled out
// once StarTech's adapter was joined by four more (UCC, Onix, Creatus,
// Global Brand) — all five are OpenCart-based storefronts (confirmed via
// live research: `index.php?route=...` URLs, `image/cache/catalog/...`
// image paths) so the parsing strategy generalizes well. Adapter-specific
// files stay thin: category URLs + whatever per-retailer quirk isn't
// covered here.

import { parseBDTPrice, cleanText, SPEC_LABEL_MAP, absoluteUrl, isUsableImage, normalizeAvailability } from "../normalize.mjs";

// Flattened, longest-first list of every known spec label across all
// categories (see normalize.mjs SPEC_LABEL_MAP) — used to split scraped
// "Label Value" text even when the value doesn't start with a digit (e.g.
// "Processor Graphics Radeon Vega 8"), and to split *compound* table cells
// like "Base Clock 4.7GHz    Max. Boost Clock Up to 5.3GHz" (observed live
// on UCC's spec table) into separate canonical pairs.
export const KNOWN_SPEC_LABELS = [...new Set(Object.values(SPEC_LABEL_MAP).flatMap((m) => Object.keys(m)))].sort(
  (a, b) => b.length - a.length
);

/**
 * Shared fetch wrapper: descriptive UA (we identify ourselves rather than
 * spoofing a browser), one retry on transient failure, and a hard timeout.
 *
 * The sync loop in lib/ingestion/ingest.js is fully sequential — one
 * category/page/product at a time — so a single request that never
 * resolves (rate-limiting, a silently dropped connection, anti-bot
 * blocking) would otherwise stall the *entire* run forever with no way to
 * recover short of killing the dev server. Node's built-in fetch has no
 * default timeout, so this has to be explicit: an AbortController fires
 * after `timeoutMs`, which fetch() surfaces as an AbortError — the same
 * `retries` / backoff path below applies to it as any other failure, and
 * if it exhausts retries, the caller's existing try/catch (per-product in
 * ingest.js) logs it as a normal "failed" item and the loop moves on.
 */
export async function fetchHtml(url, { retries = 1, timeoutMs = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "TechCompareBD-Ingestion/1.0 (+https://techcompare.example/bot)",
          Accept: "text/html",
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err?.name === "AbortError" ? new Error(`Timed out after ${timeoutMs}ms fetching ${url}`) : err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Reads `<meta property="X" content="...">` — used for og:/product: tags. */
export function metaContent($, property) {
  const el = $(`meta[property="${property}"]`).first();
  return el.length ? cleanText(el.attr("content")) : null;
}

/**
 * Extracts a "current[, previous]" BDT price pair from a block of text.
 * Handles both observed formats:
 *   - trailing-currency, no decimals, possibly two prices: "4,300৳ 4,900৳"
 *     (StarTech/UCC/Onix/Creatus)
 *   - leading-currency, two decimals, single price: "৳79,500.00"
 *     (Global Brand)
 */
export function parsePricePair(text) {
  if (!text) {
    return {
      price: null,
      previousPrice: null,
    };
  }

  const raw = cleanText(String(text));

  // Normalize both real Taka symbol and previously observed mojibake.
  const t = raw
    .replace(/à§³/g, "৳")
    .replace(/\u00A0/g, " ");

  /*
   * Case 1:
   * Current price followed by previous price.
   *
   * Examples:
   *   4,300৳ 4,900৳
   *   ৳4,300 ৳4,900
   *   4,300৳ / 4,900৳
   */
  const amounts = [];

  // Numbers immediately associated with the Taka symbol.
  const currencyPattern =
    /৳\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*৳/g;

  let match;

  while ((match = currencyPattern.exec(t)) !== null) {
    const value = match[1] || match[2];

    const parsed = parseBDTPrice(value);

    if (parsed !== null) {
      amounts.push(parsed);
    }
  }

  /*
   * If two currency amounts exist:
   * first = current price
   * second = previous/original price
   */
  if (amounts.length >= 2) {
    return {
      price: amounts[0],
      previousPrice: amounts[1],
    };
  }

  /*
   * If exactly one currency amount exists.
   */
  if (amounts.length === 1) {
    return {
      price: amounts[0],
      previousPrice: null,
    };
  }

  /*
   * Some pages may expose a plain numeric price without the
   * Taka symbol. Only use this as a fallback.
   */
  // Only accept a bare number when the WHOLE text is that number. A stray
// digit inside words ("Ryzen 5 7600X") must never become a price.
const plain = t.match(/^\s*([\d,]+(?:\.\d+)?)\s*$/);
  if (plain) {
    return {
      price: parseBDTPrice(plain[1]),
      previousPrice: null,
    };
  }

  return {
    price: null,
    previousPrice: null,
  };
}

/**
 * Post-process pass: if a pair's value contains one or more embedded known
 * labels (e.g. a single UCC table cell whose value is literally "Base
 * Clock 4.7GHz    Max. Boost Clock Up to 5.3GHz" — the cell redundantly
 * repeats its own column-1 label, then packs a second fact in after it),
 * split it into separate canonical pairs rather than losing/mangling the
 * second fact. Conservative — only splits on exact known-label substring
 * matches, so it won't fragment ordinary prose.
 */
export function splitCompoundValues(pairs) {
  const out = [];
  for (const { label, value } of pairs) {
    if (!value) {
      continue;
    }
    const lower = value.toLowerCase();
    const hits = [];
    for (const known of KNOWN_SPEC_LABELS) {
      const idx = lower.indexOf(known);
      if (idx !== -1) hits.push({ idx, known });
    }
    if (hits.length === 0) {
      out.push({ label, value: cleanText(value) });
      continue;
    }
    hits.sort((a, b) => a.idx - b.idx || b.known.length - a.known.length);
    // Drop hits fully contained inside an earlier, longer hit at the same start.
    const deduped = hits.filter((h, i) => i === 0 || h.idx !== hits[i - 1].idx);

    const segments = [];
    // Leading text before the first embedded label match still belongs to
    // this cell's ORIGINAL (column-1) label — e.g. a value like "6MB L2
    // Cache" where "L2 Cache" is embedded but "6MB" precedes it.
    if (deduped[0].idx > 0) {
      segments.push({ label, start: 0, end: deduped[0].idx });
    }
    for (let i = 0; i < deduped.length; i++) {
      const start = deduped[i].idx + deduped[i].known.length;
      const end = i + 1 < deduped.length ? deduped[i + 1].idx : value.length;
      segments.push({ label: value.slice(deduped[i].idx, deduped[i].idx + deduped[i].known.length), start, end });
    }
    for (const seg of segments) {
      const v = cleanText(value.slice(seg.start, seg.end));
      if (v) out.push({ label: seg.label, value: v });
    }
  }
  return out;
}

/**
 * Best-effort specification extractor. Tries, in order:
 *   1. <table> rows with two cells (label, value) — the common case for
 *      all five retailers' "Specification" tab.
 *   2. <dl><dt>/<dd> pairs
 *   3. <li> items shaped "Label Value..." (known-label prefix match, then
 *      a digit-starts-value regex, then colon-split)
 * Then runs splitCompoundValues() over whatever was found, since more than
 * one retailer packs multiple facts into a single cell/line.
 * Returns [] rather than throwing if nothing matches.
 */
export function parseSpecTable($, container) {
  let pairs = [];

  container.find("table tr").each((_, tr) => {
    const cells = $(tr).find("td, th");

    if (cells.length >= 2) {
      const label = cleanText($(cells[0]).text());
      const value = cleanText($(cells[1]).text());

      if (label && value) {
        pairs.push({ label, value });
      }
    }
  });

  if (pairs.length === 0) {
    container.find("dt").each((_, dt) => {
      const dd = $(dt).next("dd");

      const label = cleanText($(dt).text());
      const value = cleanText(dd.text());

      if (label && value) {
        pairs.push({ label, value });
      }
    });
  }

  if (pairs.length === 0) {
    container.find("li").each((_, li) => {
      const raw = cleanText($(li).text());

      if (!raw) return;

      const lower = raw.toLowerCase();

      const knownLabel = KNOWN_SPEC_LABELS.find(
        (l) => lower.startsWith(l + " ") || lower === l
      );

      if (knownLabel) {
        const value = cleanText(raw.slice(knownLabel.length));

        if (value) {
          pairs.push({
            label: knownLabel,
            value,
          });
        }

        return;
      }

      const m = raw.match(/^([A-Za-z][A-Za-z0-9 /.'-]*?)\s+([\d].*)$/);

      if (m) {
        const label = cleanText(m[1]);
        const value = cleanText(m[2]);

        if (label && value) {
          pairs.push({ label, value });
        }
      } else if (raw.includes(":")) {
        const [label, ...rest] = raw.split(":");

        if (rest.length) {
          const cleanLabel = cleanText(label);
          const cleanValue = cleanText(rest.join(":"));

          if (cleanLabel && cleanValue) {
            pairs.push({
              label: cleanLabel,
              value: cleanValue,
            });
          }
        }
      }
    });
  }

  // ------------------------------------------------------------
  // Split compound specification values
  // ------------------------------------------------------------
  const expanded = splitCompoundValues(pairs);

  // ------------------------------------------------------------
  // Clean + deduplicate specifications
  //
  // UCC can expose the same specification more than once in its
  // responsive/mobile markup. Keep only the first useful value for
  // each label and ignore empty values.
  // ------------------------------------------------------------
  const seenLabels = new Set();
  const cleaned = [];

  for (const pair of expanded) {
    if (!pair) continue;

    const label = cleanText(pair.label);
    const value = cleanText(pair.value);

    if (!label || !value) continue;

    const labelKey = label.toLowerCase().replace(/\s+/g, " ").trim();

    if (seenLabels.has(labelKey)) {
      continue;
    }

    seenLabels.add(labelKey);

    cleaned.push({
      label,
      value,
    });
  }

  return cleaned;
}

/**
 * Finds a "Model: <value>" / "SKU: <value>" style line anywhere on the
 * page (StarTech's Key Features bullets, UCC's product info list, etc).
 * Returns null rather than guessing if not found.
 */
export function findLabeledLine($, labelPattern) {
  const el = $("li, p, div")
    .filter((_, node) => labelPattern.test(cleanText($(node).text())))
    .first();
  if (!el.length) return null;
  return cleanText(el.text()).replace(labelPattern, "").trim() || null;
}

/**
 * Extracts a product's own price block, trying selectors in strict
 * priority order rather than one combined CSS selector.
 *
 * Why this matters: `$(".price, #product .price, .product-info .price").first()`
 * (the pattern every adapter originally used) does NOT try the more
 * specific selectors first — a combined CSS selector list is evaluated as
 * "any element matching any of these", and `.first()` then returns
 * whichever match comes FIRST IN DOCUMENT ORDER, regardless of which
 * branch of the selector matched it. On a page-builder theme (Journal,
 * used by Creatus and others) that renders sidebar/related-product
 * blocks — "Best Processor Price List", "Quick Compare", etc. — those
 * blocks reuse the same `.price` class as the real product price, and if
 * one happens to sit earlier in the raw HTML than the actual product's
 * price (common with page-builder "content-top" regions, independent of
 * where it's visually positioned via CSS), the bare `.price` fallback
 * silently wins and every product on the page-builder's featured list
 * reports the SAME wrong price. Confirmed live on Creatus: two different
 * real product pages both showed a "Best ... Price List" widget with
 * other products' prices reusing `.price`.
 *
 * Trying selectors as an ordered sequence — each one an independent,
 * SCOPED lookup — means a more specific selector's `.first()` only ever
 * searches within its own scope, so an unrelated widget elsewhere on the
 * page can't win just by DOM position. Only falls through to a later
 * (broader) selector if the current one yields no PARSEABLE price at all.
 */
export function extractPriceBlock($, selectors = ["#product .price", ".product-info .price", "#content .price", ".price"]) {
  for (const selector of selectors) {
    const text = $(selector).first().text();
    const parsed = parsePricePair(text);
    if (parsed.price != null) return parsed;
  }
  return { price: null, previousPrice: null };
}

// Longest-first so multi-word brands (e.g. "Western Digital") are matched
// before a shorter substring could steal the match. Scoped to brands
// actually relevant to this catalog's categories (cpu/gpu/ram/ssd/mobo/
// psu/case/monitor/laptop/peripheral) — not an exhaustive global list.
const KNOWN_BRANDS = [
  "Western Digital", "Cooler Master", "Silicon Power", "Team Group", "TeamGroup",
  "G.Skill", "GSkill", "Fractal Design", "SilverStone", "be quiet!", "1stPlayer",
  "PowerColor", "Sapphire", "Gainward", "Inno3D", "Sparkle", "Zotac", "Palit",
  "Colorful", "Manli", "Galax", "EVGA", "XFX", "Asus", "ASRock", "Gigabyte",
  "MSI", "AMD", "Intel", "NZXT", "Lian Li", "Deepcool", "Antec", "Thermaltake",
  "Phanteks", "Segotep", "Corsair", "Kingston", "Crucial", "Patriot", "Adata",
  "ADATA", "Apacer", "Transcend", "Samsung", "Seagate", "Toshiba", "SanDisk",
  "Lexar", "Value Top", "Walton", "Xiaomi", "Redmi", "Dell", "HP", "Lenovo",
  "Acer", "Apple", "ViewSonic", "BenQ", "Philips", "AOC", "LG", "Logitech",
  "Razer", "HyperX", "SteelSeries", "Redragon", "Fantech", "Havit", "A4Tech",
  "A4tech", "Rapoo", "Gamdias", "Cougar",
].sort((a, b) => b.length - a.length);

/**
 * Last-resort brand fallback: matches a known brand name at/near the
 * start of the product name. Only used when a page has no other brand
 * signal at all (no product:brand meta, no "Brand:" line) — confirmed
 * live on Creatus, which exposes brand as a structured column in its
 * "Quick Compare" widget but never on the main product info block
 * itself, so name-matching is the only reliable source here.
 */
export function guessBrandFromName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.startsWith(brand.toLowerCase() + " ")) return brand;
  }
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(" " + brand.toLowerCase() + " ") || lower.includes(" " + brand.toLowerCase())) return brand;
  }
  return null;
}
//--------------------------------------------------------------------------
// Text a shop shows INSTEAD of a price ("Up Coming", "Call For Price", "TBA"...).
// Call this only when no numeric price was found. It returns the shop's real
// wording so the UI can show it where the price would normally be.
//--------------------------------------------------------------------------
const NO_PRICE_PATTERNS = [
/call\s*(?:for|us)\s*(?:for\s*)?price/i,
/to\s*be\s*announced/i,
/\bTBA\b/,
/up\s*-?\s*coming/i,
/coming\s*soon/i,
/price\s*(?:will\s*be\s*)?(?:updated|announced|not\s*available|on\s*request)/i,
/\bnegotiable\b/i,
/contact\s*(?:us|for)[^.\n]{0,25}/i,];
export function extractPriceLabel(...texts) {
for (const raw of texts) {
const t = cleanText(String(raw ?? "").replace(/\u00A0/g, " "));
if (!t) continue;
// 1) The price element holds only words (e.g. "Up Coming" or "\u09F30")?
const words = t
      .replace(/\u09F3\s*0+(?:\.0+)?|0+(?:\.0+)?\s*\u09F3/g, "")
      .replace(/^price\s*:?\s*/i, "")
      .trim();
if (words && words.length <= 60 && !/\d/.test(words)) return words;
// 2) Otherwise look for a known "no price" phrase inside a bigger block.
for (const re of NO_PRICE_PATTERNS) {
const m = t.match(re);
if (m) return cleanText(m[0]);
}
}
return null;
}
// ---------------------------------------------------------------------------
// Price of THIS product page - not of "similar products", sidebars or banners.
//
// Old code took the first `.price` element anywhere on the page. On a page
// whose own price is "To be announced" there is no `.price` in the product
// block, so the first `.price` on the page belonged to a different product
// (a "Similar Product" card) and its price was saved for this one.
// ---------------------------------------------------------------------------

// Plain phrase search ("To be announced", "Call For Price"...) inside a text.
export function matchNoPricePhrase(text) {
  const t = cleanText(String(text ?? "").replace(/\u00A0/g, " "));
  if (!t) return null;
  for (const re of NO_PRICE_PATTERNS) {
    const m = t.match(re);
    if (m) return cleanText(m[0]);
  }
  return null;
}

// Smallest block around the page title (<h1>) that holds both the price and
// the stock info, i.e. the product's own header area.
export function productInfoScope($) {
  const h1 = $("h1").first();
  if (!h1.length) return null;
  let node = h1;
  for (let i = 0; i < 7; i++) {
    node = node.parent();
    if (!node.length || node.is("body, html")) break;
    const t = node.text();
    if (/\b(status|availability|stock)\b/i.test(t) && /(price|\u09F3|\bBDT\b|\bTk\b)/i.test(t)) {
      return node;
    }
  }
  return h1.parent();
}

// Blocks that list OTHER products ("Similar Product", sliders...): a price in
// there never belongs to this page's product.
const OTHER_PRODUCTS_SELECTOR =
  '[class*="similar"], [class*="related"], [class*="recommend"], [class*="slider"], [class*="carousel"], [class*="swiper"], [id*="similar"], [id*="related"]';

// First price printed right after the title, ignoring EMI / saving / points
// amounts ("EMI starts at 3,340৳/month", "Save: 2000৳").
function amountNearTitle(head) {
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(?:\u09F3|Tk\b|BDT\b)|(?:\u09F3|Tk\.?|BDT)\s*(\d[\d,]*(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(head))) {
    const before = head.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    if (/emi|month|save|off\b|discount|cashback|point|regular|\bwas\b|\bold\b/.test(before)) continue;
    const v = parseBDTPrice(m[1] || m[2]);
    if (v && v > 0) return v;
  }
  return null;
}

// Visible text of a node (no scripts/styles). cheerio's .text() glues the text
// of neighbouring tags together ("...SupplyPrice:To be announced"), so a space
// is inserted after every element first.
function spacedText(node) {
  const copy = node.clone();
  copy.find("script, style, noscript, template").remove();
  copy.find("*").after(" ");
  return cleanText(copy.text());
}

// All visible text of the page.
function pageText($) {
  return spacedText($("body"));
}

// "Price: To be announced" printed anywhere on the page. Independent of the
// HTML structure: it works even if the product block cannot be located.
// Returns the shop's own words, or null (also null as soon as a numeric
// "Price: 4,300" shows up first - a real price is printed there).
function labeledNoPrice(text) {
  const re = /(?:^|[\s|\u2022])Price\s*(:?)\s*([^\n]{0,60})/gi;
  let m;
  let seen = 0;
  while ((m = re.exec(text)) && seen++ < 8) {
    const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (/(regular|special|cash|old|emi|total|offer|discount|sale|unit)\s*$/.test(before)) continue;
    const value = m[2].slice(0, 40);
    const label = matchNoPricePhrase(value);
    if (label) return label;
    // "Price: 4,300" (with a colon) is a real price label - stop looking.
    if (m[1] && /\d/.test(value.slice(0, 12))) return null;
  }
  return null;
}

// -> { price, previousPrice, priceText, source }   (`source` is for debugging)
//   0. "Price: To be announced" anywhere on the page -> that wording, no price
//   1. the same wording right under the title
//   2. numeric price from a price element INSIDE the product block (never
//      from a "similar products" block)
//   3. numeric price printed right after the title
//   4. words-only price element / "Call For Price" in the stock line
//   5. last resort: the product:price meta tag - but NOT when the page says
//      the product is out of stock / upcoming: shops keep the last known
//      price in that tag, which is stale.
// NOTE: a stock status ("Out Of Stock") is NOT a price label.
export function extractProductPrice($, selectors, { metaPrice = null, availabilityText = "" } = {}) {
  const pageLabel = labeledNoPrice(pageText($));
  if (pageLabel) {
    return { price: null, previousPrice: null, priceText: pageLabel, source: "label-in-page" };
  }

  const scope = productInfoScope($);
  const root = scope || $("body");

  let head = "";
  if (scope) {
    const h1Text = cleanText($("h1").first().text());
    const full = spacedText(scope);
    const at = h1Text ? full.indexOf(h1Text) : -1;
    const start = at >= 0 ? at + h1Text.length : 0;
    head = full.slice(start, start + 500);
  }

  const headAmount = head ? amountNearTitle(head) : null;
  const headLabel = head ? matchNoPricePhrase(head) : null;
  if (headLabel && headAmount == null) {
    return { price: null, previousPrice: null, priceText: headLabel, source: "label-near-title" };
  }

  const priceEl = root
    .find(selectors)
    .filter((_, el) => !$(el).closest(OTHER_PRODUCTS_SELECTOR).length)
    .first();
  const priceBlockText = priceEl.text();
  let { price, previousPrice } = parsePricePair(priceBlockText);
  if (price != null && price <= 0) price = null;
  if (price != null) return { price, previousPrice, priceText: null, source: "price-element" };

  if (headAmount != null) return { price: headAmount, previousPrice: null, priceText: null, source: "amount-near-title" };

  const label = extractPriceLabel(priceBlockText) || matchNoPricePhrase(availabilityText);
  if (label) return { price: null, previousPrice: null, priceText: label, source: "words-only" };

  const stockKnown = String(availabilityText || "").trim() !== "";
  if (metaPrice && stockKnown && normalizeAvailability(availabilityText) !== "in_stock") {
    return { price: null, previousPrice: null, priceText: null, source: "meta-ignored-not-in-stock" };
  }
  return { price: metaPrice, previousPrice: null, priceText: null, source: metaPrice ? "meta" : "none" };
}

// ---------------------------------------------------------------------------
// The product's own photo - never the site logo.
// Order: gallery link/thumbnail -> an <img> whose alt matches the product name
// -> og:image (if it is not a logo) -> first catalog photo on the page.
// ---------------------------------------------------------------------------
const IMG_ATTRS = ["data-zoom-image", "data-large", "data-full", "data-src", "data-lazy", "src"];

export function pickProductImage($, pageUrl, { name = "", ogImage = "" } = {}) {
  const abs = (v) => absoluteUrl(v, pageUrl);
  const ok = (v) => {
    const u = abs(v);
    return u && isUsableImage(u) ? u : null;
  };
  const fromImg = (el) => {
    for (const attr of IMG_ATTRS) {
      const u = ok($(el).attr(attr));
      if (u) return u;
    }
    return null;
  };

  // 1) gallery: links that open the full-size photo
  for (const el of $("a.thumbnail[href], .thumbnails a[href], .image-additional a[href], .product-gallery a[href], .gallery a[href]").toArray()) {
    const href = $(el).attr("href");
    if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(href || "")) {
      const u = ok(href);
      if (u) return u;
    }
  }

  // 2) an image whose alt text is (part of) the product name
  const key = cleanText(name).toLowerCase().slice(0, 18);
  if (key.length >= 8) {
    for (const el of $("img").toArray()) {
      const alt = cleanText($(el).attr("alt") || "").toLowerCase();
      if (alt && (alt.includes(key) || key.includes(alt.slice(0, 18)))) {
        const u = fromImg(el);
        if (u) return u;
      }
    }
  }

  // 3) og:image, unless it is just the site logo
  const og = ok(ogImage);
  if (og) return og;

  // 4) first catalog photo on the page
  for (const el of $("img").toArray()) {
    const u = fromImg(el);
    if (u && /\/image\/(cache\/)?catalog\//i.test(u)) return u;
  }
  return null;
}
