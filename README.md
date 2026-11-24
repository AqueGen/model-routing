# model-routing

[![tests](https://img.shields.io/github/actions/workflow/status/AqueGen/model-routing/validate.yml?branch=main&label=tests)](https://github.com/AqueGen/model-routing/actions/workflows/validate.yml)
[![version](https://img.shields.io/github/v/tag/AqueGen/model-routing?label=version)](https://github.com/AqueGen/model-routing/releases)
[![docs](https://img.shields.io/badge/docs-aquegen.github.io-blue)](https://aquegen.github.io/model-routing/)

Tiered model routing for Claude Code token economy: **every subagent dispatch runs on the cheapest tier and effort its role needs, and the plugin adds no dispatches of its own.**

The plugin does not decide whether work leaves your main session - you, your repo policies and your other skills (Superpowers, workflows) do. It decides what a subagent runs on once it is dispatched: implementation, review and test runs go to cheaper tiers at a pinned effort instead of inheriting the session model, and the raw output (test logs, file reads) stays out of your main session context. Everything stays inside Anthropic models: no proxy, no third-party gateway.

Full documentation: **https://aquegen.github.io/model-routing/**

## Will it save you money?

A subagent is not free: it starts with an empty context, so everything it reads is a cache write, and that bill lands whether or not this plugin is installed. The plugin changes the price per token, not that penalty.

- You already dispatch subagents (Superpowers, workflows): it saves, roughly a sixth on the one measured workload - $1.68 with the tier routed down against $2.01 for the same work repriced at your session's tier.
- You rarely delegate: since 0.17 it adds no dispatches, so what remains is an always-on surcharge of about 1.9k cache-write tokens per session. Up to 0.16 it pushed dispatches that would not otherwise have happened, which cost roughly a fifth on that workload.
- Multi-file implementation on sonnet instead of opus cost 53% less with every hidden test passing.

One workload, three runs an arm: the direction is solid, the exact percentage is not. [Full benchmarks](https://aquegen.github.io/model-routing/benchmarks/).

## Install

```text
/plugin marketplace add AqueGen/model-routing
```

Then enable the plugin:

```text
/plugin install model-routing@model-routing
```

More options and requirements: [install guide](https://aquegen.github.io/model-routing/get-started/install).

## Agents

| Agent | Model | Effort | Purpose |
| ----- | ----- | ------ | ------- |
| `scout` | sonnet | low | Read-only codebase exploration: conclusions and file:line refs come back, file dumps stay out. |
| `surveyor` | haiku | medium | Read-only breadth: enumerate, list, trace a chain end to end. |
| `test-runner` | haiku | low | Run tests, builds and linters, report failures compactly. Never fixes anything. |
| `e2e-runner` | sonnet | medium | Drive Playwright/E2E scenarios, interpret failures. |
| `implementer` | sonnet | medium | Implement one well-defined task from an approved plan. `model=opus` only for security, money, data migrations or concurrency, or a retry. |
| `reviewer` | opus | high | Review a diff for correctness bugs, ranked by severity. |
| `task-reviewer` | sonnet | high | Per-task reviews and scoped re-reviews inside a plan loop. |
| `verifier` | haiku | medium | Cheap gate on a subagent's diff: does it match the task? |

## Documentation

- [Getting started](https://aquegen.github.io/model-routing/get-started/getting-started) and [usage](https://aquegen.github.io/model-routing/get-started/usage)
- [How it works](https://aquegen.github.io/model-routing/how-it-works/), [why each choice](https://aquegen.github.io/model-routing/how-it-works/why-each-choice), [model tiers and effort ladder](https://aquegen.github.io/model-routing/how-it-works/model-tiers)
- [Recommended settings](https://aquegen.github.io/model-routing/guides/recommended-settings), [overriding pins](https://aquegen.github.io/model-routing/guides/overriding-pins), [staying up to date](https://aquegen.github.io/model-routing/guides/staying-up-to-date)
- Live cost line above the prompt, e.g. `model-routing: 4 haiku, 2 sonnet - API $0.02 vs $0.18 at parent` (Claude Code 2.1.287+): [how it works](https://aquegen.github.io/model-routing/how-it-works/)
- [Dispatch counter and `/model-routing:stats`](https://aquegen.github.io/model-routing/reference/dispatch-counter), [environment variables](https://aquegen.github.io/model-routing/reference/environment-variables)
- [Evals](evals/README.md) and [evidence files](evals/evidence/README.md)
- [Releasing](https://aquegen.github.io/model-routing/contribute/)

## License

MIT
