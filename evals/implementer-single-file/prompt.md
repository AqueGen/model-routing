---
name: implementer-single-file
tags: [implementer, quality, cost]
fixture: ledger
agent: model-routing:implementer
allowed_tools: [Read, Edit, Write, Glob, Grep, "Bash(node:*)", "Bash(npm:*)"]
runs: 3
max_turns: 30
timeout_seconds: 600
---

In this project, `roundMoney(value)` in `src/money.js` always rounds half-up to 2 decimals. Add a rounding mode as an optional second parameter: `roundMoney(value, mode = "half-up")`.

Supported modes, all rounding to 2 decimals:

- `"half-up"` - the current behaviour, and the default.
- `"half-even"` - ties go to the even cent (0.125 becomes 0.12, 0.135 becomes 0.14).
- `"floor"` - toward negative infinity.
- `"ceil"` - toward positive infinity.

Any other mode throws a `RangeError`. Behaviour of calls without a mode must not change. Add tests for the new modes to the existing test files, and make sure `node --test "test/**/*.test.mjs"` passes.
