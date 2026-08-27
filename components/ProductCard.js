"use client";

import Link from "next/link";
import CategoryIcon from "./CategoryIcon";
import PriceChip from "./PriceChip";
import { CAT_LABEL, lowest } from "@/lib/catalog";

export default function ProductCard({ product }) {
  const low = lowest(product);
  const image = product.images?.[0];

  return (
    <div className="card hoverable block p-3.5">
      {/* Product Image */}
      <Link href={`/products/${product.id}`} className="block">
        <div className="thumb mb-3">
          <div className="thumb-icon w-full h-full flex items-center justify-center">
            {image ? (
              <img
                src={image}
                alt={product.name}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <CategoryIcon cat={product.cat} size={44} />
            )}
          </div>
        </div>
      </Link>

      {/* Category + Brand */}
      <div className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">
        {CAT_LABEL[product.cat]} · {product.brand}
      </div>

      {/* Product Name */}
      <Link
        href={`/products/${product.id}`}
        className="font-semibold text-[14.5px] leading-snug mb-2 line-clamp-2 block hover:underline"
      >
        {product.name}
      </Link>

      {/* Price */}
      <div className="flex items-center justify-between">
        {low ? (
          <PriceChip price={low.price} />
        ) : (
          <span className="badge badge-outofstock">Out of stock</span>
        )}

        {product.discount > 0 && (
          <span className="badge badge-discount">
            -{product.discount}%
          </span>
        )}
      </div>

      {/* Shop count */}
      <div className="text-[11.5px] text-ink-soft mt-2">
        {product.offers?.length || 0} shop
        {(product.offers?.length || 0) === 1 ? "" : "s"} tracked
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <Link
          href={`/compare?ids=${product.id}`}
          className="btn btn-ghost btn-sm flex-1 text-center"
        >
          Compare
        </Link>

        <Link
          href={`/products/${product.id}`}
          className="btn btn-primary btn-sm flex-1 text-center"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}