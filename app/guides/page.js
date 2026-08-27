import CategoryIcon from "@/components/CategoryIcon";

const GUIDES = [
  {
    title: "How to read TechCompare price history",
    blurb:
      "What \"30-day low\" and \"tracked\" actually mean, and how the price chart is built from real retailer data recorded over time.",
    cat: "monitor",
  },
  {
    title: "Choosing a CPU and motherboard socket",
    blurb:
      "A short walkthrough of socket compatibility (AM4, AM5, LGA1700) using the parts TechCompare currently tracks — and how PC Builder checks this for you.",
    cat: "cpu",
  },
  {
    title: "Building a budget gaming PC in Bangladesh",
    blurb:
      "A worked example using PC Builder — picking parts, estimating total power draw, and finding the cheapest shop for each component.",
    cat: "gpu",
  },
  {
    title: "Understanding retailer availability status",
    blurb:
      "Why \"In Stock\" can differ between retailers at the same moment, and how last-checked timestamps work in the sync pipeline.",
    cat: "ssd",
  },
];

export default function GuidesPage() {
  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">
      <h1 className="text-2xl mb-1">Guides</h1>
      <p className="text-ink-soft text-[13.5px] mb-6 max-w-[600px]">
        Short reference guides for using TechCompare&apos;s research tools.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {GUIDES.map((g) => (
          <div key={g.title} className="card hoverable overflow-hidden flex">
            <div className="w-[120px] shrink-0 bg-pcb-tint flex items-center justify-center">
              <CategoryIcon cat={g.cat} size={36} />
            </div>
            <div className="p-4">
              <div className="font-semibold text-[14px] mb-1.5">{g.title}</div>
              <div className="text-[12.5px] text-ink-soft leading-relaxed">{g.blurb}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
