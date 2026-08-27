// lib/history.js
// Shared by app/products/[id]/page.js (embedded chart) and app/history/page.js
// (standalone page, prototype parity — see MILESTONE_REPORT_FRONTEND.md).

export const RANGE_DAYS = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 };

// Deterministic-ish demo price trend, used only as a fallback when a
// product has no real products/{id}/priceHistory entries yet (seeded/demo
// products, or a real product before its first couple of syncs).
export function genHistory(basePrice, days = 30) {
  const out = [];
  let price = Math.round(basePrice * 1.08);
  for (let i = days; i >= 0; i--) {
    const drift = (Math.sin(i / 4) * 0.01 + (Math.random() - 0.5) * 0.015) * basePrice;
    price = Math.max(basePrice * 0.9, price + drift - basePrice * 0.003);
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), price: Math.round(price) });
  }
  out[out.length - 1].price = basePrice;
  return out;
}

// Real observations (from lib/data.js:getPriceHistory) -> the same
// {date, price} shape genHistory produces, so callers don't care which
// source they got.
export function formatRealHistory(entries) {
  return entries.map((h) => ({
    date: h.observedAt?.toDate
      ? h.observedAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : "",
    price: h.price,
  }));
}
