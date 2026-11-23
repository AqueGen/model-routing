---
name: reviewer-seeded-bugs
tags: [reviewer, quality, cost]
fixture: ledger-review
agent: model-routing:reviewer
runs: 3
max_turns: 40
timeout_seconds: 600
---

Review the change in `changes.diff` (a patch against the tree in this directory, not yet applied). The project rules are in `README.md`. List every defect you find, each with the file and function it is in and why it is wrong. Do not list style preferences or changes that behave identically.
