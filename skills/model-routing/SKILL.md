---
name: model-routing
description: Route work to the cheapest model tier that holds quality. Use when deciding which model or agent should handle a task, when the user asks about token economy / cost optimization, or when dispatching implementation, review, or test-run work to subagents.
---

# Model Routing

The expensive model thinks, cheaper models grind. The main-session model
cannot be switched by Claude - routing works through subagent delegation
(the `model` param of the Agent tool, or the agents bundled with this
plugin).

## Tiers

Think in tiers, not model names - names rot, tiers do not:

- **strongest** - the main-session model the user picked (Fable, Opus,
  whatever their plan offers). Highest reasoning quality, highest cost.
- **mid** - one step down (e.g. Opus when the session runs Fable, Sonnet
  when the session runs Opus).
- **cheap** - Sonnet/Haiku class. Mechanical work.

## Routing table

| Task | Where | Agent / model |
|------|-------|---------------|
| Planning, brainstorming, specs, docs, architecture | main session | strongest (user's /model choice) |
| Codebase exploration ("where is X", "how does Y work") | subagent | `scout` (sonnet) |
| Implementing an approved plan/spec | subagent | `implementer` (opus) |
| Trivial mechanical tasks: renames, boilerplate, mirrored constants | subagent | sonnet |
| Small interactive edits, quick fixes | main session | strongest |
| Code review of implemented work | subagent | `reviewer` (opus) |
| Final review of high-risk or large diffs | main session | strongest |
| Run tests/builds/linters, report failures | subagent | `test-runner` (haiku) |
| Playwright/E2E scenarios, failure interpretation | subagent | `e2e-runner` (sonnet) |

## Rules

- Never burn main-session tokens on raw test or build output. Dispatch to
  `test-runner` and consume its compact report.
- Route codebase exploration to `scout` - conclusions and file:line refs
  come back, file dumps stay in the subagent.
- Batch related plan tasks per subagent. Each subagent re-reads files from
  scratch; one tiny task per agent costs more than it saves.
- Subagents cannot see the conversation. Write self-contained task
  descriptions: goal, files, constraints, verification commands.
- Repo-specific policies override this table (e.g. "unit tests only,
  never integration tests").
- Review is one cheap pass; missed bugs are expensive. When a diff is
  high-risk, escalate the final review to the main session instead of
  delegating it.
- If an entire session is one phase (pure implementation), suggest the
  user switch /model instead of delegating everything - a session on the
  right model beats a swarm of subagents.

## Complementary settings

- `fallbackModel` in settings.json: `["opus", "sonnet"]` - the harness
  falls back down the tier ladder when the primary model is unavailable
  or its quota is exhausted.
- `/model opusplan`: built-in two-tier hybrid (Opus plans, Sonnet
  executes) - a good lazy default for sessions that do not need the
  strongest tier.
