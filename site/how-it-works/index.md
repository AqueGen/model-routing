# How it works

Tiered model routing for Claude Code token economy: **every subagent
dispatch runs on the cheapest tier and effort its role needs, and the
plugin adds no dispatches of its own.**

The plugin does not decide whether work leaves your main session - you,
your repo policies and your other skills (Superpowers, workflows) do. It
decides what a subagent runs on once it is dispatched: implementation,
review and test runs go to cheaper tiers at a pinned effort instead of
inheriting the session model, and the raw output (test logs, file reads)
stays out of your main session context.

Routing tunes two knobs, not one: **which model** handles a task and **how
hard it thinks** (reasoning effort). A strong model at low effort often
beats a weaker model straining at high effort, for a fraction of the cost -
so cheap, well-scoped work runs at low effort and only genuinely hard
reasoning gets high or above. Each bundled agent pins its effort in frontmatter,
overriding the session setting. When a subagent gets stuck on the approach rather
than a missing fact, it escalates back to the main session for a decision
instead of thrashing.

Everything stays inside Anthropic models. No proxy, no third-party
gateway, nothing extra in the request path.

## What's inside

| Component | Model | Effort | Purpose |
| --------- | ----- | ------ | ------- |
| `agents/scout.md` | sonnet | low | Read-only codebase exploration: conclusions and file:line refs come back, file dumps stay out. |
| `agents/surveyor.md` | haiku | medium | Read-only breadth: enumerate, list, trace a chain end to end. Measured correct on the cheap tier where `scout`'s judgement work is not. |
| `agents/test-runner.md` | haiku | low | Run tests/builds/linters, report failures compactly. Never fixes anything. |
| `agents/e2e-runner.md` | sonnet | medium | Drive Playwright/E2E scenarios, interpret failures (product bug vs test bug vs flake). |
| `agents/implementer.md` | sonnet | medium | Implement one well-defined task from an approved plan, multi-file work included. Verifies its own work. Dispatch with `model=opus` only for security, money, data migrations or concurrency, or a retry. |
| `agents/reviewer.md` | opus | high | Review a diff for correctness bugs, ranked by severity. Final/whole-branch, high-risk and pre-PR review. |
| `agents/task-reviewer.md` | sonnet | high | Per-task reviews and scoped re-reviews inside a plan loop (Superpowers SDD), following the caller's review template. Flags diffs that need `reviewer` instead. |
| `agents/verifier.md` | haiku | medium | Cheap gate on a subagent's diff: does it match the task (scope, completeness, obvious breakage)? Not a code review. |
| `skills/model-routing/` | - | - | The routing table Claude follows when choosing the agent, model and effort of a dispatch. |
| `hooks/routing-anchor.md` | - | - | Short routing anchor auto-injected at session start - zero config. |
| `hooks/dispatch-counter.mjs` | - | - | Logs every Agent dispatch; `stats`/`report`/`tokens` modes measure what stayed off the session model. |
| `hooks/register.mjs` | - | - | A Claude Code mod: one line above the prompt with what this session's subagents cost on the models they ran on, and what the same tokens would cost on the session model (`hooks/lib/ledger.mjs` holds the prices). Terminal and the Desktop Code tab only; `/clear` resets it. |
| `commands/stats.md` | - | - | `/model-routing:stats` - dispatch + token-volume report in the chat. |

## Example

A typical feature session on a strong main model (Opus/Fable), where the
work is delegated because you or a plan-execution skill asked for it:

> Dispatch an implementer for tasks 1-2 from the plan.

Without the plugin the subagent inherits the session model, so the file
reads, the code and its own test run all bill at the top tier.

With the plugin the same dispatch runs on a cheaper tier:

```text
Main session (strong model, plans and coordinates):
  dispatches implementer (sonnet) with two self-contained tasks

    implementer: Changed OrderService.cs (null-payload guard) and
    OrderServiceTests.cs (3 new tests). Build OK, 214/214 unit
    tests pass.

  reports back to you.
```

The file reads, diffs, and raw test logs stayed inside the subagent.
Your expensive main-session context grew by one short report.

## Zero config

The plugin injects a short routing anchor at session start (SessionStart
hook), so the rules are always in context - no CLAUDE.md edits needed.
The anchor text lives in `hooks/routing-anchor.md`; the full logic is in
the `model-routing` skill. If you had pasted a routing snippet into your
`CLAUDE.md` before, remove it - the hook replaces it.
