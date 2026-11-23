---
type: command
command: node --test "test/**/*.test.mjs"
---

The project's own test suite must still pass after the change. It does not prove the feature exists - `hidden-tests-pass` does - only that nothing was broken or deleted to get there.
