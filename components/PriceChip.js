import { fmt } from "@/lib/catalog";

export default function PriceChip({ price, size, gold, strike }) {
  const cls = ["price-chip", size === "lg" ? "lg" : "", gold ? "gold" : "", strike ? "strike" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {!strike && <span className="cur">৳</span>}
      {strike ? fmt(price) : Number(price || 0).toLocaleString("en-US")}
    </span>
  );
}
