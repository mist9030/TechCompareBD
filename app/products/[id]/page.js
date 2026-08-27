"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  getProduct,
  getProducts,
  addToWishlist,
  getPriceHistory,
} from "@/lib/data";

import {
  CAT_LABEL,
  SPEC_GROUPS,
  fmt,
  lowest,
} from "@/lib/catalog";

import {
  genHistory,
  formatRealHistory,
  RANGE_DAYS,
} from "@/lib/history";

import { useAuth } from "@/lib/AuthContext";

import PriceChip from "@/components/PriceChip";
import CategoryIcon from "@/components/CategoryIcon";
import ProductCard from "@/components/ProductCard";

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [product, setProduct] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [saved, setSaved] = useState(false);
  const [realHistory, setRealHistory] = useState(null);
  const [range, setRange] = useState("30D");

  useEffect(() => {
    getProduct(id).then(async (p) => {
      setProduct(p);

      if (p) {
        const all = await getProducts();

        setSimilar(
          all
            .filter((x) => x.cat === p.cat && x.id !== p.id)
            .slice(0, 4)
        );
      }
    });

    getPriceHistory(id).then(setRealHistory);
  }, [id]);

  const history = useMemo(() => {
    if (!product) return [];

    if (realHistory && realHistory.length > 1) {
      return formatRealHistory(realHistory).slice(-RANGE_DAYS[range]);
    }

    const low = lowest(product);

    return genHistory(
      low ? low.price : 10000,
      RANGE_DAYS[range]
    );
  }, [product, realHistory, range]);

  const isRealHistory = Boolean(
    realHistory && realHistory.length > 1
  );

  if (!product) {
    return (
      <div className="max-w-[1240px] mx-auto px-7 py-10 text-ink-soft text-sm">
        Loading…
      </div>
    );
  }

  const low = lowest(product);

  const offersSorted = [...(product.offers || [])].sort(
    (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)
  );

  const groups = SPEC_GROUPS[product.cat] || [];

  async function handleWishlist() {
    if (!user) return;

    await addToWishlist(user.uid, product.id);
    setSaved(true);
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">

      {/* Breadcrumb */}
      <div className="text-[12.5px] text-ink-soft mb-5">
        <Link href="/">Home</Link>
        {" / "}
        <Link href={`/products?category=${product.cat}`}>
          {CAT_LABEL[product.cat]}
        </Link>
        {" / "}
        <span className="text-ink">
          {product.name}
        </span>
      </div>

      {/* =========================================================
          PRODUCT HERO
      ========================================================= */}
      <div className="grid md:grid-cols-2 gap-8 mb-10">

        {/* Product Image */}
        <div className="thumb min-h-[320px]">
          <div className="thumb-icon w-full h-full flex items-center justify-center p-6">

            {product.images?.[0] ? (
              <img
                src={product.images[0]}
                alt={product.name}
                className="w-full h-full object-contain"
                loading="eager"
              />
            ) : (
              <CategoryIcon
                cat={product.cat}
                size={90}
              />
            )}

          </div>
        </div>

        {/* Product Information */}
        <div>

          <div className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
            {CAT_LABEL[product.cat]} · {product.brand}
          </div>

          <h1 className="text-2xl mb-1">
            {product.name}
          </h1>

          {product.model && (
            <div className="text-[12.5px] text-ink-soft mb-4">
              Model: {product.model}
            </div>
          )}

          {/* Price */}
          <div className="flex items-center gap-3 mb-5">
            {low ? (
              <PriceChip
                price={low.price}
                size="lg"
              />
            ) : (
              <span className="badge badge-outofstock">
                Currently unavailable
              </span>
            )}

            {product.discount > 0 && (
              <span className="badge badge-discount">
                -{product.discount}%
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">

            <Link
              href={`/compare?ids=${product.id}`}
              className="btn btn-ghost btn-sm"
            >
              Add to Compare
            </Link>

            <button
              onClick={handleWishlist}
              disabled={!user || saved}
              className="btn btn-ghost btn-sm"
            >
              {saved
                ? "Added to wishlist"
                : "❤ Add to Wishlist"}
            </button>

            <Link
              href={`/builder?slot=${product.cat}&pid=${product.id}`}
              className="btn btn-primary btn-sm"
            >
              Use in PC Builder
            </Link>

          </div>

          {!user && (
            <div className="text-[12px] text-ink-soft mt-2">
              Log in to save to your wishlist.
            </div>
          )}

        </div>
      </div>

      {/* =========================================================
          PRICE ACROSS SHOPS
      ========================================================= */}
      <section className="mb-10">

        <h2 className="text-lg mb-3">
          Price across shops
        </h2>

        <div className="card overflow-hidden">

          <div className="overflow-x-auto">

            <table className="w-full text-[13.5px]">

              <thead>
                <tr className="border-b border-line text-left text-ink-soft text-[11.5px] uppercase tracking-wide">

                  <th className="p-3">
                    Shop
                  </th>

                  <th className="p-3">
                    Price
                  </th>

                  <th className="p-3">
                    Availability
                  </th>

                  <th className="p-3">
                    Updated
                  </th>

                  <th className="p-3 text-right">
                    Shop
                  </th>

                </tr>
              </thead>

              <tbody>

                {offersSorted.length > 0 ? (
                  offersSorted.map((o, i) => (

                    <tr
                      key={`${o.shop}-${o.sourceProductId || i}`}
                      className="border-b border-line-soft last:border-0"
                    >

                      {/* Shop */}
                      <td className="p-3 font-semibold">
                        {o.shopName || o.shop}
                      </td>

                      {/* Price */}
                      <td className="p-3">

                        {o.price != null ? (
                          <>
                            <PriceChip price={o.price} />

                            {i === 0 && (
                              <span className="badge badge-best ml-2">
                                Best
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}

                      </td>

                      {/* Availability */}
                      <td className="p-3">

                        <span
                          className={
                            o.availability === "in_stock"
                              ? "badge badge-stock"
                              : "badge badge-outofstock"
                          }
                        >
                          {o.availability === "in_stock"
                            ? "In stock"
                            : o.availability === "preorder"
                              ? "Pre-order"
                              : "Out of stock"}
                        </span>

                      </td>

                      {/* Updated */}
                      <td className="p-3 text-ink-soft">
                        {o.updated || "—"}
                      </td>

                      {/* Open Shop */}
                      <td className="p-3 text-right">

                        {o.sourceUrl ? (
                          <a
                            href={o.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary btn-sm"
                          >
                            Open in Shop ↗
                          </a>
                        ) : (
                          <span className="text-ink-soft text-[12px]">
                            Unavailable
                          </span>
                        )}

                      </td>

                    </tr>

                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-5 text-center text-ink-soft"
                    >
                      No shop offers available.
                    </td>
                  </tr>
                )}

              </tbody>

            </table>

          </div>

        </div>

      </section>

      {/* =========================================================
          PRICE HISTORY
      ========================================================= */}
      <section className="mb-10">

        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">

          <h2 className="text-lg">

            Price history

            {!isRealHistory && (
              <span className="text-[11px] font-normal text-ink-soft ml-2">
                (estimated trend — no synced history yet)
              </span>
            )}

          </h2>

          <div className="flex items-center gap-3">

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

            <Link
              href={`/history?id=${product.id}`}
              className="btn btn-ghost btn-sm"
            >
              Full history →
            </Link>

          </div>

        </div>

        <div
          className="card p-4"
          style={{ height: 260 }}
        >

          <ResponsiveContainer
            width="100%"
            height="100%"
          >

            <LineChart data={history}>

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval={5}
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

      </section>

      {/* =========================================================
          SPECIFICATIONS
      ========================================================= */}
      <section className="mb-10">

        <h2 className="text-lg mb-3">
          Specifications
        </h2>

        <div className="grid md:grid-cols-2 gap-4">

          {groups.map(([label, keys]) => (

            <div
              key={label}
              className="card p-4"
            >

              <div className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
                {label}
              </div>

              {keys.map((k) => (

                <div
                  key={k}
                  className="flex justify-between py-1.5 border-b border-line-soft last:border-0 text-[13.5px]"
                >

                  <span className="text-ink-soft">
                    {k}
                  </span>

                  <span className="font-semibold text-right ml-4">
                    {product.specs?.[k] || "—"}
                  </span>

                </div>

              ))}

            </div>

          ))}

        </div>

      </section>

      {/* =========================================================
          SIMILAR PRODUCTS
      ========================================================= */}
      {similar.length > 0 && (

        <section>

          <h2 className="text-lg mb-3">
            Similar {CAT_LABEL[product.cat].toLowerCase()}s
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {similar.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
              />
            ))}

          </div>

        </section>

      )}

    </div>
  );
}