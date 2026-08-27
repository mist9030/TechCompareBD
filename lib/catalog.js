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
export function lowest(product) {
  if (!product?.offers?.length) return null;
  const inStock = product.offers.filter((o) => o.availability === "in_stock");
  const pool = inStock.length ? inStock : product.offers;
  return [...pool].sort((a, b) => a.price - b.price)[0];
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
    if (typeof url === "string" && /^(https?:\/\/|\/)/i.test(url.trim())) return url.trim();
  }
  return null;
}
