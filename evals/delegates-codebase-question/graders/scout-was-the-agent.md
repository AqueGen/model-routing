---
type: regex
target: trace
pattern: '"subagent_type"\s*:\s*"(?:model-routing:)?scout"'
match: contains
---

Indicator, not a fair scored comparison: the baseline arm has no `scout` to
dispatch, so it fails this by construction. Read it only as confirmation that
the with-plugin arm picked the agent the routing guidance names, rather than
falling back to a generic one.
