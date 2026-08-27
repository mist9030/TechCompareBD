// app/api/admin/local-sync/route.js
//
// Local SQLite ingestion endpoint.
//
// POST {
//   shopId: "local-ucc",
//   dryRun: false
// }
//
// IMPORTANT:
// - Does NOT use Firebase.
// - Does NOT call requireAdmin().
// - Uses the existing retailer adapter.
// - Uses the existing normalize + match logic.
// - Writes only to local SQLite when dryRun=false.

import { NextResponse } from "next/server";

import {
  getLocalShop,
  saveLocalShop,
  getLocalProducts,
  getLocalProduct,
  saveLocalProduct,
  saveLocalOffer,
  addLocalPriceHistory,
  createLocalScrapingLog,
  finishLocalScrapingLog,
  addLocalMatchReview,
} from "@/lib/localdb/index.js";

import {
  resolveAdapterForShop,
} from "@/lib/ingestion/registry.js";

import {
  parseBDTPrice,
  normalizeAvailability,
  normalizeSpecs,
  buildSourceHash,
  cleanText,
} from "@/lib/ingestion/normalize.mjs";

import {
  matchCandidate,
} from "@/lib/ingestion/match.mjs";

export const runtime = "nodejs";

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------

const MAX_PAGES_PER_CATEGORY =
  Number(process.env.INGEST_MAX_PAGES_PER_CATEGORY) || 1;

const MAX_ITEMS_PER_CATEGORY =
  Number(process.env.INGEST_MAX_ITEMS_PER_CATEGORY) || 5;

const REQUEST_DELAY_MS =
  Number(process.env.INGEST_REQUEST_DELAY_MS) || 500;

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function computeDiscount(
  price,
  previousPrice
) {
  if (
    !price ||
    !previousPrice ||
    previousPrice <= price
  ) {
    return 0;
  }

  return Math.round(
    ((previousPrice - price) /
      previousPrice) *
      100
  );
}

function makeLocalId(
  sourceShopId,
  sourceProductId
) {
  const raw =
    `${sourceShopId}:${sourceProductId}`;

  return `local-${Buffer.from(raw)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80)}`;
}

// ------------------------------------------------------------
// NORMALIZATION
// ------------------------------------------------------------

function toNormalized(
  raw,
  {
    shop,
    category,
  }
) {
  const parsedPrice =
    typeof raw.price === "number"
      ? raw.price
      : parseBDTPrice(raw.price);

  const price =
    Number.isFinite(parsedPrice) &&
    parsedPrice > 0
      ? Math.round(parsedPrice)
      : null;

  const parsedPreviousPrice =
    typeof raw.previousPrice === "number"
      ? raw.previousPrice
      : parseBDTPrice(
          raw.previousPrice
        );

  const previousPrice =
    Number.isFinite(
      parsedPreviousPrice
    ) &&
    parsedPreviousPrice > 0 &&
    price != null &&
    parsedPreviousPrice > price
      ? Math.round(
          parsedPreviousPrice
        )
      : null;

  const checkedAt =
    new Date().toISOString();

  const specs = normalizeSpecs(
    category,
    raw.specs || []
  );

  const sourceProductId = String(
    raw.sourceProductId ||
      raw.sourceUrl
  );

  const base = {
    sourceShopId: shop.id,

    sourceProductId,

    sourceUrl:
      raw.sourceUrl || null,

    category,

    brand:
      cleanText(raw.brand) ||
      null,

    name:
      cleanText(raw.name),

    model:
      cleanText(raw.model) ||
      null,

    price,

    previousPrice,

    availability:
      normalizeAvailability(
        raw.availabilityText
      ),

    images:
      Array.isArray(raw.images)
        ? raw.images
        : [],

    shortDescription:
      raw.shortDescription ||
      null,

    specs,

    checkedAt,
  };

  base.sourceHash =
    buildSourceHash({
      name: base.name,
      price: base.price,
      previousPrice:
        base.previousPrice,
      availability:
        base.availability,
      specs: base.specs,
    });

  return base;
}

// ------------------------------------------------------------
// LOCAL OFFER
// ------------------------------------------------------------

function buildOfferEntry(
  normalized,
  shop
) {
  const offer = {
    shop: shop.id,

    shopName: shop.name,

    price:
      normalized.price,

    availability:
      normalized.availability,

    updated: "Just now",

    sourceUrl:
      normalized.sourceUrl,

    sourceProductId:
      normalized.sourceProductId,

    sourceHash:
      normalized.sourceHash,

    lastChecked:
      normalized.checkedAt,

    active: true,
  };

  if (
    normalized.price != null &&
    normalized.previousPrice !=
      null &&
    normalized.previousPrice >
      normalized.price
  ) {
    offer.prev =
      normalized.previousPrice;
  }

  return offer;
}

// ------------------------------------------------------------
// UPDATE / CREATE PRODUCT
// ------------------------------------------------------------

function upsertLocalProduct(
  normalized,
  shop,
  decision,
  existingProduct
) {
  const offer =
    buildOfferEntry(
      normalized,
      shop
    );

  // ----------------------------------------------------------
  // NEW PRODUCT
  // ----------------------------------------------------------

  if (
    decision.decision === "new"
  ) {
    const productId =
      makeLocalId(
        shop.id,
        normalized.sourceProductId
      );

    const product = {
      id: productId,

      cat:
        normalized.category,

      brand:
        normalized.brand,

      name:
        normalized.name,

      model:
        normalized.model,

      discount:
        computeDiscount(
          normalized.price,
          normalized.previousPrice
        ),

      specs:
        normalized.specs,

      images:
        normalized.images,

      shortDescription:
        normalized.shortDescription,

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),
    };

    saveLocalProduct(
      product
    );

    saveLocalOffer(
      productId,
      offer
    );

    if (
      normalized.price != null
    ) {
      addLocalPriceHistory({
        productId,
        shopId: shop.id,
        price:
          normalized.price,
      });
    }

    return {
      productId,
      created: true,
      changed: true,
      priceChanged: true,
      historyRecorded:
        normalized.price != null,
    };
  }

  // ----------------------------------------------------------
  // MATCHED PRODUCT
  // ----------------------------------------------------------

  if (
    decision.decision ===
      "match" &&
    existingProduct
  ) {
    const previousOffer =
      (existingProduct.offers ||
        [])
        .find(
          (item) =>
            item.shop ===
            shop.id
        );

    // Same source data -> nothing to do.
    if (
      previousOffer &&
      previousOffer.sourceHash ===
        normalized.sourceHash
    ) {
      return {
        productId:
          existingProduct.id,

        created: false,
        changed: false,

        priceChanged: false,
        historyRecorded: false,
      };
    }

    const priceChanged =
      !previousOffer ||
      previousOffer.price !==
        normalized.price;

    const updatedProduct = {
      ...existingProduct,

      discount:
        computeDiscount(
          normalized.price,
          normalized.previousPrice
        ),

      specs:
        existingProduct.specs &&
        Object.keys(
          existingProduct.specs
        ).length
          ? existingProduct.specs
          : normalized.specs,

      images:
        Array.isArray(
          existingProduct.images
        ) &&
        existingProduct.images.length
          ? existingProduct.images
          : normalized.images,

      shortDescription:
        existingProduct.shortDescription ||
        normalized.shortDescription,

      updatedAt:
        new Date().toISOString(),
    };

    saveLocalProduct(
      updatedProduct
    );

    saveLocalOffer(
      existingProduct.id,
      offer
    );

    let historyRecorded =
      false;

    if (
      priceChanged &&
      normalized.price != null
    ) {
      addLocalPriceHistory({
        productId:
          existingProduct.id,

        shopId:
          shop.id,

        price:
          normalized.price,
      });

      historyRecorded = true;
    }

    return {
      productId:
        existingProduct.id,

      created: false,
      changed: true,

      priceChanged,
      historyRecorded,
    };
  }

  return {
    created: false,
    changed: false,
    priceChanged: false,
    historyRecorded: false,
  };
}

// ------------------------------------------------------------
// POST
// ------------------------------------------------------------

export async function POST(
  request
) {
  const startedAt =
    Date.now();

  let body;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid JSON body",
      },
      {
        status: 400,
      }
    );
  }

  const shopId =
    body?.shopId;

  const dryRun =
    Boolean(body?.dryRun);

  if (!shopId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "shopId is required",
      },
      {
        status: 400,
      }
    );
  }

  // ----------------------------------------------------------
  // LOCAL SHOP
  // ----------------------------------------------------------

  const shop =
    getLocalShop(shopId);

  if (!shop) {
    return NextResponse.json(
      {
        success: false,
        error:
          `Local shop "${shopId}" was not found.`,
      },
      {
        status: 404,
      }
    );
  }

  // ----------------------------------------------------------
  // ADAPTER
  // ----------------------------------------------------------

  const adapter =
    resolveAdapterForShop(
      shop.url
    );

  if (!adapter) {
    return NextResponse.json(
      {
        success: false,
        error:
          `No ingestion adapter registered for "${shop.url}".`,
      },
      {
        status: 400,
      }
    );
  }

  // ----------------------------------------------------------
  // SOURCES
  // ----------------------------------------------------------

  const sources =
    adapter.categorySources || [];

  if (!sources.length) {
    return NextResponse.json(
      {
        success: false,
        error:
          `No category sources configured for ${shop.name}.`,
      },
      {
        status: 400,
      }
    );
  }

  // ----------------------------------------------------------
  // COUNTERS
  // ----------------------------------------------------------

  const counters = {
    discovered: 0,
    parsed: 0,
    created: 0,
    updated: 0,
    matched: 0,
    ambiguous: 0,
    skipped: 0,
    failed: 0,
    disappeared: 0,
  };

  const preview = [];
  const errorLog = [];

  let logId = null;

  // ----------------------------------------------------------
  // LOG
  // ----------------------------------------------------------

  if (!dryRun) {
    logId =
      createLocalScrapingLog({
        shopId: shop.id,
        shopName: shop.name,
      });

    updateShopRunning(
      shop
    );
  }

  try {
    // --------------------------------------------------------
    // CATEGORY LOOP
    // --------------------------------------------------------

    for (
      const source of sources
    ) {
      let existingProducts =
        getLocalProducts(
          source.category
        );

      let itemsThisCategory = 0;

      // ------------------------------------------------------
      // PAGE LOOP
      // ------------------------------------------------------

      for (
        let page = 1;
        page <=
          MAX_PAGES_PER_CATEGORY;
        page++
      ) {
        if (
          itemsThisCategory >=
          MAX_ITEMS_PER_CATEGORY
        ) {
          break;
        }

        let discovery;

        try {
          discovery =
            await adapter.discoverCategoryPage(
              source.listingUrl,
              page
            );
        } catch (err) {
          counters.failed++;

          errorLog.push({
            stage: "discover",
            category:
              source.category,
            page,

            message:
              String(
                err?.message ||
                  err
              ),
          });

          continue;
        }

        const links =
          discovery?.links || [];

        counters.discovered +=
          links.length;

        // ----------------------------------------------------
        // PRODUCT LOOP
        // ----------------------------------------------------

        for (
          const link of links
        ) {
          if (
            itemsThisCategory >=
            MAX_ITEMS_PER_CATEGORY
          ) {
            break;
          }

          itemsThisCategory++;

          try {
            await sleep(
              REQUEST_DELAY_MS
            );

            const raw =
              await adapter.parseProductPage(
                link.url
              );

            if (!raw) {
              counters.skipped++;
              continue;
            }

            counters.parsed++;

            const normalized =
              toNormalized(
                raw,
                {
                  shop,
                  category:
                    source.category,
                }
              );

            if (
              !normalized.name
            ) {
              counters.skipped++;
              continue;
            }

            // ------------------------------------------------
            // MATCH
            // ------------------------------------------------

            const decision =
              matchCandidate(
                normalized,
                existingProducts
              );

            // ------------------------------------------------
            // DRY RUN
            // ------------------------------------------------

            if (dryRun) {
              preview.push({
                decision:
                  decision.decision,

                name:
                  normalized.name,

                brand:
                  normalized.brand,

                model:
                  normalized.model,

                category:
                  normalized.category,

                price:
                  normalized.price,

                previousPrice:
                  normalized.previousPrice,

                availability:
                  normalized.availability,

                productId:
                  decision.productId ||
                  null,

                reason:
                  decision.reason,

                candidates:
                  decision.candidates ||
                  [],
              });

              if (
                decision.decision ===
                "match"
              ) {
                counters.matched++;
              } else if (
                decision.decision ===
                "ambiguous"
              ) {
                counters.ambiguous++;
              } else {
                counters.created++;
              }

              continue;
            }

            // ------------------------------------------------
            // AMBIGUOUS
            // ------------------------------------------------

            if (
              decision.decision ===
              "ambiguous"
            ) {
              addLocalMatchReview({
                shopId:
                  shop.id,

                shopName:
                  shop.name,

                normalized,

                candidates:
                  decision.candidates ||
                  [],
              });

              counters.ambiguous++;
              continue;
            }

            // ------------------------------------------------
            // MATCH / NEW
            // ------------------------------------------------

            const existing =
              decision.decision ===
              "match"
                ? existingProducts.find(
                    (product) =>
                      product.id ===
                      decision.productId
                  )
                : null;

            const result =
              upsertLocalProduct(
                normalized,
                shop,
                decision,
                existing
              );

            if (
              decision.decision ===
              "match"
            ) {
              counters.matched++;

              if (
                result.changed
              ) {
                counters.updated++;
              }
            } else {
              counters.created++;

              const saved =
                getLocalProductSafe(
                  result.productId
                );

              if (saved) {
                existingProducts.push(
                  saved
                );
              }
            }
          } catch (err) {
            counters.failed++;

            errorLog.push({
              stage:
                "product",

              category:
                source.category,

              url:
                link.url,

              message:
                String(
                  err?.message ||
                    err
                ),
            });
          }
        }
      }
    }

    // --------------------------------------------------------
    // FINISH
    // --------------------------------------------------------

    const summary = {
      success: true,

      firestoreUsed:
        false,

      localDatabase:
        true,

      dryRun,

      shopId:
        shop.id,

      shopName:
        shop.name,

      durationMs:
        Date.now() -
        startedAt,

      ...counters,

      preview:
        dryRun
          ? preview.slice(0, 100)
          : [],

      errorLog:
        errorLog.slice(0, 100),
    };

    if (!dryRun) {
      finishLocalScrapingLog(
        logId,
        {
          status:
            counters.failed >
            0
              ? "completed_with_errors"
              : "completed",

          ...counters,

          errorLog,
        }
      );

      updateShopFinished(
        shop,
        counters
      );
    }

    return NextResponse.json(
      summary
    );
  } catch (err) {
    if (!dryRun && logId) {
      finishLocalScrapingLog(
        logId,
        {
          status: "failed",

          ...counters,

          failed:
            counters.failed + 1,

          errorLog: [
            ...errorLog,

            {
              stage:
                "fatal",

              message:
                String(
                  err?.message ||
                    err
                ),
            },
          ],
        }
      );

      updateShopError(
        shop
      );
    }

    return NextResponse.json(
      {
        success: false,

        firestoreUsed:
          false,

        localDatabase:
          true,

        error:
          String(
            err?.message ||
              err
          ),

        counters,
      },
      {
        status: 500,
      }
    );
  }
}

// ------------------------------------------------------------
// SHOP STATUS HELPERS
// ------------------------------------------------------------

function updateShopRunning(
  shop
) {
  saveLocalShop({
    ...shop,

    status: "running",

    lastRun:
      "Running...",
  });
}

function updateShopFinished(
  shop,
  counters
) {
  const totalOffers =
    getLocalProducts()
      .reduce(
        (sum, product) =>
          sum +
          (product.offers ||
            []).filter(
              (offer) =>
                offer.active !==
                false
            ).length,
        0
      );

  saveLocalShop({
    ...shop,

    status:
      counters.failed > 0
        ? "error"
        : "active",

    lastRun:
      "Just now",

    offers:
      totalOffers,
  });
}

function updateShopError(
  shop
) {
  saveLocalShop({
    ...shop,

    status: "error",

    lastRun:
      "Failed",
  });
}

// ------------------------------------------------------------
// SAFE PRODUCT READ
// ------------------------------------------------------------

function getLocalProductSafe(productId) {
  if (!productId) {
    return null;
  }

  return getLocalProduct(productId);
}