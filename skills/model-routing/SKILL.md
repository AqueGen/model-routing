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

## Effort, not just tier

Model tier is one knob; reasoning effort is the second, and it moves cost
as hard as tier does. The same model at `low` effort can cost a fraction
of `max` and still clear a task that was never hard - a strong model
thinking lightly often beats a weaker model thinking hard. Pick both:
which model, and how hard it thinks.

The full ladder is `low / medium / high / xhigh / max`. On every model
that supports effort the default is `high` - an unset effort IS high
effort, not medium, and there is no exception. Opus 4.7 and 4.8 are
often misread as one: they RECOMMEND starting at `xhigh` for coding and
agentic work, which is a value you have to pass, not what runs when you
pass nothing.
Which levels exist at all is a per-model list rather than a version
cutoff, and setting a level the model does not support runs the highest
supported level at or below it. The per-model recommendation moves with the generation: Opus
4.7 and 4.8 are told to start coding and agentic work at `xhigh`, while
Opus 5 is told to start at `high`, step up to `xhigh` for demanding
coding and agentic work, and use `low` and `medium` liberally as the
primary control for token cost and response time wherever evals show
quality holds. The step down got cheaper, not the step up. `xhigh` is
also the newest level and absent on some models that support `max`
(e.g. the 4.6 generation), so check the model's own docs when in doubt -
and re-sweep effort on your own evals after a model change instead of
carrying old settings across generations. This plugin tunes for cost: pins sit at the lowest level
the task shape allows and step up on evidence (a weak result retries
one step up). That deliberate step below the product default, wherever
the task allows one, is where the effort savings come from.

Effort is not only thinking depth - it shapes every token in the
response, tool calls included. At lower effort the model folds
operations into fewer tool calls and skips preamble, so a cheap pin
saves twice: less reasoning AND fewer round trips. Anthropic's own
example use case for `low` is subagents.

- **low** - mechanical or well-scoped work: exploration, renames, running
  tests, reading a diff for a known-shape change.
- **medium** - normal implementation: real logic, but the approach is
  already clear. On Sonnet 5 this level is described as comparable to
  Sonnet 4.6 at `high` - the sonnet/medium pins are not a downgrade to
  last year's quality.
- **high** - genuinely hard reasoning: architecture, subtle debugging,
  high-risk final review, anything where a wrong approach is expensive
  to unwind.
- **xhigh** - long-horizon agentic or coding work (multi-hour runs, token
  budgets in the millions) that genuinely earns the extra reasoning. In
  this plugin that is a session-level or Workflow `effort` choice, never
  an agent pin.
- **max** - exceptional frontier-grade problems only, not a routine level
  anywhere in this table.

Match effort to task difficulty, not to tier - most work is a
`low`/`medium` task in disguise. Where effort is set: the bundled agents
pin theirs in frontmatter (`effort:` field - overrides the session level
for that agent); Workflow scripts take an `effort` option per `agent()`
call; any other Agent dispatch inherits the session effort. The Agent
tool has NO effort param, so dispatching a pinned agent with `model=opus`
changes the model, not the effort - the frontmatter pin still applies.
Vary effort across workloads, not inside one conversation: changing the
effort value between requests invalidates the cached prompt prefix, so
per-agent pins and per-`agent()` opts - each with its own context - are
the cache-safe way to differ.

## Routing table

Each row carries a default effort - the second knob, tuned to the task,
not the tier. For the bundled agents the effort is pinned in their
frontmatter; the column documents it rather than asking the caller to
set it. For unpinned rows it is the target level, reached via the
session effort or a Workflow `effort` opt - a plain Agent dispatch
carries no effort param:

| Task | Where | Agent / model | Effort |
|------|-------|---------------|--------|
| Planning, brainstorming, specs, docs, architecture | main session | strongest (user's /model choice) | high |
| Codebase exploration ("where is X", "how does Y work") | subagent | `scout` (sonnet) | low |
| Implementing an approved plan/spec (ordinary: single-file, clear shape) | subagent | `implementer` (sonnet) | medium |
| Complex implementation: multi-file refactor, subtle concurrency/security | subagent | `implementer` with `model=opus` | medium (pinned) |
| Trivial mechanical tasks: renames, boilerplate, mirrored constants | subagent | sonnet | low |
| Small interactive edits, quick fixes | main session | strongest | low |
| Code review of implemented work | subagent | `reviewer` (opus) | high |
| Final review of high-risk or large diffs | main session | strongest | high |
| Run tests/builds/linters, report failures | subagent | `test-runner` (haiku) | low |
| Sanity-check a subagent's diff against its task | subagent | `verifier` (haiku) | low |
| Playwright/E2E scenarios, failure interpretation | subagent | `e2e-runner` (sonnet) | medium |
| Fresh external context, knowledge-cutoff gap (new APIs, recent releases) | subagent | mid-tier agent with web access | medium |

Main-session rows: the effort there is the user's session setting - Claude
cannot change it mid-session, only suggest.

## Why these tiers and efforts

The assignments are not arbitrary - each follows from where a model tier
actually earns its cost:

- **Exploration -> sonnet/low.** Finding where code lives and tracing a
  path is retrieval, not reasoning. A cheap model at low effort reads and
  reports as well as an expensive one; the cost is in the file volume,
  which stays in the subagent regardless of tier.
- **Ordinary implementation -> sonnet/medium.** Sonnet is near-opus
  quality on single-file, clear-shape coding at a fraction of the price
  (as of the Opus 5 launch, July 2026: sonnet runs at intro pricing
  through 2026-08-31, ~2.5x cheaper than opus). For work whose approach
  the plan already decided, that margin does not change the outcome, so
  sonnet stays the value default. Medium effort because the agent
  executes, it does not design.
- **Complex implementation -> opus, still at the agent's pinned medium**
  (the dispatch changes the model only - see the effort section).
  Escalate from sonnet when
  any of these hold: the change is multi-file or cross-layer; it touches
  security, money, data migrations, concurrency, protocols, or public
  contracts; a sonnet attempt came back weak; or an E2E/visual result
  needs hard interpretation. Ambiguity is NOT an escalation trigger but a
  stop sign: implementer rejects ambiguous tasks by contract, so an
  unclear task or root cause gets clarified in the main session (or
  investigated via scout) first - then the well-defined task dispatches.
  Opus 5 was a step-change over Opus 4.8 at UNCHANGED
  price ($5/$25), so the opus tier now buys strictly more per dollar than
  when this table was tuned - when in doubt between sonnet and opus for
  implementation, take opus.
- **Review -> opus/high.** Review is one cheap pass guarding against
  expensive misses - an asymmetric bet where the strongest reasoning at
  high effort is worth it, because a bug that ships costs far more than
  the review. Anthropic reports Opus 5 review quality holds at lower
  effort, which makes medium a candidate for a future eval - the pin
  stays at high until that is measured.
- **Tests / verification -> haiku/low.** Running a command and
  summarizing output, or checking a diff matches its task, is mechanical.
  The cheapest tier at low effort suffices; the value is keeping raw
  output out of the main context, not the model doing it.
- **Effort tracks task shape, not tier** (levels: the ladder above). A
  strong model at low effort beats a weak model at high effort for a
  fraction of the cost. On the Opus 5 generation this is amplified:
  low/medium punch well above their weight - when a dispatch feels too
  expensive, step the EFFORT down before the tier; when a result is too
  shallow, step effort up before tier up.
- **The fable-to-opus price gap is exactly the sticker.** The documented
  ~30% token inflation is measured against models from BEFORE Opus 4.7,
  which is the generation whose tokenizer Fable 5 uses - it is not a gap
  between Fable and opus, and the model table lists the same token
  density for both. So budget the fable-to-opus gap as the sticker 2x
  rather than something wider.
  Where the inflation does bite is any comparison against a Sonnet
  4.6-era baseline: re-pricing today's token counts at yesterday's rates
  understates the difference.
- **Step effort DOWN on Fable before stepping the tier down.** The
  documented guidance for Fable is to start at `high` (the default),
  use `xhigh` only for the most capability-sensitive work, and step down
  to `medium` or `low` for routine work - lower effort on Fable still
  performs well and often exceeds `xhigh` on prior models. So effort is
  a real control on a fable session and not a rounding error: a routine
  phase left at the default pays top-tier rates for depth it did not
  need. It does not replace the tier decision - dispatching that phase
  to sonnet is cheaper still. Sweep Workflow `effort` opts the same way.
- **A refusal is a redirect, not a weak result.** Fable 5 and Opus 5
  both ship safety classifiers that can decline a request outright
  rather than answer it badly. A declined dispatch is the one failure
  the escalation ladder below does not fix: the documented remedy is
  another model family, and opus is the named destination for a declined
  fable request - a step sideways, not up. The machinery underneath
  (stop reasons, which classifier declined, fallback credit) is API-level
  and invisible from inside a dispatch, so this is the whole of the
  routing rule.

Research backing: task-type routing outperforms complexity-score routing
(RouteLLM, ICLR 2025); benchmark tier gaps confirm sonnet as the
implementation default with opus reserved for the margin cases - a margin
the Opus 5 launch widened at unchanged opus pricing, which is why the
escalation bar above sits lower than benchmarks alone would suggest.

Model names in agent pins are FAMILY aliases (opus, sonnet, haiku), not
versions - the harness resolves them to the current model of each family,
so a generation jump (Opus 4.8 -> Opus 5) upgrades reviewer and every
`model=opus` escalation automatically, with no plugin change. Verify what
actually ran with `/model-routing:stats`.

## Rules

- Trivial first: when the question is answerable from the conversation,
  general knowledge, or one obvious file already in context, answer inline.
  A subagent dispatch has a fixed overhead (system prompt, file re-reads,
  report) that dwarfs a one-liner - dispatching `scout` for "what does this
  flag mean" burns more than it saves. Dispatch only when the task needs
  real exploration, execution, or produces output worth keeping out of the
  main context.
- Never burn main-session tokens on raw test or build output. Dispatch to
  `test-runner` and consume its compact report.
- Route codebase exploration to `scout` - conclusions and file:line refs
  come back, file dumps stay in the subagent.
- For locate-only sweeps ("which files mention X") the harness's built-in
  Explore agent, when present, is cheaper than `scout`. Use `scout` when
  the answer needs verification - tracing real code paths and confirming
  file:line - not just finding candidates.
- Pick `scout`'s tier by what the question demands, not by what it costs.
  Enumerating and tracing - list these stages in order, which files import
  X, where does this chain end - is breadth, and breadth runs correctly on
  haiku: dispatch with `model=haiku` and it comes back right for about half
  the price. Working out what code actually does - does this loop retry,
  what does this function return for that input - is not breadth, and the
  cheap tier fails it in a way that looks confident. Leave the sonnet pin
  there. Both halves are measured, in `evals/`: on a twelve-stage tracing
  question haiku scored 3 of 3 and cut the session bill 9%; on a question
  whose code contains an obvious wrong answer, haiku took the bait in 1 run
  of 3 while sonnet took it in none. A wrong answer sends the main session
  back to read the files itself, which costs more than the tier ever saved.
- Batch related plan tasks per subagent. Each subagent re-reads files from
  scratch; one tiny task per agent costs more than it saves.
- Subagents cannot see the conversation. Write self-contained task
  descriptions: goal, files, constraints, verification commands.
- Repo-specific policies override this table (e.g. "unit tests only,
  never integration tests").
- Review is one cheap pass; missed bugs are expensive. When a diff is
  high-risk, escalate the final review to the main session instead of
  delegating it.
- Gate batched implementer output with `verifier` before accepting it.
  It answers one question for pennies: is this diff the task that was
  asked? Scope creep, missing pieces, and obvious breakage get caught
  before the main session builds on a wrong diff or a `reviewer` pass
  burns opus tokens on work that missed the point. Skip it when the main
  session reads the full diff anyway - the read IS the verification; a
  verifier on top would double-pay. The verifier gates ANOTHER agent's
  cheap-tier diff, never the main session's own work: a current-generation
  model self-verifies, so a subagent that re-checks what the main session
  just wrote burns tokens for no quality gain (this is what Opus 5's
  prompting guide means by "do not use subagents to verify or double-check
  your own work").
- Advise before the work, not only after it fails. The escalation rules
  below are reactive - they fire on a stuck agent or a weak result. When
  implementation work is dispatched with no approved plan behind it, the
  cheaper move is proactive: have the cheap-tier agent return its PLAN and
  check it in the main session - already the strongest model in the loop -
  before it writes code. Anthropic measures this as the advisor strategy,
  "faster, lower-cost worker models to call more intelligent models to
  check their plan and evaluate their work", and reports Sonnet 5 with a
  Fable 5 advisor within 10% of Fable 5's SWE-bench Pro score at 63% of the
  price of using Fable 5 for the whole task. One short turn beats finding
  the wrong approach in a finished diff. With a plan already approved -
  written in the main session or by a planning skill - that check has
  happened, so dispatch straight to implementation. The harness also ships this pattern as a built-in tool - see `advisorModel` under Complementary settings.
- Escalate, don't guess. When a subagent is stuck on the *approach* (not
  just missing a fact), it should package its state - what it tried, why
  each attempt failed, the candidate directions it sees - and hand it back
  for a main-session decision. A strong model advising a stuck subagent is
  cheaper than that subagent thrashing at the wrong approach. After
  deciding, continue the SAME agent (SendMessage, when the harness offers
  it) with the direction - a fresh dispatch pays the full file re-read the
  batching rule exists to avoid. When SendMessage is not available,
  re-dispatch with the packaged state (what was tried, why it failed, the
  chosen direction) so the new agent starts from the decision, not from
  zero.
- When the user re-asks the same question or calls the answer shallow,
  redo it one step up - a higher tier or higher effort - never at the
  same level that just failed.
- The escalation ladder generalizes: any failed or visibly weak subagent
  RESULT (wrong answer, broken diff, report that dodges the question)
  retries exactly one step up - next tier via the Agent `model` param, or
  the same tier at higher effort when the miss looks like shallow thinking
  rather than missing capability. One step, not a leap to the top: most
  failures clear one tier up, and jumping straight to the strongest model
  forfeits the middle tier's price. A second failure at the higher step
  means the task was mis-scoped, not under-powered - stop climbing and
  take it to the main session. Distinguish this from the stuck-on-approach
  handback above: stuck agents hand back BEFORE producing a result and
  continue via SendMessage; failed results re-dispatch fresh one tier up,
  because the failed attempt's context is part of the problem. One case
  is not on this ladder at all: a `stop_reason: "refusal"` is a
  classifier declining rather than a model falling short, and it has its
  own retry path - see the Fable caveats above.
- Against a manual override, the same pin is a FLOOR, and undercutting it is
  not a saving. The two readings do not conflict because they answer different
  questions: the ceiling asks what the session should pay, the floor asks what
  the role needs. The pin states
  how much reasoning the role needs, so `reviewer` dispatched with
  `model=haiku` is a weaker review rather than a cheaper one, and it still
  counts as "cheaper than the session" in every cost figure - which is exactly
  why it is easy to do and hard to notice. The floor is the lower of the pin
  and the session model, so capping at a cheaper session stays correct, and a
  dispatch whose session model cannot be read is left unjudged rather than
  guessed at. When
  the cheap tier genuinely fits the work, pick an agent pinned for it
  (`test-runner`, `verifier`) instead of overriding a role agent downward; the
  dispatch report lists below-pin dispatches in their own section.
- Against the session model, a pin is a ceiling. A pin says "this task never
  needs more than X"; the session model says what the user is willing to pay.
  When a pin sits above the session model, cap the dispatch at the
  session model via the Agent `model` param - on a sonnet session,
  implementer and reviewer run on sonnet. This cap is behavioral, not
  mechanical: the harness applies frontmatter pins regardless of session
  tier, so a bare dispatch of an opus-pinned agent on a sonnet session
  RUNS opus. Passing the param is what enforces the ceiling; the dispatch
  report's above-tier section shows every time it was missed.
- Unpinned agents silently inherit the session model. The bundled agents
  pin their tier in frontmatter, but general-purpose, Explore-style, and
  custom agent types have no pin - dispatched bare on a strong session,
  they run the whole errand at top-tier prices. Make the tier a conscious
  choice per dispatch: mechanical or exploratory work gets an explicit
  `model` (sonnet, haiku for trivial sweeps); staying on the session tier
  is right when the task genuinely needs that reasoning - the user picked
  a strong session model precisely so the hard dispatches could use it.
  The failure mode this rule kills is *accidental* inheritance, not
  top-tier usage.
- The same rule applies inside Workflow scripts, where it is easiest to
  forget and where the fan-out multiplies it - a 50-agent workflow with
  one forgotten `model` opt costs more than every other routing decision
  in the session combined. See **Workflows** below for the full set.
- If an entire session is one phase (pure implementation), suggest the
  user switch /model instead of delegating everything - a session on the
  right model beats a swarm of subagents.

## Workflows

Dynamic workflows are the other place routing happens: a script the
runtime executes, spawning subagents per stage. The rules below are
what changes cost there.

- **Boundary.** Workflows are for breadth - auditing many files for one
  issue, a migration across hundreds of files, cross-checking research,
  looping until a check passes. An ordinary multi-step task stays a
  dispatch chain: a workflow run can cost substantially more than
  working the same task in conversation.
- **Per-stage routing.** Every `agent()` call without `model`/`effort`
  opts inherits the session model at session effort, multiplied by the
  fan-out. Mechanical finder stages get an explicit cheap model and
  `effort: low`; a tier up only where the stage earns it. Precedence:
  the `CLAUDE_CODE_SUBAGENT_MODEL` env var overrides both the script
  opt and the session model.
- **Granularity is saved progress.** On resume, completed agents return
  cached results - but replay follows start order: caching stops at the
  first agent that did not finish, and every agent that started after it
  runs again even if it completed. Stopping mid fan-out is therefore
  expensive, and many small agents survive a pause better than one long
  one. Resume works only within the same Claude Code session - quit and
  the run starts from scratch.
- **Size guideline first.** The Dynamic workflow size setting in
  `/config` defaults to `medium` (under 15 agents) as of Claude Code
  2.1.219; older versions defaulted to `unrestricted`. Choosing a value
  (`small` <5, `medium` <15, `large` <50) targets a fan-out before a run
  starts - it is advice, not a cap, so a prompt that calls for a
  different scale still overrides it. Cheapest lever available, but pick
  the direction deliberately: actively choosing a value also moves the
  `Large workflow` warning to that agent count, so `small` warns earlier
  and `large` warns later, at 50. The warning tracks the choice, not the
  value - an untouched setting keeps the warning at 25 even though its
  value is `medium`.
- **Thresholds and limits.** A run is flagged `Large workflow` above 25
  agents or a projected 1.5M tokens; a configured size guideline
  replaces the 25-agent threshold, and ultracode sessions suppress the
  warning entirely. The runtime caps a run at 16 concurrent agents and
  1000 agents total.
- **Permissions.** Workflow subagents always run in `acceptEdits` and
  inherit the allowlist regardless of the session's permission mode -
  file edits are auto-approved. A broad allowlist therefore applies to
  every agent in the fan-out, not just the one you would have watched.

Under ultracode (not a sixth effort level but a mode: `xhigh` plus
automatic workflow planning), these rules still apply - fan-out is
already consented to, so the savings come from making each node cheap.

## Complementary settings

- `fallbackModel` in settings.json: `["opus", "sonnet"]` - the harness
  falls back down the tier ladder when the primary model is unavailable
  or its quota is exhausted. Match the context variant to the session model: a `["opus", ...]` chain falls back to the 200K-window alias, which cannot hold a session already past 200K - on an `opus[1m]` session the fallback wants `opus[1m]` too.
- `/advisor`, the `advisorModel` setting, or `--advisor`: a server-side tool that consults a stronger model at decision points - before committing to an approach, on a recurring error, before declaring a task done. Claude chooses when to call it, and the advisor receives the FULL conversation, so unlike a subagent it needs no state packaging and has no fresh-context blind spot. This is the advisor strategy above, productized. What to know before enabling it:
  - The advisor must be at least as capable as the main model. An Opus 4.7-or-later session accepts only another Opus 4.7+ (a Sonnet 5 advisor is rejected); a Sonnet session accepts Opus.
  - Fable is not currently offered as an advisor. A saved `"fable"` attaches no advisor and raises NO error - it fails silently - while `/advisor fable` and `--advisor fable` are rejected outright. A remote rollout controls when it returns.
  - Subagents inherit the configured advisor and re-run the pairing check against their own model. A sonnet `implementer` with an opus advisor is exactly the pairing the advisor strategy measures, applied automatically.
  - Cost scales with conversation length, not task size: each call re-reads the whole transcript at the advisor's rates and is never cached. It does not appear in `/model-routing:stats` - a server tool is not an Agent dispatch - so `/usage` is where it lands.
  - Anthropic API only (not Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, or Microsoft Foundry). Experimental. `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` disables it entirely.
- `/model opusplan`: built-in two-tier hybrid (Opus plans, Sonnet
  executes) - a good lazy default for sessions that do not need the
  strongest tier.
- Output-token reducers (terser-output skills like ponytail/caveman) cut
  ~15-20% on top of routing - orthogonal to tier and effort. They trim
  what the model emits; routing decides who emits it. Use together.
