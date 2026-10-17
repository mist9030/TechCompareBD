// Static catalog metadata shared across the app — category labels, colors,
// spec groupings for the "grouped spec" detail view, and PC Builder slot
// definitions (used by the compatibility checker in lib/compat.js).

export const CAT_LABEL = {
  cpu: "CPU",
  gpu: "GPU",
  ram: "RAM",
  ssd: "SSD",
  laptop: "Laptop",
  mobo: "Motherboard",
  psu: "PSU",
  monitor: "Monitor",
  peripheral: "Peripherals",
  case: "Case",
};

export const CAT_COLOR = {
  cpu: "#0E7C6B",
  gpu: "#8A4FCB",
  ram: "#C98A2C",
  ssd: "#2C7BC9",
  laptop: "#0E7C6B",
  mobo: "#C4472F",
  psu: "#3A8F52",
  monitor: "#2C7BC9",
  peripheral: "#8A4FCB",
  case: "#4B5768",
};

// Categories that make up a PC Build, in slot order.
export const BUILD_SLOTS = ["cpu", "mobo", "ram", "gpu", "ssd", "psu", "case", "monitor"];

export const SPEC_GROUPS = {
  cpu: [
    ["General", ["Socket"]],
    ["Performance", ["Cores", "Threads", "Base Clock", "Boost Clock"]],
    ["Power", ["TDP"]],
  ],
  gpu: [
    ["Performance", ["Boost Clock"]],
    ["Memory", ["Memory", "Memory Bus"]],
    ["Power", ["Recommended PSU", "Power Connector"]],
    ["Physical", ["Length"]],
  ],
  ram: [
    ["General", ["Capacity"]],
    ["Performance", ["Speed", "CAS Latency"]],
    ["Power", ["Voltage"]],
    ["Physical", ["Heat Spreader"]],
  ],
  ssd: [
    ["General", ["Capacity", "Interface"]],
    ["Performance", ["Read Speed", "Write Speed"]],
    ["Physical", ["Form Factor"]],
  ],
  laptop: [
    ["General", ["CPU", "GPU", "RAM", "Storage"]],
    ["Physical", ["Display"]],
  ],
  mobo: [
    ["General", ["Socket", "Chipset"]],
    ["Memory", ["Memory"]],
    ["Physical", ["Form Factor", "M.2 Slots"]],
  ],
  psu: [
    ["General", ["Wattage", "Efficiency"]],
    ["Physical", ["Modular", "Fan"]],
  ],
  monitor: [
    ["General", ["Size", "Resolution"]],
    ["Performance", ["Refresh Rate", "Panel", "Response Time"]],
  ],
  peripheral: [["General", ["Sensor", "Buttons", "Lighting", "Connection"]]],
  case: [["General", ["Form Factor Support"]]],
};

export function fmt(n) {
  return "৳" + Number(n || 0).toLocaleString("en-US");
}

// Lowest in-stock offer for a product doc shaped { offers: [...] }
// True only for a real, positive price. null / 0 / "" / NaN all mean the
// shop shows no price (e.g. "Up Coming", "Call For Price").
export function hasPrice(offer) {
const n = Number(offer?.price);
return offer?.price != null && Number.isFinite(n) && n > 0;
}
// Lowest PRICED offer (prefers in-stock). Offers without a price are ignored,
// so a "TBA" offer can never win as "lowest" with a fake 0.
export function lowest(product) {

const priced = (product?.offers || []).filter(hasPrice);
if (!priced.length) return null;
const inStock = priced.filter((o) => o.availability === "in_stock");
const pool = inStock.length ? inStock : priced;
return [...pool].sort((a, b) => a.price- b.price)[0];
}
// Text to show where a price would normally be. The shop's real text
// (offer.priceText) wins; otherwise a neutral fallback.
export function offerPriceText(offer) {
return (offer?.priceText && String(offer.priceText).trim()) || "Price unavailable";
}
// Same, for a whole product (use when lowest(product) is null).
export function productPriceText(product) {
const o = (product?.offers || []).find((x) => !hasPrice(x) && x?.priceText);
return o ? offerPriceText(o) : "Price unavailable";
}


// Returns the first usable product image across the image field shapes used by
// older seed data, manually-added products, and the scraper.
export function getProductImage(product) {
  const values = [];
  if (Array.isArray(product?.images)) values.push(...product.images);
  else if (product?.images) values.push(product.images);
  values.push(product?.image, product?.imageUrl, product?.imageURL, product?.image_url, product?.thumbnail);

  for (const value of values) {
    if (!value) continue;
    const url = typeof value === "string" ? value : value?.url || value?.src;
    // Skip site logos / banners / placeholders that scrapers sometimes store.
    if (typeof url === "string" && /^(https?:\/\/|\/)/i.test(url.trim()) && !/(^|[\/_.-])(og-)?logo|placeholder|no[-_]?image|default[-_]?image|banner|sprite|favicon/i.test(url)) return url.trim();
  }
  return null;
}
// Original product page URL on the shop's own website (http/https only, so a
// bad/malicious value can never become a javascript: link).
export function offerUrl(offer) {
const u = offer?.sourceUrl || offer?.url;
return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;}