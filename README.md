# model-routing

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
|-----------|-------|---------|
| `agents/test-runner.md` | haiku | Run tests/builds/linters, report failures compactly. Never fixes anything. |
| `agents/e2e-runner.md` | sonnet | Drive Playwright/E2E scenarios, interpret failures (product bug vs test bug vs flake). |
| `agents/implementer.md` | opus | Implement one well-defined task from an approved plan. Verifies its own work. |
| `agents/reviewer.md` | opus | Review a diff for correctness bugs, ranked by severity. |
| `skills/model-routing/` | - | The routing table and delegation rules Claude follows when deciding where work goes. |

## Install

```
claude marketplace add AqueGen/model-routing
```

Then enable the plugin:

```
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

```
/model opusplan
```

(Opus plans, Sonnet executes - no plugin needed.)

## Optional CLAUDE.md snippet

The skill activates on demand. If you want the routing rules always in
context, paste this into your `~/.claude/CLAUDE.md`:

```markdown
### Model Routing (token economy)

Expensive model thinks, cheap models grind. Enforced via subagent
delegation - Claude cannot switch the main-session model, only delegate.

- Planning, specs, docs, architecture: main session.
- Implementing an approved plan: `implementer` subagents; batch related
  tasks per agent. Trivial mechanical tasks: sonnet is enough.
- Small interactive edits: main session.
- Code review: `reviewer` subagent; high-risk diffs get a final review
  in the main session.
- Test/build runs: `test-runner` subagent - never burn main-session
  tokens on raw test output.
- Playwright/E2E and failure interpretation: `e2e-runner` subagent.
- Repo-specific test policies override this.
```

## Why not a router proxy?

[claude-code-router](https://github.com/musistudio/claude-code-router) and
similar gateways solve a different problem: routing across providers
(OpenAI, Gemini, DeepSeek...). If you live inside Anthropic models, a
proxy adds a failure point and ToS risk for no gain. Subagent delegation
is native, supported, and does the same tier-splitting.

## License

MIT
