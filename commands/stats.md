---
description: Show model-routing dispatch stats - how much work was kept off the strongest model
allowed-tools: Bash
---

Routing dispatch report (7-day window):

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" report`

Present the report above to the user as-is in a code block, then add one
short sentence interpreting it (e.g. what share of dispatches stayed off
the strongest model). Do not re-run the command, do not embellish, no
tables.
