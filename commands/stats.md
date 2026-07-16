---
description: Show model-routing stats - dispatches and real token volume kept off the session model
allowed-tools: Bash
---

Dispatch report (7-day window):

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" report 2>&1 || echo "model-routing: stats script failed - node 18+ must be on PATH"`

Real token volume (7-day window, from subagent transcripts):

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" tokens 2>&1 || echo "model-routing: tokens script failed - node 18+ must be on PATH"`

If either block above is empty or shows a shell error (not a script message -
the script itself always explains empty data in words), the embedded shell run
failed silently. In that case run the two commands yourself through whatever
shell tool works in this session (`node <plugin>/hooks/dispatch-counter.mjs
report` and `... tokens`) and present those results instead.

Present both reports above to the user as-is in code blocks, then add 2-3
short sentences of interpretation: what share of dispatches and of token
volume stayed below the session model, how the per-session-model split
compares (e.g. fable sessions routing down more than opus sessions), and
anything that looks off (e.g. many subagents running AT the session tier).
Do not re-run the commands, no extra tables, no dollar estimates.
