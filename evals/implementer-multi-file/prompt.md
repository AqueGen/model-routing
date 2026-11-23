---
name: implementer-multi-file
tags: [implementer, quality, cost]
fixture: ledger
agent: model-routing:implementer
allowed_tools: [Read, Edit, Write, Glob, Grep, "Bash(node:*)", "Bash(npm:*)"]
runs: 3
max_turns: 50
timeout_seconds: 900
---

Add multi-currency support to this project. Everything is USD today. Requirements:

- A new module `src/currency.js` exports `decimalsFor(code)`: 2 for `"USD"` and `"EUR"`, 0 for `"JPY"`. Any other code throws an `Error`. Re-export it from `src/index.js`.
- `roundMoney(value, currency = "USD")` and `formatMoney(value, currency = "USD")` use the currency's decimals (half-up rounding as today). `formatMoney(1234, "JPY")` is `"1234"`.
- `createInvoice` accepts an optional `currency` (default `"USD"`), validates it with `decimalsFor`, and stores it as `invoice.currency`.
- `computeTotals(invoice)` rounds subtotal, discount, tax and total to the invoice's currency. For USD the results must not change.
- `exportLedgerCsv` gets a `currency` column right after `customer` (header: `id,customer,currency,subtotal,discount,tax,total,paid,balance`) and formats every amount with the invoice's currency decimals.
- `Ledger#outstanding(currency = "USD")` sums balances of the invoices in that currency only.

Update the existing tests that the new CSV header breaks, add tests for the new behaviour, and make sure `node --test "test/**/*.test.mjs"` passes.
