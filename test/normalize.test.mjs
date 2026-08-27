import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBDTPrice,
  normalizeAvailability,
  normalizeSpecs,
  buildSourceHash,
  normalizeModelForMatching,
} from "../lib/ingestion/normalize.mjs";

test("parseBDTPrice: handles comma-separated Taka strings", () => {
  assert.equal(parseBDTPrice("4,300৳"), 4300);
  assert.equal(parseBDTPrice("৳ 39,500"), 39500);
  assert.equal(parseBDTPrice("22500"), 22500);
  assert.equal(parseBDTPrice(4900), 4900);
});

test("parseBDTPrice: returns null for unparseable input", () => {
  assert.equal(parseBDTPrice(""), null);
  assert.equal(parseBDTPrice(null), null);
  assert.equal(parseBDTPrice("Call for price"), null);
});

test("normalizeAvailability: maps retailer text to canonical enum", () => {
  assert.equal(normalizeAvailability("In Stock"), "in_stock");
  assert.equal(normalizeAvailability("Out Of Stock"), "out_of_stock");
  assert.equal(normalizeAvailability("Pre Order"), "preorder");
  assert.equal(normalizeAvailability("Up Coming"), "preorder");
  assert.equal(normalizeAvailability(""), "unknown");
  assert.equal(normalizeAvailability("Limited Stock"), "unknown");
});

test("normalizeSpecs: maps known CPU labels to canonical catalog keys", () => {
  const specs = normalizeSpecs("cpu", [
    { label: "Base Frequency", value: "3.5GHz" },
    { label: "Maximum Turbo Frequency", value: "3.7GHz" },
    { label: "Cores", value: "4" },
    { label: "Threads", value: "4" },
    { label: "Default TDP", value: "65W" },
    { label: "Some Weird Retailer Field", value: "xyz" },
  ]);
  assert.equal(specs["Base Clock"], "3.5GHz");
  assert.equal(specs["Boost Clock"], "3.7GHz");
  assert.equal(specs["Cores"], "4");
  assert.equal(specs["Threads"], "4");
  assert.equal(specs["TDP"], "65W");
  // Unrecognized labels are preserved rather than silently dropped.
  assert.equal(specs["Some Weird Retailer Field"], "xyz");
});

test("normalizeSpecs: first mapped value wins if a label repeats", () => {
  const specs = normalizeSpecs("cpu", [
    { label: "Cores", value: "4" },
    { label: "CPU Cores", value: "8" }, // also maps to "Cores" — should not overwrite
  ]);
  assert.equal(specs["Cores"], "4");
});

test("buildSourceHash: stable for identical input, differs on change", () => {
  const a = buildSourceHash({ price: 100, availability: "in_stock" });
  const b = buildSourceHash({ price: 100, availability: "in_stock" });
  const c = buildSourceHash({ price: 105, availability: "in_stock" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("normalizeModelForMatching: strips marketing parens and punctuation", () => {
  assert.equal(normalizeModelForMatching("Ryzen 5 5500 (Tray)"), "ryzen 5 5500");
  assert.equal(normalizeModelForMatching("RTX-4060 Gaming X 8G"), "rtx 4060 gaming x 8g");
});
