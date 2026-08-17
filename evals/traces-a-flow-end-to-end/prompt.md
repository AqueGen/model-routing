---
name: traces-a-flow-end-to-end
tags: [routing, scout, wide-reading]
plugins: ["../.."]
fixture: order-service
runs: 3
max_turns: 20
timeout_seconds: 600
---

An order enters this service at intake and ends up archived. Trace the whole path: list every stage it passes through, in order, from intake to archive.
