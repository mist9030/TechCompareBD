# TechCompare BD — Ingestion Pipeline: Milestone Report, Round 2

Continues directly from `MILESTONE_REPORT.md` (round 1: architecture +
Star Tech BD). **No architecture changes** — same adapter interface
(`adapters/base.js`), same orchestrator (`ingest.js`), same Firestore
schema extensions (`priceHistory` subcollection, `match_review`
collection). This round: four more retailers, automatic/scheduled sync,
disappearance detection, a real bug fix caught by a new test, and a
verification (dry-run) workflow.

## 0. Environment constraints — unchanged from round 1

Still no outbound network from this sandbox (`npm install` still returns
`403 Forbidden`, re-checked at the start of this round). Same consequence:
adapters are built from real pages fetched via the research tool during
development, not run live here. **What's different this round:** one
shared module (`adapters/shared.js`) turned out to have zero cheerio
dependency, so its logic — including the compound spec-value splitter —
**is now actually unit-tested and executed in this sandbox**, not just
written and hoped-for. See §4.

## 1. What was added

```
lib/ingestion/adapters/
  shared.js              NEW. Common fetch/meta/spec-table/price-pair
                          helpers, extracted from startech.js so the four
                          new adapters don't duplicate it. Zero cheerio
                          dependency itself (cheerio only in the adapter
                          files) — see §4 for why that matters.
  startech.js             Refactored to use shared.js. Same behavior.
  ucc.js                  NEW — ucc.com.bd.
  onix.js                 NEW — onixbd.com.
  creatus.js               NEW — creatus.com.bd.
  globalbrand.js           NEW — globalbrand.com.bd.

lib/ingestion/registry.js   All 5 adapters registered (was 1).
lib/ingestion/normalize.mjs  Laptop spec-label map extended with real
                              labels observed on Global Brand's spec table
                              ("Processor Model", "Storage Capacity", etc).
lib/ingestion/ingest.js       + disappearance detection (spec §12) + dry-run
                              mode. Sync bounds now env-var overridable.

app/api/cron/sync/route.js    NEW. Scheduled-sync trigger, shared-secret
                               auth (Vercel-Cron-compatible convention).
vercel.json.example            NEW. Example staggered per-shop schedule.

app/api/admin/sync/route.js    + dryRun passthrough.
app/admin/shops/page.js        + "Verify (Dry Run)" button + preview list;
                                hint text updated for all 5 retailers.

test/adapters-shared.test.mjs   NEW. 8 assertions against shared.js's pure
                                 functions — RUNS, PASSES (no cheerio needed).
test/adapters.ucc.test.mjs       NEW. 6 assertions against UCC fixtures —
                                 written, not run (needs cheerio, same as
                                 round 1's startech test).
test/fixtures/ucc-*.html          NEW, built from real live-fetched pages.
```

## 2. The four new retailers — real data, confidence per retailer

All five research fetches this round hit the **live sites directly**
(category pages and, for Global Brand, a full product page) — every URL
below is real and was verified to exist, not guessed from a URL pattern.

| Retailer | Platform confirmed | Meta tags on product pages | Confidence |
|---|---|---|---|
| **UCC** (ucc.com.bd) | OpenCart | **None observed** — the one live product page fetched had no `og:`/`product:` tags at all, only generic description/keywords/twitter tags | Medium-high on visible content (Brand/Model/SKU/Stock lines and a real spec `<table>` — verified live, including the exact compound-cell pattern, see §4). Medium on listing-card class names (content verified, DOM inferred). |
| **Onix BD** (onixbd.com) | OpenCart | Full suite confirmed on the **category** page (og:title/description/image/type/url/site_name); no product page fetched live this round | Meta-first with a visible-content fallback (same dual strategy as UCC) — whichever the live site does, one path should work. Category URLs are all real/verified. |
| **Creatus** (creatus.com.bd) | OpenCart | Full suite confirmed on the **category** page; no product page fetched live | Same profile as Onix — meta-first + fallback. Category URLs real/verified, including the exact discount-badge format ("Save: 600৳ (4%)"). |
| **Global Brand PLC** (globalbrand.com.bd) | OpenCart | **Full suite verified on a real product page**, including a non-standard `og:brand` tag this retailer adds that the other four don't | **Highest confidence of the five.** One live product page was fetched end-to-end: real spec table (grouped sections), real price format difference (see below), a 404 on one search-result URL (see §5). |

**A genuinely useful cross-retailer finding:** Global Brand's price format
is `"৳79,500.00"` — leading currency symbol, two decimals — while the
other four all use `"79,500৳"` (trailing symbol, no decimals). `shared.js`'s
`parsePricePair()` handles both (tested, §4) rather than assuming one
format everywhere, which a single-retailer-first build could easily have
missed.

**Scope note on Global Brand:** they're primarily an official brand
distributor (Asus/Lenovo/Dell/Acer/Apple laptops), but their site does
carry a real Components section (Processor/Motherboard/GPU/RAM/SSD/PSU/
Casing — mostly Asus/PNY/NZXT/Arktek branded parts), so all 10 categories
got real, verified URLs rather than narrowing scope to laptops-only.

**UCC's "Call For Price" reality:** several UCC listings (both in the
category page and the fetched product page) showed "Call For Price"/"৳0"
instead of a number. This isn't a bug to fix — `ingest.js` already skips
items with no parseable price (spec §5: "do not fabricate unavailable
values"), and `parsePricePair()` correctly returns `null`, not `0`, for
this case (tested, §4).

## 3. Automatic sync + disappearance detection (the two spec gaps from round 1)

**Scheduled sync** (`app/api/cron/sync/route.js`): an HTTP endpoint
authenticated by a shared secret (`Authorization: Bearer <CRON_SECRET>` —
the same convention Vercel Cron sends automatically once `CRON_SECRET` is
set as a project env var, so it needs zero extra glue code on that
platform). Supports:
- Scoped calls (`?shopId=startech&categories=cpu,gpu`) — **the recommended
  production shape**, one retailer (optionally one/a few categories) per
  invocation, so no single request has to sync all 5 retailers × 10
  categories and risk a serverless timeout.
- Unscoped (`/api/cron/sync`, no params) — every registered shop in one
  call. Fine for a small catalog or local testing; not recommended once
  all 5 retailers are live.

`vercel.json.example` shows a staggered schedule (one retailer every 15
minutes within a 6-hour window) — rename to `vercel.json` to activate.
Not Vercel-specific in principle — any scheduler that can hit an HTTPS URL
with a bearer token works (GitHub Actions `schedule:` + `curl`, a cron box,
etc.); the example just targets the most common Next.js host.

**Disappearance detection** (spec §12, explicitly flagged as NOT done at
the end of round 1): `ingest.js` now tracks every `sourceProductId`
actually discovered during a category's sync. If — and only if — that
category's sync had **full coverage this run** (walked every listing page,
no `MAX_PAGES_PER_CATEGORY`/`MAX_ITEMS_PER_CATEGORY` cap hit, no discovery
error), any of that shop's existing offers *not* re-discovered get marked
`active: false, availability: "out_of_stock"`. The canonical Product is
never deleted (per spec — other shops' offers on it are untouched), and a
partial/capped/failed run correctly does nothing here rather than risking
false positives ("we didn't look far enough" vs. "it's actually gone" are
different situations, and only the latter should flip a product to
out-of-stock).

## 4. Verification — a real bug found and fixed, not just "written"

While building `test/adapters.ucc.test.mjs` (which needs cheerio, so
couldn't run) I noticed `shared.js`'s compound-value splitter — the piece
that turns one table cell like `"Base Clock 4.7GHz    Max. Boost Clock Up
to 5.3GHz"` into two separate canonical fields — **had no cheerio
dependency of its own**. So instead of leaving that logic unverified like
the rest of the parsing code, I pulled it into
`test/adapters-shared.test.mjs` and actually ran it:

```
$ node --test test/adapters-shared.test.mjs
# tests 8
# pass 8
```

This caught a real bug before it could ship: the first version of the
splitter, given that exact real UCC value, produced
`{label: "Base Clock", value: "Base Clock 4.7GHz Max."}` — the label text
was left duplicated inside its own value, because the original algorithm
only looked for embedded labels *after* position 0 and didn't handle the
common case (observed live) of a cell literally repeating its own
column-1 label at the start. Fixed and now regression-tested (see the
`splitCompoundValues` tests, specifically the one with a comment pointing
at exactly this bug).

**Full test status, this round:**

```
$ npm test
# tests 24
# pass 22
# fail 2   <- adapters.startech.test.mjs, adapters.ucc.test.mjs
             (both fail only on "Cannot find package 'cheerio'" — an
             import error, not a logic failure; see §0)
```

22 of 24 tests need zero dependencies and passed for real, including the
new shared-logic suite. The 2 that need cheerio are written and reasoned
through against real fixtures but unverified until `npm install` runs
somewhere with network access.

**Dry-run / Verify workflow** (the "verification" ask more broadly): every
shop card in `/admin/shops` now has a **Verify (Dry Run)** button next to
**Sync Real Data**. It runs the identical discover → parse → normalize →
match pipeline and returns exactly what it *would* do (create/match/
ambiguous/would-mark-disappeared, with a preview list), writing nothing.
Recommended flow for a newly added or newly adjusted adapter (onix/
creatus, since their meta-tag behavior is inferred not verified, per §2):
Verify first, read the preview, only then Sync Real Data.

## 5. Production readiness

- **Shared parsing module** (`adapters/shared.js`): the fetch wrapper
  (descriptive User-Agent, one retry on transient failure), meta-tag
  reader, spec-table parser, and price-pair parser are now written once
  and reused by all 5 adapters instead of copy-pasted — a change in
  retry/UA policy or a parsing-strategy fix now applies everywhere at once.
- **Configurable bounds:** `MAX_PAGES_PER_CATEGORY`, `MAX_ITEMS_PER_CATEGORY`,
  `REQUEST_DELAY_MS` are now env-var overridable
  (`INGEST_MAX_PAGES_PER_CATEGORY` etc.) rather than hardcoded, so you can
  tune per-run scope without a code change once you see real timing.
- **Per-item fault isolation, still true across all 5 retailers:** one
  bad/404'd product page fails that item only (logged, `failed` counter),
  the rest of the sync continues. Relevant because one of the URLs
  gathered from a search result *did* 404 live during this round's
  research (§2, Global Brand) — a concrete reminder that "the URL was
  correct when found" doesn't guarantee "still a live product," and the
  pipeline needs to (and does) tolerate that.
- **`maxDuration` set on both API routes** (60s) — a reminder to keep cron
  calls scoped (§3) rather than relying on a long timeout; check your
  host's actual limit before raising it.
- **Fail-closed cron auth:** `/api/cron/sync` refuses all requests if
  `CRON_SECRET` isn't set, rather than defaulting to "open" if
  misconfigured.
- **Still not done** (honest gap list, carried over/added):
  - `npm install && npm run build` still not run anywhere with network —
    still the single highest-value next step.
  - Onix/Creatus/Global Brand have no adapter-specific fixture tests yet
    (only StarTech and UCC do) — same "written, not run" caveat applies
    to all three, but there isn't yet a fixture proving the meta-tag
    fallback path specifically exercises correctly for Onix/Creatus.
  - No automated test yet for `ingest.js`'s disappearance-detection logic
    itself (it's straightforward but Firestore-dependent, so it needs
    either the Firestore emulator or a mocked `db` — neither set up here).
  - Real credentials + a live `npm install` are still required before any
    of this touches production data — nothing in this round changes that.

## 6. Suggested next session

1. `npm install && npm run build && npm test` — this round doubles the
   number of things that need this first real check (5 adapters now, not 1).
2. Add the four new shops via the existing Add Shop form (`ucc.com.bd`,
   `onixbd.com`, `creatus.com.bd`, `globalbrand.com.bd`), **Verify (Dry
   Run)** each one before Sync Real Data — Onix/Creatus especially, since
   their meta-tag behavior is inferred rather than directly verified (§2).
3. Wire up `vercel.json.example` (or your scheduler of choice) once manual
   syncs look right.
4. Fixture tests for Onix/Creatus/Global Brand, matching the UCC/StarTech
   pattern.
5. A Firestore-emulator-backed test for disappearance detection specifically.
