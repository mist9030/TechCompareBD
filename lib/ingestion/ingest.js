// lib/ingestion/ingest.js
//
// Retailer-agnostic ingestion pipeline:
//
// RETAILER
//   -> discover
//   -> parse
//   -> normalize
//   -> match
//   -> create/update canonical Product + ShopOffer
//   -> record PriceHistory
//   -> disappearance detection
//   -> Firestore
//
// Server-only. Never import this file from a "use client" component.
//

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firestoreAdmin.js";
import { resolveAdapterForShop } from "./registry.js";

import {
  parseBDTPrice,
  normalizeAvailability,
  normalizeSpecs,
  buildSourceHash,
  cleanText,
  absoluteUrl,
  isUsableImage,
  cleanProductName,
  looksLikeListingTitle,
} from "./normalize.mjs";

import { matchCandidate } from "./match.mjs";


// ============================================================
// CONFIG
// ============================================================

const MAX_PAGES_PER_CATEGORY =
  Number(process.env.INGEST_MAX_PAGES_PER_CATEGORY) || 2;

const MAX_ITEMS_PER_CATEGORY =
  Number(process.env.INGEST_MAX_ITEMS_PER_CATEGORY) || 40;

const REQUEST_DELAY_MS =
  Number(process.env.INGEST_REQUEST_DELAY_MS) || 150;

// Number of product pages fetched in parallel. Fetch/parse is parallelized,
// but matching and Firestore writes remain sequential below so existing
// matching behavior stays deterministic and safe.
const PRODUCT_FETCH_CONCURRENCY =
  Number(process.env.INGEST_PRODUCT_CONCURRENCY) || 4;


// ============================================================
// HELPERS
// ============================================================

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAndParseProducts(
  adapter,
  links,
  concurrency = PRODUCT_FETCH_CONCURRENCY
) {
  const results = new Array(links.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= links.length) return;

      const link = links[index];

      try {
        // Delay per worker keeps requests spaced while allowing a small,
        // controlled amount of parallelism.
        if (REQUEST_DELAY_MS > 0) {
          await sleep(REQUEST_DELAY_MS);
        }

        const raw = await adapter.parseProductPage(link.url);
        results[index] = { link, raw, error: null };
      } catch (error) {
        results[index] = { link, raw: null, error };
      }
    }
  };

  const workerCount = Math.min(
    Math.max(1, concurrency),
    links.length
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return results;
}


// Bumps meta/catalog.{field} to serverTimestamp() — the same document the
// client-side cache watches via a single onSnapshot listener (see
// lib/cache/catalogSync.js). This is the Admin SDK counterpart of
// lib/data.js:bumpCatalogMeta, used by every ingestion write path so a
// scrape run or a match-review action reaches already-open browsers the
// same way an admin panel edit does. Never throws: a failed bump must not
// fail an ingestion run that already wrote real product/shop data.
async function bumpCatalogMeta(db, field) {
  try {
    await db.doc("meta/catalog").set({ [field]: FieldValue.serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error(`Failed to bump catalog meta (${field})`, err);
  }
}


function computeDiscount(price, previousPrice) {
  if (
    !price ||
    !previousPrice ||
    previousPrice <= price
  ) {
    return 0;
  }

  return Math.round(
    ((previousPrice - price) / previousPrice) * 100
  );
}


// ============================================================
// OFFER
// ============================================================

function buildOfferEntry(normalized, shop) {
  const offer = {
    shop: shop.id,
    shopName: shop.name,

    price: normalized.price,
priceText: normalized.priceText || null,
availability: normalized.availability,

    // Kept for compatibility with the existing frontend.
    updated: "Just now",

    sourceUrl: normalized.sourceUrl,
    sourceProductId: normalized.sourceProductId,
    sourceHash: normalized.sourceHash,

    lastChecked: normalized.checkedAt,

    active: true,
  };

  if (
    normalized.price != null &&
    normalized.previousPrice != null &&
    normalized.previousPrice > normalized.price
  ) {
    offer.prev = normalized.previousPrice;
  }

  return offer;
}


// ============================================================
// NORMALIZATION
// ============================================================

function toNormalized(raw, { shop, category }) {
  const parsedPrice =
    typeof raw.price === "number"
      ? raw.price
      : parseBDTPrice(raw.price);

  const price =
    Number.isFinite(parsedPrice) && parsedPrice > 0
      ? Math.round(parsedPrice)
      : null;


  const parsedPreviousPrice =
    typeof raw.previousPrice === "number"
      ? raw.previousPrice
      : parseBDTPrice(raw.previousPrice);

  const previousPrice =
    Number.isFinite(parsedPreviousPrice) &&
    parsedPreviousPrice > 0
      ? Math.round(parsedPreviousPrice)
      : null;


  const checkedAt = new Date().toISOString();

  const specs = normalizeSpecs(
    category,
    raw.specs || []
  );


  const base = {
    sourceShopId: shop.id,

    sourceProductId: String(
      raw.sourceProductId || raw.sourceUrl
    ),

    sourceUrl: raw.sourceUrl,

    category,

    brand:
      cleanText(raw.brand) || null,

    name:
      cleanProductName(raw.name),

    model:
      cleanText(raw.model) || null,

   price,
// What the shop shows instead of a price ("Up Coming", "Call For Price").
priceText:
price == null
? cleanText(raw.priceText) || null
: null,
previousPrice:
previousPrice != null &&
      price != null &&
      previousPrice > price
        ? previousPrice
        : null,

    availability:
      normalizeAvailability(
        raw.availabilityText
      ),

    // Absolute URLs only, and never a logo/banner/placeholder.
    images: (raw.images || [])
      .map((u) => absoluteUrl(u, raw.sourceUrl))
      .filter(isUsableImage),

    shortDescription:
      raw.shortDescription || null,

    specs,

    checkedAt,
  };


  base.sourceHash = buildSourceHash({
    name: base.name,
    price: base.price,
    previousPrice: base.previousPrice,
   availability: base.availability,
specs: base.specs,
// Only included when present, so hashes of normal offers stay unchanged.
...(base.priceText ? { priceText: base.priceText } : {}),
});


  return base;
}


// ============================================================
// CREATE PRODUCT
// ============================================================

async function createProduct(
  db,
  normalized,
  shop
) {
  const ref = db
    .collection("products")
    .doc();

  const offer =
    buildOfferEntry(
      normalized,
      shop
    );


  await ref.set({
    cat: normalized.category,

    brand: normalized.brand,

    name: normalized.name,

    model: normalized.model,

    discount: computeDiscount(
      normalized.price,
      normalized.previousPrice
    ),

    specs: normalized.specs,

    images: normalized.images,

    shortDescription:
      normalized.shortDescription,

    offers: [offer],

    createdAt:
      FieldValue.serverTimestamp(),

    updatedAt:
      FieldValue.serverTimestamp(),
  });


  // Only create price history when
  // an actual numeric price exists.
  if (normalized.price != null) {
    await ref
      .collection("priceHistory")
      .add({
        shop: shop.id,

        price: normalized.price,

        observedAt:
          FieldValue.serverTimestamp(),
      });
  }


  return ref.id;
}


// ============================================================
// UPDATE PRODUCT OFFER
// ============================================================

async function updateProductOffer(
  db,
  productId,
  normalized,
  shop,
  existingProduct
) {
  const ref = db
    .collection("products")
    .doc(productId);


  const offers = [
    ...(existingProduct.offers || []),
  ];


  const idx = offers.findIndex(
    (offer) =>
      offer.shop === shop.id
  );


  const previousOffer =
    idx >= 0
      ? offers[idx]
      : null;


  // ----------------------------------------------------------
  // IDEMPOTENCY
  //
  // If source data has not changed, do absolutely nothing.
  // This avoids unnecessary Product updates and priceHistory
  // writes.
  // ----------------------------------------------------------

  // A wrong/missing photo can be repaired even when nothing else changed.
  const needsImageFix =
    (normalized.images || []).some(isUsableImage) &&
    !(existingProduct.images || []).some(isUsableImage);

  if (
    previousOffer &&
    previousOffer.sourceHash === normalized.sourceHash &&
    !needsImageFix
  ) {
    return {
      changed: false,
      priceChanged: false,
      historyRecorded: false,
    };
  }


  // ----------------------------------------------------------
  // BUILD NEW OFFER
  // ----------------------------------------------------------

  const newOffer =
    buildOfferEntry(
      normalized,
      shop
    );


  if (idx >= 0) {
    offers[idx] = newOffer;
  } else {
    offers.push(newOffer);
  }


  // ----------------------------------------------------------
  // PRICE CHANGE
  // ----------------------------------------------------------

  const priceChanged =
    !previousOffer ||
    previousOffer.price !==
      normalized.price;


  // ----------------------------------------------------------
  // BEST DISCOUNT
  // ----------------------------------------------------------

  const bestDiscount =
    Math.max(
      0,

      ...offers
        .filter(
          (offer) =>
            offer.active !== false &&
            Number.isFinite(
              Number(offer.price)
            ) &&
            Number(offer.price) > 0
        )
        .map(
          (offer) =>
            computeDiscount(
              offer.price,
              offer.prev
            )
        )
    );


  // ----------------------------------------------------------
  // PRODUCT UPDATE
  // ----------------------------------------------------------

  const update = {
    offers,

    discount:
      bestDiscount,

    updatedAt:
      FieldValue.serverTimestamp(),
  };


  // Tidy names that an earlier version saved with the page-title suffix
  // ("... Price in Bangladesh").
  const tidyName = cleanProductName(existingProduct.name);
  if (tidyName && tidyName !== existingProduct.name) {
    update.name = tidyName;
  }

  // ----------------------------------------------------------
  // BACKFILL SPECS
  // ----------------------------------------------------------

  if (
    normalized.specs &&
    Object.keys(
      normalized.specs
    ).length &&
    !existingProduct.specs
  ) {
    update.specs =
      normalized.specs;
  }


  // ----------------------------------------------------------
  // BACKFILL IMAGES
  // ----------------------------------------------------------

  if (
    (normalized.images || []).some(isUsableImage) &&
    !(existingProduct.images || []).some(isUsableImage)
  ) {
    update.images =
      normalized.images;
  }


  await ref.update(update);


  // ----------------------------------------------------------
  // PRICE HISTORY
  //
  // IMPORTANT:
  //
  // We do NOT read priceHistory just to check if a record
  // exists. sourceHash idempotency above already prevents
  // duplicate unchanged observations.
  // ----------------------------------------------------------

  let historyRecorded = false;


  if (
    normalized.price != null &&
    priceChanged
  ) {
    await ref
      .collection("priceHistory")
      .add({
        shop: shop.id,

        price:
          normalized.price,

        observedAt:
          FieldValue.serverTimestamp(),
      });

    historyRecorded = true;
  }


  return {
    changed: true,

    priceChanged,

    historyRecorded,
  };
}


// ============================================================
// AMBIGUOUS MATCH
// ============================================================

async function recordAmbiguous(
  db,
  normalized,
  candidates,
  shop
) {
  await db
    .collection("match_review")
    .add({
      shopId: shop.id,

      shopName: shop.name,

      normalized,

      candidates:
        candidates || [],

      status: "pending",

      createdAt:
        FieldValue.serverTimestamp(),
    });
}


// ============================================================
// DISAPPEARANCE DETECTION
// ============================================================

async function markDisappearedOffers(
  db,
  shop,
  existingProducts,
  seenSourceIds
) {
  let count = 0;


  for (
    const product of existingProducts
  ) {
    const offers =
      product.offers || [];


    const idx =
      offers.findIndex(
        (offer) =>
          offer.shop === shop.id &&
          offer.active !== false
      );


    if (idx < 0) {
      continue;
    }


    // Still exists on retailer.
    if (
      seenSourceIds.has(
        offers[idx].sourceProductId
      )
    ) {
      continue;
    }


    const updatedOffers = [
      ...offers,
    ];


    updatedOffers[idx] = {
      ...updatedOffers[idx],

      active: false,

      availability:
        "out_of_stock",

      lastChecked:
        new Date().toISOString(),
    };


    const bestDiscount =
      Math.max(
        0,

        ...updatedOffers
          .filter(
            (offer) =>
              offer.active !== false &&
              Number.isFinite(
                Number(offer.price)
              ) &&
              Number(offer.price) > 0
          )
          .map(
            (offer) =>
              computeDiscount(
                offer.price,
                offer.prev
              )
          )
      );


    await db
      .collection("products")
      .doc(product.id)
      .update({
        offers:
          updatedOffers,

        discount:
          bestDiscount,

        updatedAt:
          FieldValue.serverTimestamp(),
      });


    count++;
  }


  return count;
}


// ============================================================
// LOAD EXISTING PRODUCTS
// ============================================================
//
// IMPORTANT:
//
// This query is required by the current matchCandidate()
// architecture because matching is performed against the
// canonical products in that category.
//
// It is deliberately done ONCE per category, not once per
// product.
//

async function loadExistingProducts(db, category, cache = null) {
  // ----------------------------------------------------------
  // CATEGORY CACHE
  //
  // If this category was already loaded during this sync,
  // reuse the in-memory copy instead of querying Firestore again.
  // ----------------------------------------------------------

  if (cache && cache.has(category)) {
    const cached = cache.get(category);

    console.log(
      `[INGEST] category=${category} existingProducts=${cached.length} source=cache`
    );

    return cached;
  }

  // ----------------------------------------------------------
  // FIRESTORE READ
  //
  // This is intentionally still the full category query for now.
  // We are NOT changing matching behavior yet.
  // ----------------------------------------------------------

  const snap = await db
    .collection("products")
    .where("cat", "==", category)
    .get();

 const products = snap.docs
.map((doc) => ({
id: doc.id,
...doc.data(),
}))
// Soft-deleted products must never be matched / revived by a sync.
.filter((p) => !p.deleted);

  console.log(
    `[INGEST] category=${category} existingProducts=${products.length} source=firestore`
  );

  if (cache) {
    cache.set(category, products);
  }

  return products;
}


// ============================================================
// MAIN SYNC
// ============================================================

export async function runSync({
  shopId,
  categories,
  dryRun = false,
} = {}) {
  const db =
    getAdminDb();


  // ----------------------------------------------------------
  // LOAD SHOP
  // ----------------------------------------------------------

  const shopSnap =
    await db
      .collection("shops")
      .doc(shopId)
      .get();


  if (!shopSnap.exists) {
    throw new Error(
      `Unknown shop: ${shopId}`
    );
  }


 const shop = {
id: shopSnap.id,
...shopSnap.data(),
};
if (shop.deleted) {
throw new Error(`Shop "${shop.name}" was deleted- restore it before syncing.`);
}


  // ----------------------------------------------------------
  // DRY RUN DOES NOT CHANGE SHOP STATUS
  // ----------------------------------------------------------

  if (!dryRun) {
    await db
      .collection("shops")
      .doc(shop.id)
      .update({
        status: "running",

        syncStartedAt:
          FieldValue.serverTimestamp(),

        lastSyncStatus:
          "running",
      });
  }


  let jobRef = null;


  try {
    // --------------------------------------------------------
    // RESOLVE ADAPTER
    // --------------------------------------------------------

    const adapter =
      resolveAdapterForShop(
        shop.url
      );


    if (!adapter) {
      throw new Error(
        `No ingestion adapter registered for "${shop.url}". Add one in lib/ingestion/adapters/ and register it in lib/ingestion/registry.js.`
      );
    }


    const sources =
      adapter.categorySources.filter(
        (source) =>
          !categories ||
          categories.includes(
            source.category
          )
      );


    // --------------------------------------------------------
    // SCRAPING LOG
    // --------------------------------------------------------

    if (!dryRun) {
      jobRef =
        await db
          .collection("scraping_logs")
          .add({
            shopId: shop.id,

            shopName: shop.name,

            status: "running",

            startedAt:
              FieldValue.serverTimestamp(),

            discovered: 0,

            parsed: 0,

            created: 0,

            updated: 0,

            matched: 0,

            ambiguous: 0,

            skipped: 0,

            failed: 0,

            disappeared: 0,

            found: 0,

            errorLog: [],
          });
    }


    // --------------------------------------------------------
    // COUNTERS
    // --------------------------------------------------------

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


    const errorLog = [];

    const preview = [];
// --------------------------------------------------------
// EXISTING PRODUCT CACHE
//
// One in-memory cache for the entire sync run.
// Prevents the same category from being read from Firestore
// more than once during a single sync.
// --------------------------------------------------------

const existingProductsCache = new Map();

console.log(
  `[INGEST] Starting sync. Product category cache initialized.`
);

    // ========================================================
    // CATEGORY LOOP
    // ========================================================

    for (
      const source of sources
    ) {
      // Load canonical products once per category.
      let existingProducts =
  await loadExistingProducts(
    db,
    source.category,
    existingProductsCache
  );


      let itemsThisCategory = 0;

      let coverageComplete = false;

      let discoverFailed = false;

      const seenSourceIds =
        new Set();


      // ======================================================
      // PAGE LOOP
      // ======================================================

      for (
        let page = 1;
        page <=
          MAX_PAGES_PER_CATEGORY;
        page++
      ) {
        let discovery;


        try {
          discovery =
            await adapter
              .discoverCategoryPage(
                source.listingUrl,
                page
              );
        } catch (err) {
          counters.failed++;


          errorLog.push({
            stage:
              "discover",

            category:
              source.category,

            page,

            message:
              String(
                err?.message ||
                  err
              ),
          });


          discoverFailed = true;

          break;
        }


        const links =
          discovery?.links || [];


        counters.discovered +=
          links.length;


        // ====================================================
        // PRODUCT FETCH / PARSE
        //
        // Fetching product pages is the expensive part of ingestion.
        // Run a small controlled number in parallel, then process the
        // parsed results sequentially so matching/Firestore writes remain
        // deterministic. This cuts wall-clock time without turning the
        // scraper into an uncontrolled burst of requests.
        // ====================================================

        const remaining =
          MAX_ITEMS_PER_CATEGORY - itemsThisCategory;

        if (remaining <= 0) {
          break;
        }

        const batchLinks = links.slice(0, remaining);
        itemsThisCategory += batchLinks.length;

        const parsedResults =
          await fetchAndParseProducts(
            adapter,
            batchLinks
          );

        // ====================================================
        // PRODUCT PROCESSING LOOP
        // ====================================================

        for (const { link, raw, error } of parsedResults) {
          try {
            if (error) {
              throw error;
            }

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


            if (!normalized.name) {
              counters.skipped++;
              continue;
            }

            // Judge the RAW page title (cleanProductName already removed "Price in BD").
            if (looksLikeListingTitle(raw.name) && normalized.price == null) {
              counters.skipped++;
              continue;
            }


            // Used for disappearance detection.
            seenSourceIds.add(
              normalized.sourceProductId
            );


            // ==================================================
            // MATCH
            // ==================================================

            const decision =
              matchCandidate(
                normalized,
                existingProducts
              );


            // ==================================================
            // NEW PRODUCT
            // ==================================================

            if (
              decision.decision ===
              "new"
            ) {
              if (dryRun) {
                preview.push({
                  decision:
                    "new",

                  name:
                    normalized.name,

                  price:
                    normalized.price,

                  category:
                    source.category,
                });
              } else {
                const newId =
                  await createProduct(
                    db,
                    normalized,
                    shop
                  );


                // Keep in-memory products updated.
                existingProducts.push({
                  id: newId,

                  cat:
                    normalized.category,

                  brand:
                    normalized.brand,

                  name:
                    normalized.name,

                  model:
                    normalized.model,

                  offers: [
                    buildOfferEntry(
                      normalized,
                      shop
                    ),
                  ],
                });
              }


              counters.created++;

              continue;
            }


            // ==================================================
            // MATCHED PRODUCT
            // ==================================================

            if (
              decision.decision ===
              "match"
            ) {
              if (dryRun) {
                preview.push({
                  decision:
                    "match",

                  name:
                    normalized.name,

                  price:
                    normalized.price,

                  productId:
                    decision.productId,

                  reason:
                    decision.reason,
                });
              } else {
                const existing =
                  existingProducts.find(
                    (product) =>
                      product.id ===
                      decision.productId
                  );


                if (!existing) {
                  counters.failed++;

                  errorLog.push({
                    stage:
                      "match",

                    url:
                      normalized.sourceUrl,

                    message:
                      `Matched product ${decision.productId} was not found in the in-memory category cache.`,
                  });

                  continue;
                }


                const result =
                  await updateProductOffer(
                    db,
                    decision.productId,
                    normalized,
                    shop,
                    existing
                  );


                if (result.changed) {
                  // Keep local cache synchronized.
                  const offerIndex =
                    existing.offers.findIndex(
                      (offer) =>
                        offer.shop ===
                        shop.id
                    );


                  const offer =
                    buildOfferEntry(
                      normalized,
                      shop
                    );


                  if (
                    offerIndex >= 0
                  ) {
                    existing.offers[
                      offerIndex
                    ] = offer;
                  } else {
                    existing.offers.push(
                      offer
                    );
                  }


                  counters.updated++;
                }
              }


              counters.matched++;

              continue;
            }


            // ==================================================
            // AMBIGUOUS
            // ==================================================

            if (dryRun) {
              preview.push({
                decision:
                  "ambiguous",

                name:
                  normalized.name,

                price:
                  normalized.price,

                candidates:
                  decision.candidates ||
                  [],
              });
            } else {
              await recordAmbiguous(
                db,
                normalized,
                decision.candidates,
                shop
              );
            }


            counters.ambiguous++;
          } catch (err) {
            counters.failed++;


            errorLog.push({
              stage:
                "parse",

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


        // ======================================================
        // COVERAGE CHECK
        // ======================================================

        const reachedItemLimit =
          itemsThisCategory >=
          MAX_ITEMS_PER_CATEGORY;


        const reachedPageLimit =
          page >=
          MAX_PAGES_PER_CATEGORY;


        const reachedEndOfCatalog =
          page >=
          (Number(
            discovery?.totalPages
          ) || 1);


        if (
          reachedEndOfCatalog &&
          !reachedItemLimit
        ) {
          coverageComplete =
            true;

          break;
        }


        if (
          reachedItemLimit ||
          reachedPageLimit
        ) {
          // Partial sync.
          //
          // DO NOT mark products as disappeared.
          coverageComplete =
            false;

          break;
        }
      }


      // ========================================================
      // DISAPPEARANCE DETECTION
      // ========================================================

      if (
        coverageComplete &&
        !discoverFailed
      ) {
        if (dryRun) {
          const wouldDisappear =
            existingProducts.filter(
              (product) => {
                const offer =
                  (
                    product.offers ||
                    []
                  ).find(
                    (item) =>
                      item.shop ===
                        shop.id &&
                      item.active !==
                        false
                  );


                return (
                  offer &&
                  !seenSourceIds.has(
                    offer.sourceProductId
                  )
                );
              }
            );


          counters.disappeared +=
            wouldDisappear.length;


          if (
            wouldDisappear.length
          ) {
            preview.push({
              decision:
                "would_mark_disappeared",

              category:
                source.category,

              productIds:
                wouldDisappear.map(
                  (product) =>
                    product.id
                ),
            });
          }
        } else {
          counters.disappeared +=
            await markDisappearedOffers(
              db,
              shop,
              existingProducts,
              seenSourceIds
            );
        }
      }
    }


    // ========================================================
    // FINAL STATUS
    // ========================================================

    const status =
      counters.failed > 0 &&
      counters.parsed === 0
        ? "failed"
        : counters.failed > 0
        ? "completed_with_errors"
        : "completed";


    // ========================================================
    // DRY RUN
    // ========================================================

    if (dryRun) {
      return {
        dryRun: true,

        status,

        ...counters,

        errors:
          errorLog.length,

        errorLog:
          errorLog.slice(
            0,
            25
          ),

        preview:
          preview.slice(
            0,
            50
          ),
      };
    }


    // ========================================================
    // UPDATE SCRAPING LOG
    // ========================================================

    if (jobRef) {
      await jobRef.update({
        status,

        finishedAt:
          FieldValue.serverTimestamp(),

        ...counters,

        found:
          counters.discovered,

        errorLog:
          errorLog.slice(
            0,
            25
          ),
      });
    }


    // ========================================================
    // UPDATE SHOP
    // ========================================================

    await db
      .collection("shops")
      .doc(shop.id)
      .update({
        status:
          status === "failed"
            ? "error"
            : "active",

        lastRunAt:
          FieldValue.serverTimestamp(),

        lastSyncStatus:
          status,

        syncFinishedAt:
          FieldValue.serverTimestamp(),
      });


    // ========================================================
    // BUMP CATALOG SYNC METADATA
    //
    // Once per run, not once per product — createProduct/
    // updateProductOffer/markDisappearedOffers can touch dozens or
    // hundreds of docs in a single run, and bumping a single shared
    // meta document that many times in a row is unnecessary write
    // load. One bump at the end is enough for every already-open
    // browser's listener (see lib/cache/catalogSync.js) to pick up
    // everything this run changed in one delta query.
    // ========================================================

    if (
      counters.created > 0 ||
      counters.updated > 0 ||
      counters.disappeared > 0
    ) {
      await bumpCatalogMeta(
        db,
        "productsUpdatedAt"
      );
    }

    await bumpCatalogMeta(
      db,
      "shopsUpdatedAt"
    );


    return {
      jobId:
        jobRef?.id || null,

      status,

      ...counters,

      errors:
        errorLog.length,
    };
  } catch (err) {
    // ========================================================
    // GLOBAL SYNC ERROR
    //
    // VERY IMPORTANT:
    // Never leave shop stuck at "running".
    // ========================================================

    const message =
      String(
        err?.message ||
          err
      );


    if (!dryRun) {
      try {
        if (jobRef) {
          await jobRef.update({
            status: "failed",

            finishedAt:
              FieldValue.serverTimestamp(),

            errorLog: [
              {
                stage:
                  "sync",

                message,
              },
            ],
          });
        }


        await db
          .collection("shops")
          .doc(shop.id)
          .update({
            status: "error",

            lastSyncStatus:
              "failed",

            syncFinishedAt:
              FieldValue.serverTimestamp(),

            lastSyncError:
              message,
          });

        await bumpCatalogMeta(
          db,
          "shopsUpdatedAt"
        );
      } catch (statusErr) {
        console.error(
          "Failed to update sync error status:",
          statusErr
        );
      }
    }


    throw err;
  }
}


// ============================================================
// MATCH REVIEW ACTIONS
// ============================================================

export async function applyMatchToExistingProduct(
  productId,
  normalized,
  shop
) {
  const db =
    getAdminDb();


  const snap =
    await db
      .collection("products")
      .doc(productId)
      .get();


  if (!snap.exists) {
    throw new Error(
      `Product ${productId} no longer exists`
    );
  }


  const result =
    await updateProductOffer(
      db,
      productId,
      normalized,
      shop,
      {
        id: snap.id,
        ...snap.data(),
      }
    );


  // Outside runSync()'s batching — this is a single one-off admin action,
  // so bump right away instead of waiting for a run that isn't happening.
  await bumpCatalogMeta(
    db,
    "productsUpdatedAt"
  );


  return result;
}


export async function createProductFromReview(
  normalized,
  shop
) {
  const db =
    getAdminDb();


  const result =
    await createProduct(
      db,
      normalized,
      shop
    );


  await bumpCatalogMeta(
    db,
    "productsUpdatedAt"
  );


  return result;
}


// ============================================================
// EXPORT
// ============================================================

export {
  toNormalized,
};