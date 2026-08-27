// lib/ingestion/match.mjs
//
// Decides whether a normalized, scraped listing is:
//   - the SAME physical product as an existing canonical Product (auto-match)
//   - possibly the same product but not confidently (ambiguous -> Match Review)
//   - a genuinely new product (create)
//
// Important matching rule:
// A strong/conflicting model identifier must prevent a weak
// name-similarity match from being suggested as the same product.

import { normalizeModelForMatching } from "./normalize.mjs";

const HIGH_NAME_SIMILARITY = 0.82;
const LOW_NAME_SIMILARITY = 0.55;

// A candidate with a clearly different model identifier should not
// appear as a possible match.
const MODEL_CONFLICT_THRESHOLD = 0.55;

/**
 * Normalize a string for token comparison.
 */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Token-set (Jaccard) similarity between two product names.
 */
export function nameSimilarity(a, b) {
  const tok = (s) =>
    new Set(
      normalizeText(s)
        .split(" ")
        .filter(Boolean)
    );

  const ta = tok(a);
  const tb = tok(b);

  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;

  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }

  const union = ta.size + tb.size - intersection;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract useful model-like identifiers from text.
 *
 * Examples:
 *   HV-MS626GT
 *   HV-MS753
 *   N200
 *   RTX4060
 *   R5-5600
 *   5600X
 *
 * We intentionally focus on tokens containing digits because
 * those are much more likely to be model/product identifiers.
 */
function extractModelTokens(value) {
  const text = normalizeText(value);

  if (!text) return [];

  return text
    .split(" ")
    .filter(Boolean)
    .filter((token) => /\d/.test(token))
    .filter((token) => token.length >= 3);
}

/**
 * Return normalized model key if available.
 */
function normalizedModel(value) {
  if (!value) return "";

  const result = normalizeModelForMatching(value);

  return normalizeText(result);
}

/**
 * Determine whether two products have clearly conflicting model
 * identifiers.
 *
 * This is deliberately conservative:
 * - If either side has no usable model identifier -> no conflict.
 * - Exact model -> no conflict.
 * - Otherwise, if both have strong digit-bearing model tokens and
 *   they don't overlap -> conflict.
 */
function hasModelConflict(normalized, product) {
  const incomingExplicitModel = normalizedModel(
    normalized.model || normalized.identifiers?.mpn
  );

  const existingExplicitModel = normalizedModel(product.model);

  /*
   * If both products have explicit normalized models,
   * compare them directly.
   */
  if (incomingExplicitModel && existingExplicitModel) {
    if (incomingExplicitModel === existingExplicitModel) {
      return false;
    }

    return true;
  }

  /*
   * If scraped listing has no explicit model but its NAME contains
   * model-like identifiers, compare those against the canonical
   * product model.
   *
   * Example:
   *   incoming name: Havit HV-MS626GT Optical Wireless Mouse
   *   existing model: HV-MS753
   *
   * -> conflict.
   */
  if (!incomingExplicitModel && existingExplicitModel) {
    const incomingTokens = extractModelTokens(normalized.name);

    if (incomingTokens.length === 0) {
      return false;
    }

    const existingTokens = extractModelTokens(existingExplicitModel);

    if (existingTokens.length === 0) {
      return false;
    }

    const overlap = incomingTokens.some((incomingToken) =>
      existingTokens.some(
        (existingToken) =>
          incomingToken === existingToken ||
          incomingToken.includes(existingToken) ||
          existingToken.includes(incomingToken)
      )
    );

    return !overlap;
  }

  return false;
}

/**
 * Calculate useful information for Match Review UI.
 */
function enrichCandidate(product, score, reason) {
  const offers = Array.isArray(product.offers)
    ? product.offers
    : [];

  const activeOffers = offers.filter(
    (offer) => offer.active !== false
  );

  const prices = activeOffers
    .map((offer) => Number(offer.price))
    .filter(
      (price) => Number.isFinite(price) && price > 0
    );

  const lowPrice = prices.length
    ? Math.min(...prices)
    : null;

  let dataQuality = "Needs review";

  if (reason === "model_exact") {
    dataQuality = "High";
  } else if (score >= HIGH_NAME_SIMILARITY) {
    dataQuality = "High";
  } else if (score >= 0.65) {
    dataQuality = "Medium";
  }

  return {
    productId: product.id,
    score: Number(score.toFixed(4)),
    confidence: Math.round(score * 100),
    reason,

    // Canonical product information
    name: product.name || null,
    brand: product.brand || null,
    model: product.model || null,
    category: product.cat || null,

    // Existing retailer information
    offerCount: activeOffers.length,
    lowPrice,

    // Used directly by Match Review UI
    dataQuality,
  };
}

/**
 * @param {object} normalized
 * @param {Array<object>} existingProducts
 *
 * @returns {{
 *   decision: 'match'|'ambiguous'|'new',
 *   productId?: string,
 *   candidates?: Array<object>,
 *   reason: string
 * }}
 */
export function matchCandidate(
  normalized,
  existingProducts
) {
  const sameCategory = existingProducts.filter(
    (p) => p.cat === normalized.category
  );

  /*
   * ============================================================
   * 1. HIGHEST CONFIDENCE:
   *    Same retailer + same source product ID
   * ============================================================
   */
  if (normalized.sourceProductId) {
    const bySourceId = existingProducts.find((p) =>
      (p.offers || []).some(
        (o) =>
          o.shop === normalized.sourceShopId &&
          o.sourceProductId ===
            normalized.sourceProductId
      )
    );

    if (bySourceId) {
      return {
        decision: "match",
        productId: bySourceId.id,
        reason: "source_id",
      };
    }
  }

  /*
   * ============================================================
   * 2. EXACT NORMALIZED MODEL MATCH
   * ============================================================
   */
  const normModel = normalizedModel(
    normalized.model ||
      normalized.identifiers?.mpn
  );

  if (normModel) {
    const modelMatches = sameCategory.filter((p) => {
      if (
        normalizeText(p.brand) !==
        normalizeText(normalized.brand)
      ) {
        return false;
      }

      return (
        normalizedModel(p.model) === normModel
      );
    });

    if (modelMatches.length === 1) {
      return {
        decision: "match",
        productId: modelMatches[0].id,
        reason: "model_exact",
      };
    }

    if (modelMatches.length > 1) {
      return {
        decision: "ambiguous",

        candidates: modelMatches.map((p) =>
          enrichCandidate(
            p,
            1,
            "model_exact"
          )
        ),

        reason: "multiple_products_share_model",
      };
    }
  }

  /*
   * ============================================================
   * 3. BRAND + NAME SIMILARITY
   *
   * IMPORTANT:
   * Before considering a candidate, reject products whose model
   * clearly conflicts with the scraped listing.
   * ============================================================
   */
  const brandMatches = sameCategory.filter(
    (p) =>
      normalizeText(p.brand) ===
      normalizeText(normalized.brand)
  );

  const scored = brandMatches
    .map((p) => ({
      product: p,
      score: nameSimilarity(
        p.name,
        normalized.name
      ),
    }))
    .filter(
      (c) =>
        c.score >= LOW_NAME_SIMILARITY
    )
    .filter(
      (c) =>
        !hasModelConflict(
          normalized,
          c.product
        )
    )
    .sort(
      (a, b) => b.score - a.score
    );

  /*
   * No valid candidate.
   *
   * This is especially important when products have similar names
   * but different models.
   */
  if (scored.length === 0) {
    return {
      decision: "new",
      reason: "no_candidate",
    };
  }

  const top = scored[0];
  const runnerUp = scored[1];

  /*
   * ============================================================
   * 4. HIGH-CONFIDENCE AUTOMATIC NAME MATCH
   *
   * We still require a meaningful lead over the runner-up.
   * ============================================================
   */
  if (
    top.score >= HIGH_NAME_SIMILARITY &&
    (!runnerUp ||
      top.score - runnerUp.score > 0.1)
  ) {
    return {
      decision: "match",
      productId: top.product.id,
      reason: "name_similarity_high",
    };
  }

  /*
   * ============================================================
   * 5. AMBIGUOUS -> MATCH REVIEW
   *
   * Never silently create or auto-match uncertain products.
   * ============================================================
   */
  return {
    decision: "ambiguous",

    candidates: scored
      .slice(0, 5)
      .map((c) =>
        enrichCandidate(
          c.product,
          c.score,
          "name_similarity"
        )
      ),

    reason: "name_similarity_ambiguous",
  };
}