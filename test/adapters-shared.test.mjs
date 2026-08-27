import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCompoundValues, parsePricePair } from "../lib/ingestion/adapters/shared.js";

test("splitCompoundValues: splits a real UCC-style compound cell into two canonical fields", () => {
  // Real value observed live: a single table cell containing both facts,
  // with the cell's own column-1 label ("Base Clock") redundantly repeated
  // at the start of the value, followed by a second embedded label.
  const pairs = [{ label: "Base Clock", value: "Base Clock 4.7GHz    Max. Boost Clock Up to 5.3GHz" }];
  const result = splitCompoundValues(pairs);

  assert.equal(result.length, 2);
  const baseClock = result.find((r) => r.label.toLowerCase() === "base clock");
  const boostClock = result.find((r) => r.label.toLowerCase() === "boost clock");

  assert.ok(baseClock, "expected a 'Base Clock' field");
  assert.ok(boostClock, "expected a 'Boost Clock' field");
  // The key correctness property: the base clock's VALUE must not still
  // contain the literal text "Base Clock" repeated inside it (the bug this
  // test guards against — an earlier version of this function produced
  // {label: "Base Clock", value: "Base Clock 4.7GHz Max."}).
  assert.ok(!baseClock.value.toLowerCase().includes("base clock"));
  assert.ok(baseClock.value.includes("4.7GHz"));
  assert.ok(boostClock.value.includes("5.3GHz"));
});

test("splitCompoundValues: leaves an ordinary single-fact value untouched", () => {
  const pairs = [{ label: "Cores", value: "6" }];
  const result = splitCompoundValues(pairs);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, "Cores");
  assert.equal(result[0].value, "6");
});

test("splitCompoundValues: a value with no known embedded label (e.g. a cache breakdown) is passed through, just whitespace-cleaned", () => {
  const pairs = [{ label: "Cache", value: "L1 cache 384KB    L2 cache 6MB     L3 cache 32MB" }];
  const result = splitCompoundValues(pairs);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, "Cache");
  // Whitespace collapsed even though nothing was split.
  assert.equal(result[0].value, "L1 cache 384KB L2 cache 6MB L3 cache 32MB");
});

test("splitCompoundValues: leading text before the first embedded label stays under the original column-1 label", () => {
  // e.g. a hypothetical "6MB L2 Cache" style value where a number precedes
  // an embedded label rather than the label appearing at position 0.
  const pairs = [{ label: "Memory", value: "8GB Speed 3200MHz" }];
  const result = splitCompoundValues(pairs);
  const memory = result.find((r) => r.label === "Memory");
  const speed = result.find((r) => r.label.toLowerCase() === "speed");
  assert.ok(memory);
  assert.equal(memory.value, "8GB");
  assert.ok(speed);
  assert.equal(speed.value, "3200MHz");
});

test("parsePricePair: trailing-currency two-price format (StarTech/UCC/Onix/Creatus)", () => {
  assert.deepEqual(parsePricePair("4,300৳ 4,900৳"), { price: 4300, previousPrice: 4900 });
});

test("parsePricePair: trailing-currency single price", () => {
  assert.deepEqual(parsePricePair("15,500৳"), { price: 15500, previousPrice: null });
});

test("parsePricePair: leading-currency with decimals (Global Brand format)", () => {
  assert.deepEqual(parsePricePair("৳79,500.00"), { price: 79500, previousPrice: null });
});

test("parsePricePair: no parseable price (e.g. 'Call For Price') returns nulls, never a fabricated 0", () => {
  assert.deepEqual(parsePricePair("Call For Price"), { price: null, previousPrice: null });
});
