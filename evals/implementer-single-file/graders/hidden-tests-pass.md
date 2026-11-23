---
type: command
command: node --test "hidden-tests/**/*.test.mjs"
hidden: hidden-tests
---

Hidden tests for the requested rounding modes, copied into the workspace only after the run ends. They fail on the unmodified fixture. Passing means the feature does what the prompt specified, including the RangeError and the unchanged default.
