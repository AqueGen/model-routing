---
type: regex
target: trace
pattern: '"name"\s*:\s*"(Read|Grep|Glob|Bash|PowerShell)"'
match: not_contains
---

The main session must not read the project itself, or the run is a blend of both
strategies and its cost lands between the two things being compared - worse than
a missing data point, because it looks like one.

Banning Read, Grep and Glob alone does not achieve this. The first attempt did
exactly that and the session simply read the whole codebase through Bash -
`cat`, `grep -n`, `sed -n` - and the cost figures from those runs were
meaningless. Shell counts as reading, so the shells are banned too and this
grader watches for them.

Subagent tool calls do not appear in the parent transcript, so this only sees
what the main session did, which is exactly the scope it needs.
