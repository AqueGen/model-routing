---
type: regex
target: last_message
pattern: 'onWarn'
match: contains
---

Naming `onWarn` is the difference between reporting the return value and
understanding it. The question asks whether the author intended this, and the
answer is only defensible by pointing at the gap between the table's `onWarn` key
and the raw `warn` the lookup uses - which is the actual defect in the code.
