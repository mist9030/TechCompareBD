// lib/ingestion/adapters/shared.js
//
// Common HTML-parsing helpers shared by every retailer adapter. Pulled out
// once StarTech's adapter was joined by four more (UCC, Onix, Creatus,
// Global Brand) — all five are OpenCart-based storefronts (confirmed via
// live research: `index.php?route=...` URLs, `image/cache/catalog/...`
// image paths) so the parsing strategy generalizes well. Adapter-specific
// files stay thin: category URLs + whatever per-retailer quirk isn't
// covered here.

import { parseBDTPrice, cleanText, SPEC_LABEL_MAP } from "../normalize.mjs";

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
const words = t.replace(/\u09F3\s*0+(?:\.0+)?|0+(?:\.0+)?\s*\u09F3/g, "").trim();
if (words && words.length <= 60 && !/\d/.test(words)) return words;
// 2) Otherwise look for a known "no price" phrase inside a bigger block.
for (const re of NO_PRICE_PATTERNS) {
const m = t.match(re);
if (m) return cleanText(m[0]);
}
}
return null;
}