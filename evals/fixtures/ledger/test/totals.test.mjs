import { test } from "node:test";
import assert from "node:assert/strict";
import { createInvoice, computeTotals, roundMoney } from "../src/index.js";

const invoice = createInvoice({
  id: "INV-0001",
  customer: "Acme",
  taxRate: 0.1,
  discount: { type: "percent", value: 10 },
  lineItems: [
    { sku: "A", unitPrice: 10, quantity: 3 },
    { sku: "B", unitPrice: 5.5, quantity: 2, taxable: false },
  ],
});

test("roundMoney rounds half up to 2 decimals", () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(2.344), 2.34);
});

test("totals apply tax on the pre-discount taxable subtotal", () => {
  assert.deepEqual(computeTotals(invoice), { subtotal: 41, discount: 4.1, tax: 3, total: 39.9 });
});

test("fixed discount never exceeds the subtotal", () => {
  const big = { ...invoice, discount: { type: "fixed", value: 500 } };
  assert.equal(computeTotals(big).discount, 41);
});
