"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { getPriceHistory } from "@/lib/data";
import { useCatalog } from "@/lib/CatalogContext";
import { fmt, lowest } from "@/lib/catalog";
import { genHistory, formatRealHistory, RANGE_DAYS } from "@/lib/history";
import PriceChip from "@/components/PriceChip";

function HistoryInner() {
  const params = useSearchParams();
  const router = useRouter();

  const { products, loading } = useCatalog();
  const [realHistory, setRealHistory] = useState(null);

  const [range, setRange] = useState("30D");

  // Search UI
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const id = params.get("id");

  /* ---------------- Selected product ---------------- */
  // The product itself comes straight from the already-loaded catalog
  // cache; only the price history (real per-product time series) is a
  // dedicated Firestore read, one per selection.

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === id) || null,
    [products, id]
  );
  const product = selectedProduct;

  useEffect(() => {
    if (!id) { setRealHistory(null); return; }
    setRealHistory(null);
    let cancelled = false;
    getPriceHistory(id)
      .then((h) => { if (!cancelled) setRealHistory(h); })
      .catch((err) => console.error("Failed to load price history", err));
    return () => { cancelled = true; };
  }, [id]);

  /* ---------------- Search results ---------------- */

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return products.slice(0, 8);
    }

    return products
      .filter((p) => {
        const name = String(p.name || "").toLowerCase();
        const brand = String(p.brand || "").toLowerCase();
        const model = String(p.model || "").toLowerCase();

        return (
          name.includes(term) ||
          brand.includes(term) ||
          model.includes(term)
        );
      })
      .slice(0, 10);
  }, [products, search]);

  /* ---------------- Real history ---------------- */

  const isRealHistory = Boolean(realHistory && realHistory.length > 1);

  const series = useMemo(() => {
    if (!product) return [];

    if (isRealHistory) {
      return formatRealHistory(realHistory).slice(-RANGE_DAYS[range]);
    }

    const low = lowest(product);

    return genHistory(
      low ? low.price : 10000,
      RANGE_DAYS[range]
    );
  }, [product, realHistory, isRealHistory, range]);

  /* ---------------- Stats ---------------- */

  const prices = series.map((s) => s.price);

  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 0;
  const cur = prices.length ? prices[prices.length - 1] : 0;

  const avg = prices.length
    ? Math.round(
        prices.reduce((a, b) => a + b, 0) / prices.length
      )
    : 0;

  /* ---------------- Product selection ---------------- */

 function selectProduct(productId) {
  setSearch("");
  setSearchOpen(false);
  router.push(`/history?id=${productId}`);
}

  /* ---------------- Loading ---------------- */

  if (loading) {
    return (
      <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">

      {/* Header */}

      <h1 className="text-2xl mb-1">
        Price History
      </h1>

      <p className="text-ink-soft text-[13.5px] mb-6">
        Track how a product&apos;s lowest recorded price has moved over time.
      </p>

      {/* =====================================================
          PRODUCT SEARCH
      ====================================================== */}

      <div className="relative max-w-[560px] mb-6">

        <div
          className={`card p-3 flex items-center gap-2.5 ${
            searchOpen ? "rounded-b-none" : ""
          }`}
        >

          {/* Search icon */}

          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            className="text-ink-soft shrink-0"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="1.8"
            />

            <path
              d="M20 20l-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>

          {/* Search input */}

          {/* Search input */}
<input
  type="text"
  value={search}
  onChange={(e) => {
    setSearch(e.target.value);
    setSearchOpen(true);
  }}
  onFocus={() => setSearchOpen(true)}
  placeholder="Search products..."
  className="border-none outline-none text-[13.5px] font-semibold w-full bg-transparent"
/>

          {/* Clear button */}

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchOpen(true);
              }}
              className="text-ink-soft hover:text-ink text-sm px-1"
            >
              ×
            </button>
          )}

          {/* Dropdown arrow */}

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="text-ink-soft text-xs px-1"
          >
            {searchOpen ? "▲" : "▼"}
          </button>
        </div>

        {/* =====================================================
            SEARCH DROPDOWN
        ====================================================== */}

        {searchOpen && (
          <div className="absolute left-0 right-0 z-30 card rounded-t-none overflow-hidden shadow-lg">

            {filteredProducts.length > 0 ? (
              <div className="max-h-[360px] overflow-y-auto">

                {filteredProducts.map((p) => {
                  const low = lowest(p);
                  const isSelected = p.id === id;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProduct(p.id)}
                      className={`w-full text-left px-3.5 py-3 flex items-center gap-3 border-b border-line-soft last:border-0 transition ${
                        isSelected
                          ? "bg-pcb-tint"
                          : "hover:bg-pcb-tint"
                      }`}
                    >

                      {/* Product image */}

                      <div className="w-12 h-12 rounded-md bg-line-soft flex items-center justify-center shrink-0 overflow-hidden">

                        {p.images?.[0] ? (
                          <img
                            src={p.images[0]}
                            alt=""
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="text-[10px] text-ink-soft font-semibold">
                            {p.cat?.toUpperCase() || "PRODUCT"}
                          </div>
                        )}

                      </div>

                      {/* Product information */}

                      <div className="min-w-0 flex-1">

                        <div className="text-[13px] font-semibold leading-snug line-clamp-2">
                          {p.name}
                        </div>

                        <div className="flex items-center gap-2 mt-1">

                          {p.brand && (
                            <span className="text-[11px] text-ink-soft">
                              {p.brand}
                            </span>
                          )}

                          {low && (
                            <>
                              <span className="text-[10px] text-ink-soft">
                                •
                              </span>

                              <span className="text-[11px] font-semibold text-pcb-dark">
                                {fmt(low.price)}
                              </span>
                            </>
                          )}

                        </div>

                      </div>

                      {/* Selected indicator */}

                      {isSelected && (
                        <span className="text-pcb-dark text-sm font-bold">
                          ✓
                        </span>
                      )}

                    </button>
                  );
                })}

              </div>
            ) : (
              <div className="px-4 py-5 text-[13px] text-ink-soft">
                No products found.
              </div>
            )}

          </div>
        )}
      </div>

      {/* =====================================================
          PRODUCT HISTORY
      ====================================================== */}

      {!product ? (
        <div className="text-ink-soft text-sm">
          Select a product to see its price history.
        </div>
      ) : (
        <>

          {/* Click outside search */}

          {searchOpen && (
            <div
              className="fixed inset-0 z-20"
              onClick={() => setSearchOpen(false)}
            />
          )}

          {/* History card */}

          <div className="card p-6">

            <div className="flex justify-between items-start mb-4 flex-wrap gap-3.5">

              <div>

                <div className="text-[13px] text-ink-soft">
                  {product.name}
                </div>

                <div className="flex items-baseline gap-2 mt-1">

                  <PriceChip
                    price={cur}
                    size="lg"
                  />

                  <span className="text-[12.5px] text-ink-soft">
                    current lowest
                  </span>

                </div>

              </div>

              {/* Range */}

              <div className="range-tabs">

                {Object.keys(RANGE_DAYS).map((r) => (
                  <button
                    key={r}
                    className={range === r ? "active" : ""}
                    onClick={() => setRange(r)}
                  >
                    {r}
                  </button>
                ))}

              </div>

            </div>

            {/* Chart */}

            <div style={{ height: 240 }}>

              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <LineChart data={series}>

                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    interval={Math.max(
                      0,
                      Math.floor(series.length / 8)
                    )}
                  />

                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={60}
                    tickFormatter={(v) =>
                      `৳${(v / 1000).toFixed(0)}k`
                    }
                  />

                  <Tooltip
                    formatter={(v) => fmt(v)}
                  />

                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#0E7C6B"
                    strokeWidth={2}
                    dot={false}
                  />

                </LineChart>
              </ResponsiveContainer>

            </div>

            {/* Stats */}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-5 pt-5 border-t border-line-soft">

              <div>
                <div className="text-[11px] text-ink-soft uppercase tracking-wide">
                  Current
                </div>

                <div className="font-mono-plex font-semibold">
                  {fmt(cur)}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-ink-soft uppercase tracking-wide">
                  {range} low
                </div>

                <div className="font-mono-plex font-semibold text-pcb-dark">
                  {fmt(lo)}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-ink-soft uppercase tracking-wide">
                  {range} high
                </div>

                <div className="font-mono-plex font-semibold text-red">
                  {fmt(hi)}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-ink-soft uppercase tracking-wide">
                  Average
                </div>

                <div className="font-mono-plex font-semibold">
                  {fmt(avg)}
                </div>
              </div>

            </div>

          </div>

          {/* Estimated history notice */}

          {!isRealHistory && (
            <p className="text-[11.5px] text-ink-soft mt-3">
              This is an estimated trend — real recorded history will
              appear automatically once the ingestion pipeline has
              synced this product a few times.
            </p>
          )}

          {/* =====================================================
              RECORDED CHANGES
          ====================================================== */}

          <div className="mt-6">

            <h3 className="text-[15px] mb-2.5">
              Recorded changes
            </h3>

            <div className="card overflow-hidden">

              <table className="w-full text-[13px] border-collapse">

                <thead>
                  <tr className="bg-line-soft">

                    {[
                      "Date",
                      "Lowest Price",
                      "Change",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-soft font-bold"
                      >
                        {h}
                      </th>
                    ))}

                  </tr>
                </thead>

                <tbody>

                  {series
                    .slice(-8)
                    .reverse()
                    .map((row, i, arr) => {

                      const prevRow = arr[i + 1];

                      const delta = prevRow
                        ? row.price - prevRow.price
                        : 0;

                      return (
                        <tr
                          key={i}
                          className="border-t border-line-soft"
                        >

                          <td className="px-4 py-2.5">
                            {row.date}
                          </td>

                          <td className="px-4 py-2.5 font-mono-plex">
                            {fmt(row.price)}
                          </td>

                          <td className="px-4 py-2.5">

                            {delta === 0 ? (
                              <span className="text-ink-soft">
                                —
                              </span>
                            ) : delta < 0 ? (
                              <span className="text-pcb-dark font-semibold">
                                ↓ {fmt(Math.abs(delta))}
                              </span>
                            ) : (
                              <span className="text-red font-semibold">
                                ↑ {fmt(delta)}
                              </span>
                            )}

                          </td>

                        </tr>
                      );
                    })}

                </tbody>

              </table>

            </div>

          </div>

        </>
      )}

    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">
          Loading…
        </div>
      }
    >
      <HistoryInner />
    </Suspense>
  );
}