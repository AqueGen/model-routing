---
description: Show model-routing stats - dispatches and real token volume kept off the session model
allowed-tools: Bash
---

Dispatch report (7-day window):

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" report`

Real token volume (7-day window, from subagent transcripts):

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" tokens`

Present both reports above to the user as-is in code blocks, then add 2-3
short sentences of interpretation: what share of dispatches and of token
volume stayed below the session model, and anything that looks off (e.g.
many subagents running AT the session tier). Do not re-run the commands,
no extra tables, no dollar estimates.
