import { test } from "node:test";
import assert from "node:assert/strict";
import { roundMoney, formatMoney, sumMoney } from "../src/money.js";

test("default mode is half-up and unchanged", () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(0.125), 0.13);
  assert.equal(roundMoney(2.344), 2.34);
  assert.equal(roundMoney(0.125, "half-up"), 0.13);
});

test("half-even rounds ties to the even cent", () => {
  assert.equal(roundMoney(0.125, "half-even"), 0.12);
  assert.equal(roundMoney(0.375, "half-even"), 0.38);
  assert.equal(roundMoney(0.135, "half-even"), 0.14);
  assert.equal(roundMoney(2.344, "half-even"), 2.34);
  assert.equal(roundMoney(2.346, "half-even"), 2.35);
});

test("floor rounds toward negative infinity", () => {
  assert.equal(roundMoney(1.239, "floor"), 1.23);
  assert.equal(roundMoney(1.23, "floor"), 1.23);
  assert.equal(roundMoney(-1.231, "floor"), -1.24);
});

test("ceil rounds toward positive infinity", () => {
  assert.equal(roundMoney(1.231, "ceil"), 1.24);
  assert.equal(roundMoney(1.23, "ceil"), 1.23);
  assert.equal(roundMoney(-1.239, "ceil"), -1.23);
});

test("an unknown mode throws a RangeError", () => {
  assert.throws(() => roundMoney(1, "banker"), RangeError);
  assert.throws(() => roundMoney(1, ""), RangeError);
});

test("sumMoney and formatMoney keep their behaviour", () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(formatMoney(3), "3.00");
});
