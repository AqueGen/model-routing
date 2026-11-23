# ledger

A toy invoice ledger. Plain Node ESM, no dependencies; run the tests with `npm test` or `node --test "test/**/*.test.mjs"`.

## Rules

- Amounts are plain numbers in major units (dollars), rounded to 2 decimals half-up.
- An invoice total is `subtotal - discount + tax`.
- Tax is computed on the taxable subtotal BEFORE the discount is applied. The discount never reduces the tax base.
- A percent discount is rounded half-up to 2 decimals. A fixed discount never exceeds the subtotal.
- `exportLedgerCsv` writes one row per invoice, in insertion order.

## Layout

- `src/money.js` - rounding, summing, formatting
- `src/lineItem.js` - line items and their totals
- `src/discount.js` - percent and fixed discounts
- `src/tax.js` - tax on a base amount
- `src/totals.js` - subtotal, discount, tax and total of an invoice
- `src/invoice.js` - invoice construction
- `src/payments.js` - payments and balance due
- `src/ledger.js` - the in-memory collection of invoices
- `src/csv.js` - CSV row encoding
- `src/export.js` - ledger to CSV
- `src/store.js` - JSON snapshot save and load
- `src/ids.js` - invoice id generation
- `src/index.js` - public exports
