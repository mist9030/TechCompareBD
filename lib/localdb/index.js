// lib/localdb/index.js
//
// Local SQLite database for TechCompare development.
//
// IMPORTANT:
// - This database is LOCAL ONLY.
// - It does NOT use Firebase.
// - Production Firebase mode will remain separate.
// - The database file is created automatically at:
//     data/techcompare-local.db
//
// Current product structure intentionally mirrors the important
// fields used by the Firebase ingestion pipeline so that the same
// normalized data can later be migrated to Firestore.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "techcompare-local.db");

// ------------------------------------------------------------
// CREATE DATA DIRECTORY
// ------------------------------------------------------------

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });
}

// ------------------------------------------------------------
// DATABASE
// ------------------------------------------------------------

const db = new Database(DB_PATH);

// Better SQLite defaults for local development.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ------------------------------------------------------------
// SCHEMA
// ------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_letter TEXT,
    status TEXT DEFAULT 'idle',
    last_run TEXT DEFAULT 'Never',
    offers INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,

    cat TEXT,
    brand TEXT,
    name TEXT NOT NULL,
    model TEXT,

    discount INTEGER DEFAULT 0,

    specs TEXT,
    images TEXT,
    short_description TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    product_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,

    shop_name TEXT,

    price INTEGER,
    prev INTEGER,

    availability TEXT,

    updated TEXT,

    source_url TEXT,
    source_product_id TEXT,
    source_hash TEXT,

    last_checked TEXT,

    active INTEGER DEFAULT 1,

    UNIQUE(product_id, shop_id),

    FOREIGN KEY(product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,

    FOREIGN KEY(shop_id)
      REFERENCES shops(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    product_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,

    price INTEGER NOT NULL,

    observed_at TEXT NOT NULL,

    FOREIGN KEY(product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,

    FOREIGN KEY(shop_id)
      REFERENCES shops(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scraping_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    shop_id TEXT NOT NULL,
    shop_name TEXT,

    status TEXT,

    started_at TEXT,
    completed_at TEXT,

    discovered INTEGER DEFAULT 0,
    parsed INTEGER DEFAULT 0,
    created INTEGER DEFAULT 0,
    updated INTEGER DEFAULT 0,
    matched INTEGER DEFAULT 0,
    ambiguous INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    disappeared INTEGER DEFAULT 0,

    error_log TEXT,

    FOREIGN KEY(shop_id)
      REFERENCES shops(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    shop_id TEXT NOT NULL,
    shop_name TEXT,

    normalized TEXT,
    candidates TEXT,

    status TEXT DEFAULT 'pending',

    created_at TEXT NOT NULL,

    FOREIGN KEY(shop_id)
      REFERENCES shops(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_products_category
    ON products(cat);

  CREATE INDEX IF NOT EXISTS idx_products_brand
    ON products(brand);

  CREATE INDEX IF NOT EXISTS idx_offers_product
    ON offers(product_id);

  CREATE INDEX IF NOT EXISTS idx_offers_shop
    ON offers(shop_id);

  CREATE INDEX IF NOT EXISTS idx_price_history_product
    ON price_history(product_id);

  CREATE INDEX IF NOT EXISTS idx_scraping_logs_shop
    ON scraping_logs(shop_id);
`);

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------
// SHOP FUNCTIONS
// ------------------------------------------------------------

export function getLocalShops() {
  return db
    .prepare(
      `
      SELECT
        id,
        name,
        url,
        logo_letter AS logoLetter,
        status,
        last_run AS lastRun,
        offers,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM shops
      ORDER BY name COLLATE NOCASE
      `
    )
    .all();
}

export function getLocalShop(id) {
  const row = db
    .prepare(
      `
      SELECT
        id,
        name,
        url,
        logo_letter AS logoLetter,
        status,
        last_run AS lastRun,
        offers,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM shops
      WHERE id = ?
      `
    )
    .get(id);

  return row || null;
}

export function saveLocalShop(shop) {
  const timestamp = now();

  const stmt = db.prepare(`
    INSERT INTO shops (
      id,
      name,
      url,
      logo_letter,
      status,
      last_run,
      offers,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(id)
    DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      logo_letter = excluded.logo_letter,
      status = excluded.status,
      last_run = excluded.last_run,
      offers = excluded.offers,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    shop.id,
    shop.name,
    shop.url,
    shop.logoLetter ||
      shop.name?.[0]?.toUpperCase() ||
      "S",
    shop.status || "idle",
    shop.lastRun || "Never",
    Number(shop.offers || 0),
    shop.createdAt || timestamp,
    timestamp
  );

  return getLocalShop(shop.id);
}

export function updateLocalShop(id, data) {
  const existing = getLocalShop(id);

  if (!existing) {
    throw new Error(
      `Local shop "${id}" does not exist.`
    );
  }

  const updated = {
    ...existing,
    ...data,
  };

  return saveLocalShop(updated);
}

export function deleteLocalShop(id) {
  const result = db
    .prepare(
      `
      DELETE FROM shops
      WHERE id = ?
      `
    )
    .run(id);

  return result.changes > 0;
}

// ------------------------------------------------------------
// PRODUCT FUNCTIONS
// ------------------------------------------------------------

export function getLocalProducts(category = null) {
  const rows = category
    ? db
        .prepare(
          `
          SELECT *
          FROM products
          WHERE cat = ?
          ORDER BY name COLLATE NOCASE
          `
        )
        .all(category)
    : db
        .prepare(
          `
          SELECT *
          FROM products
          ORDER BY name COLLATE NOCASE
          `
        )
        .all();

  return rows.map((row) => ({
    id: row.id,

    cat: row.cat,
    brand: row.brand,
    name: row.name,
    model: row.model,

    discount: row.discount || 0,

    specs: parseJson(row.specs, {}),
    images: parseJson(row.images, []),

    shortDescription:
      row.short_description || null,

    offers: getLocalOffers(row.id),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getLocalProduct(id) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM products
      WHERE id = ?
      `
    )
    .get(id);

  if (!row) return null;

  return {
    id: row.id,

    cat: row.cat,
    brand: row.brand,
    name: row.name,
    model: row.model,

    discount: row.discount || 0,

    specs: parseJson(row.specs, {}),
    images: parseJson(row.images, []),

    shortDescription:
      row.short_description || null,

    offers: getLocalOffers(row.id),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveLocalProduct(product) {
  const timestamp = now();

  db.prepare(`
    INSERT INTO products (
      id,
      cat,
      brand,
      name,
      model,
      discount,
      specs,
      images,
      short_description,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(id)
    DO UPDATE SET
      cat = excluded.cat,
      brand = excluded.brand,
      name = excluded.name,
      model = excluded.model,
      discount = excluded.discount,
      specs = excluded.specs,
      images = excluded.images,
      short_description = excluded.short_description,
      updated_at = excluded.updated_at
  `).run(
    product.id,
    product.cat || null,
    product.brand || null,
    product.name,
    product.model || null,
    Number(product.discount || 0),
    JSON.stringify(product.specs || {}),
    JSON.stringify(product.images || []),
    product.shortDescription || null,
    product.createdAt || timestamp,
    timestamp
  );

  return getLocalProduct(product.id);
}

// ------------------------------------------------------------
// OFFER FUNCTIONS
// ------------------------------------------------------------

export function getLocalOffers(productId) {
  const rows = db
    .prepare(
      `
      SELECT
        shop_id AS shop,
        shop_name AS shopName,

        price,
        prev,

        availability,
        updated,

        source_url AS sourceUrl,
        source_product_id AS sourceProductId,
        source_hash AS sourceHash,

        last_checked AS lastChecked,

        active
      FROM offers
      WHERE product_id = ?
      ORDER BY price ASC
      `
    )
    .all(productId);

  return rows.map((offer) => ({
    ...offer,

    active:
      offer.active !== 0,

    price:
      offer.price != null
        ? Number(offer.price)
        : null,

    prev:
      offer.prev != null
        ? Number(offer.prev)
        : null,
  }));
}

export function saveLocalOffer(
  productId,
  offer
) {
  const timestamp = now();

  db.prepare(`
    INSERT INTO offers (
      product_id,
      shop_id,
      shop_name,
      price,
      prev,
      availability,
      updated,
      source_url,
      source_product_id,
      source_hash,
      last_checked,
      active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(product_id, shop_id)
    DO UPDATE SET
      shop_name = excluded.shop_name,
      price = excluded.price,
      prev = excluded.prev,
      availability = excluded.availability,
      updated = excluded.updated,
      source_url = excluded.source_url,
      source_product_id = excluded.source_product_id,
      source_hash = excluded.source_hash,
      last_checked = excluded.last_checked,
      active = excluded.active
  `).run(
    productId,

    offer.shop,
    offer.shopName || null,

    offer.price != null
      ? Number(offer.price)
      : null,

    offer.prev != null
      ? Number(offer.prev)
      : null,

    offer.availability || "unknown",

    offer.updated ||
      "Just now",

    offer.sourceUrl || null,
    offer.sourceProductId || null,
    offer.sourceHash || null,

    offer.lastChecked ||
      timestamp,

    offer.active === false
      ? 0
      : 1
  );

  return getLocalOffers(productId);
}

// ------------------------------------------------------------
// PRICE HISTORY
// ------------------------------------------------------------

export function addLocalPriceHistory({
  productId,
  shopId,
  price,
}) {
  if (
    price == null ||
    !Number.isFinite(Number(price))
  ) {
    return null;
  }

  const observedAt = now();

  const result = db
    .prepare(
      `
      INSERT INTO price_history (
        product_id,
        shop_id,
        price,
        observed_at
      )
      VALUES (?, ?, ?, ?)
      `
    )
    .run(
      productId,
      shopId,
      Math.round(Number(price)),
      observedAt
    );

  return {
    id: Number(result.lastInsertRowid),

    productId,
    shopId,

    price: Math.round(
      Number(price)
    ),

    observedAt,
  };
}

export function getLocalPriceHistory(
  productId
) {
  return db
    .prepare(
      `
      SELECT
        id,
        product_id AS productId,
        shop_id AS shopId,
        price,
        observed_at AS observedAt
      FROM price_history
      WHERE product_id = ?
      ORDER BY observed_at ASC
      `
    )
    .all(productId);
}

// ------------------------------------------------------------
// SCRAPING LOG
// ------------------------------------------------------------

export function createLocalScrapingLog({
  shopId,
  shopName,
}) {
  const startedAt = now();

  const result = db
    .prepare(
      `
      INSERT INTO scraping_logs (
        shop_id,
        shop_name,
        status,
        started_at
      )
      VALUES (?, ?, ?, ?)
      `
    )
    .run(
      shopId,
      shopName || null,
      "running",
      startedAt
    );

  return Number(
    result.lastInsertRowid
  );
}

export function finishLocalScrapingLog(
  id,
  summary
) {
  db.prepare(`
    UPDATE scraping_logs
    SET
      status = ?,
      completed_at = ?,

      discovered = ?,
      parsed = ?,
      created = ?,
      updated = ?,
      matched = ?,
      ambiguous = ?,
      skipped = ?,
      failed = ?,
      disappeared = ?,

      error_log = ?
    WHERE id = ?
  `).run(
    summary.status || "completed",

    now(),

    Number(summary.discovered || 0),
    Number(summary.parsed || 0),
    Number(summary.created || 0),
    Number(summary.updated || 0),
    Number(summary.matched || 0),
    Number(summary.ambiguous || 0),
    Number(summary.skipped || 0),
    Number(summary.failed || 0),
    Number(summary.disappeared || 0),

    JSON.stringify(
      summary.errorLog || []
    ),

    id
  );
}

// ------------------------------------------------------------
// MATCH REVIEW
// ------------------------------------------------------------

export function addLocalMatchReview({
  shopId,
  shopName,
  normalized,
  candidates,
}) {
  const result = db
    .prepare(
      `
      INSERT INTO match_review (
        shop_id,
        shop_name,
        normalized,
        candidates,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      shopId,
      shopName || null,

      JSON.stringify(
        normalized || {}
      ),

      JSON.stringify(
        candidates || []
      ),

      "pending",

      now()
    );

  return Number(
    result.lastInsertRowid
  );
}

// ------------------------------------------------------------
// DATABASE HANDLE
// ------------------------------------------------------------

export { db };

// Useful for debugging / health checks.
export function getLocalDbInfo() {
  return {
    path: DB_PATH,
    exists: fs.existsSync(DB_PATH),
  };
}
// ------------------------------------------------------------
// DEFAULT LOCAL SHOPS
// ------------------------------------------------------------

const DEFAULT_SHOPS = [
  {
    id: "local-ucc",
    name: "UCC",
    url: "ucc.com.bd",
    logoLetter: "U",
    status: "idle",
    lastRun: "Never",
    offers: 0,
  },
  {
    id: "local-startech",
    name: "Star Tech",
    url: "startech.com.bd",
    logoLetter: "S",
    status: "idle",
    lastRun: "Never",
    offers: 0,
  },
];

for (const shop of DEFAULT_SHOPS) {
  if (!getLocalShop(shop.id)) {
    saveLocalShop(shop);
  }
}