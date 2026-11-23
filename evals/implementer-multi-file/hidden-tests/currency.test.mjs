import { test } from "node:test";
import assert from "node:assert/strict";
import { decimalsFor } from "../src/currency.js";
import { Ledger, computeTotals, createInvoice, exportLedgerCsv, formatMoney, recordPayment, roundMoney } from "../src/index.js";

test("decimalsFor knows the supported currencies", () => {
  assert.equal(decimalsFor("USD"), 2);
  assert.equal(decimalsFor("EUR"), 2);
  assert.equal(decimalsFor("JPY"), 0);
  assert.throws(() => decimalsFor("XXX"), Error);
});

test("roundMoney and formatMoney follow the currency, defaulting to USD", () => {
  assert.equal(roundMoney(10.5, "JPY"), 11);
  assert.equal(roundMoney(10.4, "JPY"), 10);
  assert.equal(roundMoney(0.125, "EUR"), 0.13);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(formatMoney(1234, "JPY"), "1234");
  assert.equal(formatMoney(5, "EUR"), "5.00");
  assert.equal(formatMoney(5), "5.00");
});

test("createInvoice carries a validated currency", () => {
  const base = { id: "INV-1", customer: "Tokyo", lineItems: [] };
  assert.equal(createInvoice(base).currency, "USD");
  assert.equal(createInvoice({ ...base, currency: "JPY" }).currency, "JPY");
  assert.throws(() => createInvoice({ ...base, currency: "XXX" }), Error);
});

function yenInvoice() {
  return createInvoice({
    id: "INV-J",
    customer: "Tokyo",
    currency: "JPY",
    taxRate: 0.08,
    discount: { type: "percent", value: 10 },
    lineItems: [
      { sku: "A", unitPrice: 105, quantity: 1 },
      { sku: "B", unitPrice: 250, quantity: 2 },
    ],
  });
}

test("totals are rounded to the invoice currency", () => {
  assert.deepEqual(computeTotals(yenInvoice()), { subtotal: 605, discount: 61, tax: 48, total: 592 });
});

test("USD totals are unchanged", () => {
  const usd = createInvoice({ id: "INV-U", customer: "Acme", taxRate: 0.1, lineItems: [{ sku: "A", unitPrice: 10, quantity: 3 }] });
  assert.deepEqual(computeTotals(usd), { subtotal: 30, discount: 0, tax: 3, total: 33 });
});

test("csv export has a currency column and currency-aware amounts", () => {
  const ledger = new Ledger();
  ledger.add(yenInvoice());
  ledger.add(createInvoice({ id: "INV-U", customer: "Acme", lineItems: [{ sku: "A", unitPrice: 20, quantity: 1 }] }));
  const lines = exportLedgerCsv(ledger).trimEnd().split("\n");
  assert.equal(lines[0], "id,customer,currency,subtotal,discount,tax,total,paid,balance");
  assert.equal(lines[1], "INV-J,Tokyo,JPY,605,61,48,592,0,592");
  assert.equal(lines[2], "INV-U,Acme,USD,20.00,0.00,0.00,20.00,0.00,20.00");
});

test("outstanding is per currency and defaults to USD", () => {
  const ledger = new Ledger();
  ledger.add(yenInvoice());
  ledger.add(createInvoice({ id: "INV-U", customer: "Acme", lineItems: [{ sku: "A", unitPrice: 20, quantity: 1 }] }));
  assert.equal(ledger.outstanding(), 20);
  assert.equal(ledger.outstanding("USD"), 20);
  assert.equal(ledger.outstanding("JPY"), 592);
  ledger.replace(recordPayment(ledger.get("INV-J"), 100));
  assert.equal(ledger.outstanding("JPY"), 492);
});
