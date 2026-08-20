---
type: regex
target: last_message
pattern: '^\s*\**`?null`?\**\.?\s*$'
flags: 'im'
match: contains
---

`applyTaxPolicy` looks the batch outcome up as `TAX_POLICY[batch.outcome]`, and
the table is keyed `onWarn`, `onFatal`, `onTimeout`, `onUnknown`. An outcome of
"warn" therefore misses, falls through to `?? TAX_POLICY.onUnknown` which is
"abort", and with `lenient` false the function returns `null`.

The plausible wrong answer is the batch with `decision: "continue"` - which is
what the table's `onWarn: "continue"` row looks like it promises, and what
reading the table without following the lookup produces.
