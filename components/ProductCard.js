"use client";
import Link from "next/link";
import CategoryIcon from "./CategoryIcon";
import PriceChip from "./PriceChip";
import { CAT_LABEL, lowest, getProductImage, productPriceText } from "@/lib/catalog";
export default function ProductCard({ product }) {
  const low = lowest(product);
  return (
    <Link href={`/products/${product.id}`} className="card hoverable block p-3.5">
      <div className="thumb mb-3">
        {getProductImage(product) ? (
          <img
            src={getProductImage(product)}
            alt={product.name || "Product"}
            className="!object-contain bg-white p-3"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div className={`${getProductImage(product) ? "hidden" : ""} thumb-icon`}>
          <CategoryIcon cat={product.cat} size={44} />
        </div>
      </div>
      <div className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">
        {CAT_LABEL[product.cat]} · {product.brand}
      </div>
      <div className="font-semibold text-[14.5px] leading-snug mb-2 line-clamp-2">{product.name}</div>
      <div className="flex items-center justify-between">
        {low ? <PriceChip price={low.price} /> : <span className="badge badge-muted">{productPriceText(product)}</span>}
        {product.discount > 0 && <span className="badge badge-discount">-{product.discount}%</span>}
      </div>
      <div className="text-[11.5px] text-ink-soft mt-2">
        {product.offers?.length || 0} shop{(product.offers?.length || 0) === 1 ? "" : "s"} tracked
      </div>
    </Link>
  );
}
