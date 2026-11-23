import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, createInvoice, recordPayment, exportLedgerCsv, nextInvoiceId } from "../src/index.js";

function sample() {
  const ledger = new Ledger();
  ledger.add(createInvoice({ id: "INV-0001", customer: "Acme, Inc.", lineItems: [{ sku: "A", unitPrice: 20, quantity: 2 }] }));
  ledger.add(createInvoice({ id: "INV-0002", customer: "Beta", taxRate: 0.2, lineItems: [{ sku: "B", unitPrice: 10, quantity: 1 }] }));
  return ledger;
}

test("outstanding sums balances", () => {
  assert.equal(sample().outstanding(), 52);
});

test("payments reduce the balance", () => {
  const ledger = sample();
  ledger.replace(recordPayment(ledger.get("INV-0001"), 15));
  assert.equal(ledger.outstanding(), 37);
});

test("csv export has a header and one row per invoice", () => {
  const lines = exportLedgerCsv(sample()).trimEnd().split("\n");
  assert.equal(lines[0], "id,customer,subtotal,discount,tax,total,paid,balance");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], 'INV-0001,"Acme, Inc.",40.00,0.00,0.00,40.00,0.00,40.00');
});

test("nextInvoiceId continues the sequence", () => {
  assert.equal(nextInvoiceId([]), "INV-0001");
  assert.equal(nextInvoiceId(["INV-0001", "INV-0009"]), "INV-0010");
});
