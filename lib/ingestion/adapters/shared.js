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
 * spoofing a browser), one retry on transient failure. Every adapter's
 * discovery/parse functions should go through this rather than calling
 * `fetch` directly, so retry/UA policy changes happen in one place.
 */
export async function fetchHtml(url, { retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "TechCompareBD-Ingestion/1.0 (+https://techcompare.example/bot)",
          Accept: "text/html",
        },
      });
      if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400));
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
  const plain = t.match(/(?:^|\s)([\d,]+(?:\.\d+)?)(?:\s|$)/);

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
