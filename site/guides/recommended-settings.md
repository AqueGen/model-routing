# Recommended settings

**Session model + effort (the weighted price/quality pick).** The plugin
adds no dispatches, so everything you do not delegate runs on the session
model - pick it for the work you keep there, and let the agents price the
work you do delegate. That makes the balanced default:

- **Session model: Opus.** Near-frontier reasoning for the decisions that
  cascade through everything downstream, without paying the very top tier
  on every turn. Reserve
  the strongest tier (Fable/Mythos-class) for sessions that are *entirely*
  hard reasoning - a thorny architecture day or a subtle debugging hunt -
  where the whole session sits in the seat that tier is worth. Drop to a
  **Sonnet** session for pure-implementation days with no hard decisions.
- **Effort: medium** as the everyday session setting - a deliberate step
  DOWN from Claude Code's per-model default of high (Opus 5.5, Sonnet 5.5
  and Haiku 5.5 excepted: there medium already IS the default). Use **high** for sessions
  built around architecture or subtle debugging. Session effort mainly
  governs main-session work - the bundled agents pin their own - so raise
  it when the thinking you keep in the main seat is genuinely hard, not
  across the board.

Rule of thumb: pick the session tier for the *hardest thing the main
session does*. The plugin adds no dispatches, so only work you or a skill
send to a subagent leaves that tier.

Generation jumps are free: agent pins name model FAMILIES (opus, sonnet,
haiku), so when a new family member ships (Opus 5 -> Opus 5.5, then
Sonnet 5 -> Sonnet 5.5), reviewer, the sonnet-pinned agents and every
`model=opus` escalation upgrade automatically on the Anthropic API - no
plugin update, no config change. The cloud platforms resolve the same
aliases to older models (`haiku` to Haiku 4.5 on all four, `opus` to
Opus 4.6 on Foundry), so the figures below are first-party ones. Prices and every
rule derived from them do not follow the alias, though: the stats price
table and the cost-driven exceptions above need a check on each launch.
`/model-routing:stats` shows which
models actually ran. One behavioral note for Opus 5 sessions: the model
delegates to subagents more readily than its predecessors, which makes
the conscious-tier rule (explicit `model=` on unpinned dispatches) more
load-bearing, not less - watch the tier-leak line in the report.

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

For a stronger model at decision points without running it throughout, the harness has a built-in advisor tool - `/advisor opus`, or `"advisorModel": "opus"` in settings. It runs server-side, sees the whole conversation, and Claude decides when to consult it, which makes it the productized form of the advisor pattern this plugin describes. Two traps worth knowing: the accepted advisors are listed per model rather than per tier (an Opus 5 or 5.5 session takes Fable or Opus 5+, a Sonnet 5.5 session takes Fable, Mythos, Opus 5, Opus 5.5 or Sonnet 5.5 and rejects the Opus 4.7/4.8 and Sonnet 5 advisors a Sonnet 5 session accepts), and Fable as advisor needs Fable access plus, on plans that bill Fable to usage credits, the one-time consent from `/model fable` - before that a saved `"fable"` attaches no advisor and raises no error. Advisor calls never show up in `/model-routing:stats`, because a server tool is not an Agent dispatch; they land in `/usage`.

### Dynamic workflows

A workflow run spawns subagents per stage, so its cost scales with
fan-out rather than with your session. Two settings decide most of it
([dynamic workflows](https://code.claude.com/docs/en/workflows)):

- **Dynamic workflow size** in `/config` defaults to `medium` (under 15
  agents) on Claude Code 2.1.219 and later; older versions defaulted to
  `unrestricted`. The values are `small` under 5, `medium` under 15,
  `large` under 50. It steers the fan-out before a run starts and needs
  no plugin - but it is advice, not a cap: a prompt that calls for a
  different scale still overrides it, and the runtime caps (16
  concurrent, 1000 per run) are the only hard limits. Choosing a value
  yourself also moves the `Large workflow` warning to that agent count
  (the other trigger, a projected 1.5M tokens, stays), which cuts both
  ways: `small` warns earlier, `large` warns later, at 50. The warning
  tracks the choice, not the value: leave the setting untouched and it
  stays at 25, even though the default value is `medium`.
- **Ultracode** (`/effort ultracode`) is the deliberate opposite:
  `xhigh` effort plus automatic workflow planning for every substantial
  task, and it suppresses the large-run warning because switching it on
  already consents to large runs. This plugin does not fight it. What
  changes is where the savings come from: with fan-out consented to,
  set `model`/`effort` per `agent()` call so each node is cheap, instead
  of trying to keep the fan-out small.

Inside a script, every `agent()` call without `model`/`effort` opts
inherits the session model at session effort - see the skill's Workflows
chapter for the full set of rules.
