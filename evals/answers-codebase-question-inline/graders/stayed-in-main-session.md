---
type: regex
target: trace
pattern: '"name"\s*:\s*"(Agent|Task)"'
match: not_contains
---

The behavioural claim under test: the plugin routes dispatches, it does not
create them. Nothing in this prompt asks for delegation, so the plugin arm
should answer a one-file codebase question inline exactly like the baseline.
Up to 0.16 the anchor pushed this question to `scout` (3/3 against 0/3), and
that push cost more than answering inline.

The tool has been named both `Agent` and `Task` across builds; match either.
