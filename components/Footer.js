import Link from "next/link";

const COLUMNS = [
  {
    title: "Research",
    links: [
      { href: "/products", label: "All Products" },
      { href: "/categories", label: "Categories" },
      { href: "/compare", label: "Compare" },
      { href: "/history", label: "Price History" },
      { href: "/guides", label: "Guides" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/builder", label: "PC Builder" },
      { href: "/deals", label: "Deals" },
      { href: "/wishlist", label: "Wishlist" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Login" },
      { href: "/register", label: "Register" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="site-footer border-t border-line mt-16 bg-ink text-white">
      <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-12">
        <div className="grid md:grid-cols-[280px_repeat(3,1fr)] gap-8">
          <div>
            <div className="flex items-center gap-2 font-display font-bold text-lg mb-2.5">
              <span className="w-[28px] h-[28px] rounded-[7px] bg-pcb flex items-center justify-center text-white text-xs">TC</span>
              TechCompare<span className="text-gold">&nbsp;BD</span>
            </div>
            <p className="text-[13px] text-white/60 leading-relaxed max-w-[280px]">
              Bangladesh&apos;s technology research and price-intelligence platform — specifications, retailer price
              data and price history in one place.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[12px] font-bold uppercase tracking-wide text-white/50 mb-3">{col.title}</h4>
              <div className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className="text-[13.5px] text-white/80 hover:text-white w-fit">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="footer-bottom flex flex-col md:flex-row justify-between gap-2 mt-10 pt-6 border-t border-white/10 text-[12px] text-white/50">
          <span>© {new Date().getFullYear()} TechCompare BD. All rights reserved.</span>
          <span>Retailer price data · Sources tracked and refreshed on a schedule</span>
        </div>
      </div>
    </footer>
  );
}
