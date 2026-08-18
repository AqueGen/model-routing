---
name: forced-dispatch-tier
tags: [routing, tier, wide-reading, unfinished]
plugins: ["../.."]
fixture: order-service
runs: 3
max_turns: 20
timeout_seconds: 600
append_system_prompt: 'Delegate all codebase exploration to a subagent. Do not read, grep, or glob project files in the main session - dispatch an agent to do it and work from what it reports back.'
tools: [Task, Agent, TodoWrite]
---

An order enters this service at intake and ends up archived. Trace the whole path: list every stage it passes through, in order, from intake to archive.
