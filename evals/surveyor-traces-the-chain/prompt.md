---
name: surveyor-traces-the-chain
tags: [routing, tier, breadth]
plugins: ["../.."]
fixture: order-service
agent: surveyor
runs: 3
max_turns: 30
timeout_seconds: 600
---

An order enters this service at intake and ends up archived. Trace the whole path: list every stage it passes through, in order, from intake to archive.
