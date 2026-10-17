import test from "node:test";
import assert from "node:assert/strict";
import { checkCompatibility, compatSummary } from "../lib/compat.js";

const p = (name, specs = {}) => ({ name, specs });

test("Ryzen 7 5800X (AM4) on a B650M (AM5) board is an error, even with no Socket spec", () => {
  const issues = checkCompatibility({
    cpu: p("AMD Ryzen 7 5800X Processor"),
    mobo: p("MSI B650M GAMING WIFI AM5 mATX Motherboard"),
  });
  assert.equal(compatSummary(issues), "error");
});

test("Ryzen 7 7700 on B650M is fine", () => {
  const issues = checkCompatibility({ cpu: p("AMD Ryzen 7 7700"), mobo: p("MSI B650M GAMING WIFI") });
  assert.equal(compatSummary(issues), "ok");
});

test("Intel i5-11400 (LGA1200) on Z790 (LGA1700) is an error", () => {
  const issues = checkCompatibility({
    cpu: p("Intel 11th Gen Core i5-11400 Rocket Lake Processor"),
    mobo: p("ASUS PRIME Z790-P DDR5"),
  });
  assert.equal(compatSummary(issues), "error");
});

test("DDR4 RAM on an AM5 (DDR5) board is an error", () => {
  const issues = checkCompatibility({
    ram: p("Colorful Battle-AX 16GB DDR4 3200MHz Desktop RAM"),
    mobo: p("MSI B650M GAMING WIFI AM5 mATX Motherboard"),
  });
  assert.equal(compatSummary(issues), "error");
});

test("nothing checkable -> 'none'", () => {
  assert.equal(compatSummary(checkCompatibility({ cpu: p("Unknown CPU") })), "none");
});
