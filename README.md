# model-routing

[![validate](https://github.com/AqueGen/model-routing/actions/workflows/validate.yml/badge.svg)](https://github.com/AqueGen/model-routing/actions/workflows/validate.yml)

Tiered model routing for Claude Code token economy: **the strongest model
thinks, cheaper models grind.**

Planning and architecture stay in your main session on the best model you
have. Implementation, review, and test runs get delegated to subagents on
cheaper tiers - and the raw output (test logs, file reads) never enters
your main session context, which is where most tokens actually die.

Everything stays inside Anthropic models. No proxy, no third-party
gateway, no ToS gray zones.

## What's inside

| Component | Model | Purpose |
| --------- | ----- | ------- |
| `agents/scout.md` | sonnet | Read-only codebase exploration: conclusions and file:line refs come back, file dumps stay out. |
| `agents/test-runner.md` | haiku | Run tests/builds/linters, report failures compactly. Never fixes anything. |
| `agents/e2e-runner.md` | sonnet | Drive Playwright/E2E scenarios, interpret failures (product bug vs test bug vs flake). |
| `agents/implementer.md` | opus | Implement one well-defined task from an approved plan. Verifies its own work. |
| `agents/reviewer.md` | opus | Review a diff for correctness bugs, ranked by severity. |
| `skills/model-routing/` | - | The routing table and delegation rules Claude follows when deciding where work goes. |
| `hooks/routing-anchor.md` | - | Short routing anchor auto-injected at session start - zero config. |

## Example

A typical feature session on a strong main model (Opus/Fable):

> Implement tasks 1-2 from the plan, then run the unit tests.

Without the plugin everything happens in the main session: it reads a
dozen files, writes code, and dumps the full test log into your context.
Thousands of expensive tokens spent on mechanics.

With the plugin:

```text
Main session (strong model, plans and coordinates):
  dispatches implementer (opus) with two self-contained tasks

    implementer: Changed OrderService.cs (null-payload guard) and
    OrderServiceTests.cs (3 new tests). Build OK, 214/214 unit
    tests pass.

  dispatches test-runner (haiku) for the final check

    test-runner: PASS. 214/214, 0 skipped.
    Command: dotnet test src/Orders.Tests.csproj

  reports back to you.
```

The file reads, diffs, and raw test logs stayed inside the subagents.
Your expensive main-session context grew by two short reports.

## Install

```text
claude marketplace add AqueGen/model-routing
```

Then enable the plugin:

```text
/plugin install model-routing@model-routing
```

(or toggle it in the `/plugin` menu, or add
`"model-routing@model-routing": true` to `enabledPlugins` in
`~/.claude/settings.json`).

For local development: clone the repo and
`claude marketplace add /path/to/model-routing`.

## Usage

The agents show up as regular subagent types. Ask for them explicitly or
let Claude route via the skill:

- "Where is the webhook retry logic?" - Claude dispatches `scout`
  (sonnet); you get the answer with file:line refs, not a pile of file
  contents in your context.
- "Run the unit tests" - Claude dispatches `test-runner` (haiku); you get
  a compact pass/fail report instead of a wall of logs.
- "Implement tasks 1-3 from the plan" - Claude dispatches `implementer`
  (opus) with self-contained task descriptions.
- "Review the diff" - Claude dispatches `reviewer` (opus). For high-risk
  diffs, ask for review in the main session instead - one expensive pass
  is cheaper than a missed bug.
- "Walk through the checkout flow in the browser" - Claude dispatches
  `e2e-runner` (sonnet).

The routing rules live in the `model-routing` skill and activate when
Claude decides where to send work. Two rules worth knowing:

- **Batch tasks per subagent.** Each subagent re-reads files from scratch;
  ten one-line tasks as ten agents costs more than one agent with ten
  tasks.
- **Repo policies win.** If your project says "never run integration
  tests", the runner respects it.

## Recommended settings

Fallback down the tier ladder when your primary model hits its quota
(`~/.claude/settings.json`):

```json
{
  "fallbackModel": ["opus", "sonnet"]
}
```

For sessions that do not need the strongest tier, the built-in hybrid is a
good lazy default:

```text
/model opusplan
```

(Opus plans, Sonnet executes - no plugin needed.)

## Zero config

The plugin injects a short routing anchor at session start (SessionStart
hook), so the rules are always in context - no CLAUDE.md edits needed.
The anchor text lives in `hooks/routing-anchor.md`; the full logic is in
the `model-routing` skill. If you had pasted a routing snippet into your
`CLAUDE.md` before, remove it - the hook replaces it.

## Why not a router proxy?

[claude-code-router](https://github.com/musistudio/claude-code-router) and
similar gateways solve a different problem: routing across providers
(OpenAI, Gemini, DeepSeek...). If you live inside Anthropic models, a
proxy adds a failure point and ToS risk for no gain. Subagent delegation
is native, supported, and does the same tier-splitting.

## License

MIT
