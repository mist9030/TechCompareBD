# TechCompare BD

Bangladesh IT & gadget price comparison + PC Builder platform. Built with
Next.js 14 (App Router) and Firebase (Auth + Firestore), following the
visual design from the approved prototype.

## Features implemented

**Public site**
- Home, category browse, product listing with search/filter/sort
- Product detail: shop-by-shop price table, 30-day price history chart, grouped specs, similar products
- Compare up to 4 products side by side (specs + price)
- PC Builder: CPU → Motherboard → RAM → GPU → SSD → PSU → Case, with
  - live compatibility checking (socket match, RAM generation vs motherboard, PSU wattage vs GPU recommendation)
  - running total cost
  - cheapest-single-shop comparison
  - cheapest multi-shop purchase plan (per-component cheapest source)
  - Save Build (signed-in users) and PDF download/print
- Auth: register/login, profile with saved builds (rename/delete/PDF), wishlist

**Admin panel** (`/admin`, requires `role: "admin"` on the user's Firestore doc)
- Dashboard with catalog stats and recent scraping runs
- Product CRUD (category, brand, specs, per-shop offers)
- Shop CRUD + "Run Scrape" (writes a scraping log — see note below)
- Category metadata CRUD
- Scraping logs table

## Not included / where to extend

- **Actual web scraping.** "Run Scrape" in the admin panel currently just
  writes a plausible-looking log entry (`lib/data.js → queueScrapeRun`) so
  the CRUD/logging flow works end-to-end without needing to scrape live
  retailer sites during a demo. For a real scraper, add a separate Node
  script/Cloud Function (per the plan doc's architecture: scrape → clean/validate
  → write to `products/{id}.offers`), scheduled with `node-cron` or Cloud
  Scheduler. Keep it server-side — never scrape from the browser.
- **Price alerts.** Not built; the data model (`products`, `users`) supports
  adding a `price_alerts` collection + a scheduled function that checks it.
- **Admin candidate/match review queue** (from the plan doc) — omitted for
  scope; product matching here is manual via the admin product form.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Firebase project** at https://console.firebase.google.com
   - Enable **Authentication → Email/Password**
   - Create a **Firestore Database** (production mode)
   - Project Settings → General → Your apps → Web app → copy the config

3. **Environment variables** — copy `.env.local.example` to `.env.local` and
   fill in the `NEXT_PUBLIC_FIREBASE_*` values from step 2.

4. **Deploy security rules** — copy `firebase/firestore.rules` into your
   Firestore rules (Console → Firestore → Rules), or via CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **Seed sample data** (optional but recommended for the demo/viva)
   - Firebase Console → Project Settings → Service accounts → **Generate new private key**
   - Save it as `firebase/service-account.json` (already git-ignored)
   - Run:
     ```bash
     npm run seed
     ```
   - This adds 5 shops and 11 sample products across all 10 categories.

6. **Create an admin account**
   - Run the app, register a normal account from `/register`
   - In Firestore Console, open `users/{your-uid}` and change `role` from
     `"user"` to `"admin"`
   - Log back in — the Admin link appears in the header and `/admin` unlocks

7. **Run locally**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Project structure

```
app/
  page.js                  Home
  products/page.js          Listing + filters
  products/[id]/page.js     Detail (offers, chart, specs)
  compare/page.js           Side-by-side comparison
  builder/page.js           PC Builder
  wishlist/page.js          Saved products
  login/, register/         Auth
  profile/page.js           Saved builds CRUD
  admin/                    Admin panel (dashboard, products, shops, categories, scraping)
components/                 Header, Footer, ProductCard, PriceChip, CategoryIcon
lib/
  firebase.js               Firebase client init
  AuthContext.js             Auth state + register/login/logout
  data.js                    Firestore CRUD helpers
  catalog.js                 Category labels/colors, spec groupings, fmt()/lowest()
  compat.js                  PC Builder compatibility rules
  pdf.js                      Build → PDF export (jsPDF)
scripts/seed.mjs             Sample-data seeder (firebase-admin)
firebase/firestore.rules     Security rules
```

## Database structure (Firestore collections)

```
users        { name, email, role: 'user'|'admin' }
shops        { name, url, logoLetter, status, lastRun, offers }
categories   { key, name }                 — extra catalog metadata (core 10 cats are code constants)
products     { cat, brand, name, model, discount, specs: {...}, offers: [{shop, shopName, price, prev?, availability, updated}] }
scraping_logs{ shopId, shopName, status, found, matched, failed, startedAt }
builds       { userId, name, budget, components: {cpu: productId, ...}, total, createdAt }
wishlist     { userId, productId, createdAt }
```

This matches the "Core/Must-Have" scope from the project plan: user auth,
product/shop/category CRUD, search/filter, product comparison, shop-wise
price comparison, PC Builder with basic compatibility checking, save/edit/
delete build, PDF download, admin dashboard, and scraping logs.
