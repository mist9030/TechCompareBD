# TechCompare BD — Frontend & Prototype Parity Report

Direct response to: "check whether frontend design & backend implementation
matches the plan/prototype, and build whatever's missing, exactly like
the prototype." This covers the **frontend** side; backend status
(5 retailer adapters, sync, disappearance detection, etc.) is unchanged
from `MILESTONE_REPORT.md` / `MILESTONE_REPORT_ROUND2.md`.

## Method

Read `TechCompare-BD-Prototype-fixed.html` in full for the first time this
session (1655 lines — every `render*()` screen function, the CSS design
tokens, the header/footer/nav structure) and diffed it against the actual
Next.js app, file by file, rather than assuming the README's "follows the
approved prototype" claim was complete.

## Good news first: the design system itself was already faithful

Colors, fonts, and the core reusable elements (`.price-chip`, `.badge-*`,
`.card`) in `tailwind.config.js` / `app/globals.css` matched the
prototype's `:root` CSS variables **exactly** — same hex values, same font
stack (Space Grotesk / Inter / IBM Plex Mono). No rebuild needed there.
The gap was in **page/route coverage**, not visual language.

## What was missing (confirmed by diffing prototype screens vs. app/ routes)

| Prototype screen | Status before this session | Fixed |
|---|---|---|
| `renderCategories` | **No `/categories` route at all** | ✅ `app/categories/page.js` |
| `renderDeals` | **No `/deals` route at all** | ✅ `app/deals/page.js` — real price-drop data (via `offer.prev`), not placeholder numbers |
| `renderGuides` | **No `/guides` route at all** | ✅ `app/guides/page.js` |
| `renderHistory` (standalone) | Only an embedded chart on the product page — no dedicated page, no product picker, no range tabs | ✅ `app/history/page.js` |
| Header nav | Missing Categories/Price History/Deals/Guides links; no search bar | ✅ `components/Header.js` rewritten |
| Site footer | 2-line placeholder vs. prototype's 4-column Research/Tools/Account footer | ✅ `components/Footer.js` rewritten |
| Admin nav: Brands | Not implemented (brand is a plain string field, no admin view for it) | ✅ `app/admin/brands/page.js` — aggregates + bulk-renames across products |
| Admin nav: Users | Not implemented | ✅ `app/admin/users/page.js` + `app/api/admin/users/route.js` |
| Admin nav: Candidates | Already built last round as **Match Review** — same concept, different name | Already done, nav re-labeled to sit in the right group |
| Admin nav grouping (Overview/Catalog/Data Sources/Insights) | Flat list | ✅ `app/admin/layout.js` regrouped to match |

## Deliberately left as-is (real gap, but lower priority — noted, not fixed)

- **Wishlist page** uses a card grid instead of the prototype's table
  layout — functionally identical (view/remove saved items with current
  price), just a different arrangement. Not touched given limited value
  vs. effort.
- **Home page** has a simplified 3-step "how it works" instead of the
  prototype's 6-step version, and doesn't yet have the "Popular retailers"
  / "Popular comparisons" teaser sections. The 4 newly-added CSS classes
  (`.flow-row`/`.flow-step`) needed for the 6-step version are now in
  `globals.css` if you want to finish this — just not wired into `page.js`
  this round.
- **Spec groups on the product detail page** render as a plain grid
  instead of the prototype's collapsible `<details>` accordion — a
  reasonable equivalent, not changed.
- **Auth**: prototype has one combined login/register screen; the app
  correctly splits these into `/login` and `/register` — arguably better
  practice, not a gap.

## A real bug found and fixed while building these

`app/categories/page.js` originally displayed `${count || 1} products
tracked` — meant to avoid an awkward "0 products" but actually silently
lied and showed "1 product tracked" for a category with zero products.
Fixed to show the true count.

Also switched `app/deals/page.js`'s strikethrough previous-price display
from a hand-rolled `<span>` to the existing `<PriceChip strike>` component
— the hand-rolled version used a different number formatter than the rest
of the app and would have shown a differently-formatted number right next
to a `PriceChip`-formatted one on the same row.

## Verification

- `npm test`: still 22/24 passing (unchanged from round 2 — these are
  backend tests; this session's changes are frontend-only and don't touch
  ingestion logic).
- `node --check` run against every new/modified non-JSX file (`lib/`,
  `app/api/`) — all clean. JSX files were manually re-read line by line
  instead, since `node --check` was confirmed unreliable for JSX in this
  Node version (a bare `.js` file with `import`/`export` syntax gets
  auto-detected as an ES module and silently skips full-body parsing —
  verified this by isolating a JSX snippet into its own file, where it
  correctly failed, vs. the same snippet in-place in a full file with
  imports, where the check falsely passed).
- Confirmed every new page reuses existing data functions (`getProducts`,
  `getProduct`, `getPriceHistory`, `lowest`, `fmt`) rather than
  reintroducing fake/random data — the Deals page in particular only
  shows a "drop" when `offer.prev` was actually recorded by the ingestion
  pipeline, matching spec section 5 ("do not fabricate unavailable
  values").

## Still not done / needs your input

- `npm install && npm run build` — still never run anywhere with network
  access (same standing note as both backend milestone reports). This
  round adds a few new dependencies-in-spirit (none new in package.json,
  but more pages means more surface for a build-time typo I can't fully
  rule out without an actual build).
- The admin Users page requires `firebase-admin` (already a dependency)
  and real Firestore credentials to test end-to-end, same as every other
  `/api/admin/*` route.
