---
type: regex
target: trace
pattern: '"name"\s*:\s*"(Agent|Task)"'
match: not_contains
---

Same behavioural claim as the small case, on a question where the reading is
actually wide: nothing in the prompt asks for delegation, so the plugin arm
should not dispatch where the baseline would not. Up to 0.16 this grader was
inverted and rewarded the dispatch, which on this workload cost 23% more than
answering inline.

Both arms can pass - the baseline has `Explore` and `general-purpose`.
