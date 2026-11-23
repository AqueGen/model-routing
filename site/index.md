---
layout: home
pageClass: mr-home
markdownStyles: false
title: model-routing
titleTemplate: Tiered model routing for Claude Code
---

<VerdictPanel />

<div class="home-body"><div class="vp-doc">

## What it does

model-routing picks the agent, model and effort for each subagent dispatch that you, a repo policy or another skill (Superpowers, workflows) decided to make, so the dispatch does not inherit the expensive session model. Since 0.17 it adds no dispatches of its own. No proxy, no gateway, nothing extra in the request path.

<div class="agents-table">

| Agent | Tier | Effort | Takes |
| --- | --- | --- | --- |
| `scout` | <TierMark tier="sonnet" /> | low | Read-only exploration: conclusions and file:line refs come back, file dumps stay out |
| `surveyor` | <TierMark tier="haiku" /> | medium | Breadth sweeps: enumerate, list, trace a chain end to end |
| `implementer` | <TierMark tier="sonnet" /> | medium | One task from a plan, multi-file work included; `model=opus` only for security, money, migrations, concurrency or a retry |
| `reviewer` | <TierMark tier="opus" /> | high | Final, whole-branch, high-risk and pre-PR review |
| `task-reviewer` | <TierMark tier="sonnet" /> | high | Per-task reviews inside a plan loop (Superpowers SDD) |
| `test-runner` | <TierMark tier="haiku" /> | low | Run tests, builds and linters, report failures compactly |
| `verifier` | <TierMark tier="haiku" /> | medium | Gate on another agent's diff: does it match the task |
| `e2e-runner` | <TierMark tier="sonnet" /> | medium | Playwright and E2E scenarios, failure interpretation |

</div>

Filled discs show the tier: one for haiku, two for sonnet, three for opus. [How the tiers and efforts were chosen](/how-it-works/why-each-choice).

## Install

```text
claude marketplace add AqueGen/model-routing
```

Then enable the plugin:

```text
/plugin install model-routing@model-routing
```

Requirements and other options are on the [install page](/get-started/install).

## Will it save you money?

It depends on how you work, and [the evals](/benchmarks/evals) measured both halves.

A subagent is not free. It starts with an empty context, so everything it reads is a cache write, while your main session pays cache read for what it already has. That bill lands whether or not this plugin is installed. What the plugin changes is the price per token.

- **You already dispatch subagents** (Superpowers, workflows, any delegation-heavy practice): it saves, roughly a sixth on the one measured workload - $1.68 with the tier routed down, against $2.01 for the same subagent work repriced at your session's tier.
- **You work mostly in one session and rarely delegate**: since 0.17 it adds no dispatches, so what remains is an always-on surcharge of about 1.9k cache-write tokens per session. Up to 0.16 it pushed dispatches that would not otherwise have happened, and on one workload that cost roughly a fifth.
- **Sending a multi-file task to sonnet instead of opus** cost 53% less with every hidden test passing.

One workload, three runs an arm: read the direction as solid and the exact percentage as not. The [full section](/benchmarks/) has the table, the caveats and the token charts.

</div></div>
