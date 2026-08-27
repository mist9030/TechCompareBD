"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getProducts } from "@/lib/data";
import { CAT_LABEL } from "@/lib/catalog";
import CategoryIcon from "@/components/CategoryIcon";

export default function CategoriesPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts().then((p) => {
      setProducts(p);
      setLoading(false);
    });
  }, []);

  const cats = Object.keys(CAT_LABEL);

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">Categories</h1>
      <p className="text-ink-soft text-[13.5px] mb-6 max-w-[600px]">
        Browse tracked products by category — each links to filtered, price-sorted listings.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {cats.map((c) => {
          const count = products.filter((p) => p.cat === c).length;
          return (
            <Link key={c} href={`/products?category=${c}`} className="card hoverable overflow-hidden block">
              <div className="h-[110px] bg-pcb-tint flex items-center justify-center">
                <CategoryIcon cat={c} size={44} />
              </div>
              <div className="p-4">
                <div className="font-semibold text-[14px]">{CAT_LABEL[c]}</div>
                <div className="text-[12px] text-ink-soft mt-1">
                  {loading ? "…" : `${count} product${count === 1 ? "" : "s"} tracked`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
