---
type: command
command: node --test "hidden-tests/**/*.test.mjs"
hidden: hidden-tests
---

Hidden tests for the multi-currency requirements, copied into the workspace only after the run ends. They cover currency.js, money.js, invoice.js, totals.js, export.js and ledger.js, so a run that wires only some of the modules fails. They fail on the unmodified fixture.
