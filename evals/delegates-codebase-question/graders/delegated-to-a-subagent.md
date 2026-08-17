---
type: regex
target: trace
pattern: '"name"\s*:\s*"(Agent|Task)"'
match: contains
---

The behavioural claim under test: a codebase question should leave the main
session rather than be ground out inline. Both arms can pass this - the baseline
has the built-in Explore and general-purpose agents - so the score difference is
a real measurement, not an artefact of the plugin owning the only subagent.

The tool has been named both `Agent` and `Task` across builds; match either.
