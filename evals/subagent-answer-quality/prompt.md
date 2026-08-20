---
name: subagent-answer-quality
tags: [routing, tier, quality]
plugins: ["../.."]
fixture: order-service
agent: scout
runs: 3
max_turns: 30
timeout_seconds: 900
---

The intake stage hands off to validation through withRetryIntake with INTAKE_LIMITS.maxRetries set to 3. Suppose validateOrder fails on an order that violates one of validation's own rules. How many times does validateOrder actually get called?

Answer with the number alone on the first line, then explain what in the code makes it that number.
