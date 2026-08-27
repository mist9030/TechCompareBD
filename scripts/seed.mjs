// Seeds Firestore with sample shops + products so the app has something to
// show immediately. Run with: npm run seed
//
// Requires FIREBASE_SERVICE_ACCOUNT_JSON in .env.local pointing to a service
// account key file (Firebase Console → Project Settings → Service accounts
// → Generate new private key). Never commit that file.

import "dotenv/config";
import fs from "fs";
import admin from "firebase-admin";

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "./firebase/service-account.json";
if (!fs.existsSync(keyPath)) {
  console.error(`Service account file not found at ${keyPath}.`);
  console.error("Download one from Firebase Console → Project Settings → Service accounts, and set FIREBASE_SERVICE_ACCOUNT_JSON in .env.local.");
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const SHOPS = [
  { id: "startech", name: "Star Tech", url: "startech.com.bd", logoLetter: "S", status: "active", lastRun: "5 hours ago", offers: 6110 },
  { id: "techland", name: "Tech Land BD", url: "techlandbd.com", logoLetter: "T", status: "active", lastRun: "2 hours ago", offers: 3820 },
  { id: "ryans", name: "Ryans", url: "ryans.com", logoLetter: "R", status: "active", lastRun: "1 day ago", offers: 5290 },
  { id: "pickaboo", name: "Pickaboo", url: "pickaboo.com", logoLetter: "P", status: "idle", lastRun: "3 days ago", offers: 2440 },
  { id: "ucc", name: "UCC", url: "ucc.com.bd", logoLetter: "U", status: "error", lastRun: "6 hours ago", offers: 1980 },
];

function offer(shop, price, availability = "in_stock", prev, updated = "Just now") {
  const shopMeta = SHOPS.find((s) => s.id === shop);
  return { shop, shopName: shopMeta.name, price, availability, updated, ...(prev ? { prev } : {}) };
}

const PRODUCTS = [
  {
    id: "i5-14400", cat: "cpu", brand: "Intel", name: "Intel Core i5-14400", model: "BX80715114400", discount: 0,
    specs: { Socket: "LGA1700", Cores: "10 (6P+4E)", Threads: "16", "Base Clock": "2.5 GHz", "Boost Clock": "4.7 GHz", TDP: "65W" },
    offers: [offer("startech", 22500), offer("techland", 22900, "in_stock", null, "1 day ago"), offer("ryans", 22750, "in_stock", null, "6 hours ago"), offer("pickaboo", 23400, "in_stock", null, "2 days ago"), offer("ucc", 22650, "out_of_stock", null, "5 hours ago")],
  },
  {
    id: "r5-7600", cat: "cpu", brand: "AMD", name: "AMD Ryzen 5 7600", model: "100-100000593BOX", discount: 8,
    specs: { Socket: "AM5", Cores: "6", Threads: "12", "Base Clock": "3.8 GHz", "Boost Clock": "5.1 GHz", TDP: "65W" },
    offers: [offer("startech", 20900, "in_stock", 22700), offer("techland", 21500, "in_stock", null, "4 hours ago"), offer("ryans", 21200, "in_stock", null, "1 day ago"), offer("ucc", 21800, "in_stock", null, "6 hours ago")],
  },
  {
    id: "rtx4060", cat: "gpu", brand: "MSI", name: "MSI GeForce RTX 4060 Gaming X 8GB", model: "RTX 4060 GAMING X 8G", discount: 4,
    specs: { "Boost Clock": "2595 MHz", Memory: "8GB GDDR6", "Memory Bus": "128-bit", "Recommended PSU": "550W", "Power Connector": "1x 8-pin", Length: "300mm" },
    offers: [offer("startech", 39500, "in_stock", 41200), offer("techland", 40200, "in_stock", null, "1 day ago"), offer("ryans", 39900, "in_stock", null, "5 hours ago"), offer("pickaboo", 41500, "in_stock", null, "3 days ago"), offer("ucc", 40800, "in_stock", null, "6 hours ago")],
  },
  {
    id: "ddr5-16", cat: "ram", brand: "Kingston", name: "Kingston Fury Beast 16GB DDR5", model: "KF556C40BB-16", discount: 0,
    specs: { Capacity: "16GB (1x16GB)", Speed: "5600 MHz", "CAS Latency": "CL40", Voltage: "1.25V", "Heat Spreader": "Yes" },
    offers: [offer("startech", 5200), offer("techland", 5450, "in_stock", null, "2 days ago"), offer("ryans", 5300, "in_stock", null, "1 day ago"), offer("ucc", 5150, "in_stock", null, "5 hours ago")],
  },
  {
    id: "990evo-1tb", cat: "ssd", brand: "Samsung", name: "Samsung 990 EVO 1TB", model: "MZ-V9E1T0BW", discount: 12,
    specs: { Capacity: "1TB", Interface: "PCIe 4.0/5.0 x2 NVMe", "Read Speed": "5,000 MB/s", "Write Speed": "4,200 MB/s", "Form Factor": "M.2 2280" },
    offers: [offer("startech", 10500, "in_stock", 11900, "4 hours ago"), offer("techland", 10900, "in_stock", null, "1 day ago"), offer("ryans", 10650, "in_stock", null, "3 hours ago"), offer("pickaboo", 11200, "out_of_stock", null, "4 days ago")],
  },
  {
    id: "tuf-a15", cat: "laptop", brand: "ASUS", name: "ASUS TUF Gaming A15 FA507", model: "FA507NV-LP083W", discount: 6,
    specs: { CPU: "Ryzen 7 7435HS", GPU: "RTX 4060 8GB", RAM: "16GB DDR5", Storage: "512GB NVMe SSD", Display: '15.6" FHD 144Hz' },
    offers: [offer("startech", 98500, "in_stock", 104900, "6 hours ago"), offer("techland", 99900, "in_stock", null, "2 days ago"), offer("ryans", 99200, "in_stock", null, "1 day ago"), offer("ucc", 101500, "in_stock", null, "5 hours ago")],
  },
  {
    id: "b650m-ds3h", cat: "mobo", brand: "Gigabyte", name: "Gigabyte B650M DS3H", model: "B650M DS3H", discount: 0,
    specs: { Socket: "AM5", Chipset: "B650", Memory: "DDR5, 4 slots, up to 128GB", "Form Factor": "Micro-ATX", "M.2 Slots": "2" },
    offers: [offer("startech", 14500, "in_stock", null, "1 day ago"), offer("techland", 15200, "in_stock", null, "3 days ago"), offer("ryans", 14750, "in_stock", null, "6 hours ago")],
  },
  {
    id: "dq650-m", cat: "psu", brand: "DeepCool", name: "DeepCool PM650D 650W", model: "PM650D", discount: 0,
    specs: { Wattage: "650W", Efficiency: "80+ Gold", Modular: "Non-modular", Fan: "120mm FDB" },
    offers: [offer("startech", 7200, "in_stock", null, "2 days ago"), offer("techland", 7450, "in_stock", null, "1 day ago"), offer("ryans", 7300, "in_stock", null, "4 hours ago"), offer("ucc", 7150, "in_stock", null, "5 hours ago")],
  },
  {
    id: "g5-27", cat: "monitor", brand: "Samsung", name: 'Samsung Odyssey G5 27"', model: "LS27CG512EW", discount: 10,
    specs: { Size: '27"', Resolution: "2560x1440 QHD", "Refresh Rate": "165Hz", Panel: "VA", "Response Time": "1ms" },
    offers: [offer("startech", 26900, "in_stock", 29900, "3 hours ago"), offer("techland", 27800, "in_stock", null, "2 days ago"), offer("pickaboo", 28400, "in_stock", null, "4 days ago")],
  },
  {
    id: "g102", cat: "peripheral", brand: "Logitech", name: "Logitech G102 Lightsync", model: "G102", discount: 0,
    specs: { Sensor: "6,000 DPI Optical", Buttons: "6 Programmable", Lighting: "RGB Lightsync", Connection: "Wired USB" },
    offers: [offer("startech", 1250), offer("techland", 1350, "in_stock", null, "1 day ago"), offer("ryans", 1290, "in_stock", null, "6 hours ago"), offer("ucc", 1300, "in_stock", null, "2 days ago")],
  },
  {
    id: "nzxt-h5", cat: "case", brand: "NZXT", name: "NZXT H5 Flow", model: "CC-H51FW-01", discount: 0,
    specs: { "Form Factor Support": "ATX / Micro-ATX / Mini-ITX" },
    offers: [offer("startech", 8200, "in_stock", null, "1 day ago"), offer("techland", 8600, "in_stock", null, "2 days ago")],
  },
];

async function seed() {
  console.log("Seeding shops…");
  for (const s of SHOPS) {
    const { id, ...data } = s;
    await db.collection("shops").doc(id).set(data);
  }

  console.log("Seeding products…");
  for (const p of PRODUCTS) {
    const { id, ...data } = p;
    await db.collection("products").doc(id).set(data);
  }

  console.log(`Done. Seeded ${SHOPS.length} shops and ${PRODUCTS.length} products.`);
  console.log("Tip: to get an admin panel login, register a normal account in the app,");
  console.log('then in the Firestore console set users/{uid}.role = "admin".');
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
