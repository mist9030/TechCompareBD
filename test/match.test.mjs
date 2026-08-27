import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCandidate, nameSimilarity } from "../lib/ingestion/match.mjs";

const EXISTING = [
  {
    id: "i5-14400",
    cat: "cpu",
    brand: "Intel",
    name: "Intel Core i5-14400",
    model: "BX80715114400",
    offers: [{ shop: "startech", sourceProductId: "9001" }],
  },
  {
    id: "r5-7600",
    cat: "cpu",
    brand: "AMD",
    name: "AMD Ryzen 5 7600",
    model: "100-100000593BOX",
    offers: [{ shop: "techland", sourceProductId: "5501" }],
  },
  {
    id: "rtx4060",
    cat: "gpu",
    brand: "MSI",
    name: "MSI GeForce RTX 4060 Gaming X 8GB",
    model: "RTX 4060 GAMING X 8G",
    offers: [],
  },
];

test("matchCandidate: reuses a product already linked by source id on this shop", () => {
  const normalized = {
    sourceShopId: "startech",
    sourceProductId: "9001",
    category: "cpu",
    brand: "Intel",
    name: "Intel Core i5-14400 Processor (some new title)",
    model: "BX80715114400",
  };
  const result = matchCandidate(normalized, EXISTING);
  assert.equal(result.decision, "match");
  assert.equal(result.productId, "i5-14400");
  assert.equal(result.reason, "source_id");
});

test("matchCandidate: exact model number match within brand+category", () => {
  const normalized = {
    sourceShopId: "ryans",
    sourceProductId: "NEW-999",
    category: "cpu",
    brand: "AMD",
    name: "AMD Ryzen 5 7600 Desktop Processor",
    model: "100-100000593BOX",
  };
  const result = matchCandidate(normalized, EXISTING);
  assert.equal(result.decision, "match");
  assert.equal(result.productId, "r5-7600");
  assert.equal(result.reason, "model_exact");
});

test("matchCandidate: high name similarity within brand auto-matches", () => {
  const normalized = {
    sourceShopId: "ucc",
    sourceProductId: "UCC-123",
    category: "gpu",
    brand: "MSI",
    // Near-identical wording/order to the existing product name (one extra
    // token) -> high token-overlap score, should clear the auto-match bar.
    name: "MSI GeForce RTX 4060 Gaming X 8GB (Boxed)",
    model: "", // retailer didn't expose a clean model string
  };
  const result = matchCandidate(normalized, EXISTING);
  assert.equal(result.decision, "match");
  assert.equal(result.productId, "rtx4060");
});

test("matchCandidate: only moderate name similarity goes to review, not a blind auto-match", () => {
  // Real-world case: same GPU, but the retailer's title is reworded enough
  // (brand/model tokens present, but under the auto-match bar) that we
  // should NOT silently guess — even with just one candidate in range.
  const normalized = {
    sourceShopId: "ucc",
    sourceProductId: "UCC-124",
    category: "gpu",
    brand: "MSI",
    name: "MSI RTX 4060 Gaming X 8GB Graphics Card",
    model: "",
  };
  const result = matchCandidate(normalized, EXISTING);
  assert.equal(result.decision, "ambiguous");
  assert.equal(result.candidates[0].productId, "rtx4060");
});

test("matchCandidate: unrelated product in same category+brand is 'new', not matched", () => {
  const normalized = {
    sourceShopId: "startech",
    sourceProductId: "7788",
    category: "cpu",
    brand: "Intel",
    name: "Intel Core i9-14900K Processor",
    model: "BX8071514900K",
  };
  const result = matchCandidate(normalized, EXISTING);
  assert.equal(result.decision, "new");
});

test("matchCandidate: ambiguous when two existing products share a model number", () => {
  const dup = [
    ...EXISTING,
    {
      id: "i5-14400-dup-bad-data",
      cat: "cpu",
      brand: "Intel",
      name: "Intel Core i5-14400 (Tray)",
      model: "BX80715114400",
      offers: [],
    },
  ];
  const normalized = {
    sourceShopId: "pickaboo",
    sourceProductId: "PB-1",
    category: "cpu",
    brand: "Intel",
    name: "Intel Core i5-14400",
    model: "BX80715114400",
  };
  const result = matchCandidate(normalized, dup);
  assert.equal(result.decision, "ambiguous");
  assert.equal(result.candidates.length, 2);
});

test("nameSimilarity: identical token sets score 1, unrelated score near 0", () => {
  assert.equal(nameSimilarity("AMD Ryzen 5 7600", "Ryzen 5 7600 AMD"), 1);
  assert.ok(nameSimilarity("AMD Ryzen 5 7600", "Samsung 990 EVO 1TB SSD") < 0.1);
});
