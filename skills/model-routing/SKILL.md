---
name: model-routing
description: Route work to the cheapest model tier that holds quality. Use when deciding which model or agent should handle a task, when the user asks about token economy / cost optimization, or when dispatching implementation, review, or test-run work to subagents.
---

# Model Routing

The expensive model thinks, cheaper models grind. The main-session model
cannot be switched by Claude - routing works through subagent delegation
(the `model` param of the Agent tool, or the agents bundled with this
plugin).

**Routing makes a dispatch cheaper; it does not make dispatching cheap.**
A subagent starts empty, so everything it reads is a cache write, while
the main session pays cache read - 12.5x less, 25x on Opus 5.5, 50x on
Fable 5.1 and Mythos 5.1 - for context it already holds. That penalty is paid whether or not the tier is routed down, so the
rules below only pay off on work that was going to be delegated anyway.
On one wide-reading session, three runs: doing it inline cost $1.36 and
delegating with the tier routed down $1.68, both measured; delegating at
the session tier comes to $2.01, which is those same measured subagent
tokens repriced at the higher tier rather than a run of its own. Route
every dispatch - roughly a sixth off work already leaving the session -
and do not manufacture dispatches to collect it.

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

The full ladder is `low / medium / high / xhigh / max`. What runs when
nothing sets a level is Claude Code's per-model default: `high` on every
model that supports effort, except `medium` on Opus 5.5 and Sonnet 5.5
and `xhigh` on Opus 4.7. The API's own default can differ (it runs both
Opus 4.7 and Sonnet 5.5 at `high`), but a session's effort is what Claude
Code sends. Levels are saved per model under `modelSettings`, and a
top-level `effortLevel` in the user settings file no longer reaches Opus
5.5 or any model released after it, Sonnet 5.5 included - so a session
that ran Opus 5 or Sonnet 5 at a saved level starts its 5.5 successor at
`medium` until a level is chosen for that model.
Which levels exist at all is a per-model list rather than a version
cutoff, and setting a level the model does not support runs the highest
supported level at or below it. The per-model recommendation moves with the generation: Opus
4.7 and 4.8 are told to start coding and agentic work at `xhigh`, while
Opus 5 is told to start at `high`, step up to `xhigh` for demanding
coding and agentic work, and use `low` and `medium` liberally as the
primary control for token cost and response time wherever evals show
quality holds. The step down got cheaper, not the step up. Opus 5.5
moves the scale again: Anthropic reports its `medium` above Opus 5 at
`high` on coding and knowledge work, and `low` close to it on several
coding evals, while at any given level it thinks more per turn than Opus
5 did - a level carried over from Opus 5 buys more depth and costs more
tokens than it used to. `xhigh` is
also the newest level and absent on some models that support `max`
(e.g. the 4.6 generation), so check the model's own docs when in doubt -
and re-sweep effort on your own evals after a model change instead of
carrying old settings across generations. This plugin tunes for cost: pins sit at the lowest level
the task shape allows and step up on evidence (a weak result retries
one step up). That deliberate step down, wherever the task allows one,
is where the effort savings come from - measured against the level the
dispatch would otherwise inherit from the session, which is what a pin
actually replaces.

Effort is not only thinking depth - it shapes every token in the
response, tool calls included. At lower effort the model folds
operations into fewer tool calls and skips preamble, so a cheap pin
saves twice: less reasoning AND fewer round trips. Anthropic's own
example use case for `low` is subagents.

- **low** - mechanical or well-scoped work: exploration, renames, running
  tests, reading a diff for a known-shape change.
- **medium** - normal implementation: real logic, but the approach is
  already clear. It is also where Sonnet 5.5 is told to start agentic
  coding and multistep tool use on well-specified tasks, moving to
  `high` for harder or longer ones. This plugin draws its own line one
  step earlier and on the tier instead: harder work goes to opus, still
  at the pinned medium, because a dispatch has no effort param to raise.
  Sonnet 5.5's levels are recalibrated against Sonnet 5 - the same name
  buys a different amount of thinking than it did, and Anthropic does not
  say in which direction, so re-sweep rather than carry a level over.
  Note what an effort pin is measured against: the level the dispatch
  would otherwise INHERIT from the session, not the pinned model's own
  default. So `implementer` at `medium` still steps down from a session
  running `high` or above - a Fable 5.1 session at its default, say - and
  buys nothing on a session already at `medium`, which is now the Claude
  Code default for both Opus 5.5 and Sonnet 5.5 sessions. The three haiku
  agents are a separate case: Haiku 4.5 has no effort knob at all, so
  their `low` pins document intent and cost nothing either way.
- **high** - genuinely hard reasoning: architecture, subtle debugging,
  high-risk final review, anything where a wrong approach is expensive
  to unwind.
- **xhigh** - long-horizon agentic or coding work (multi-hour runs, token
  budgets in the millions) that genuinely earns the extra reasoning. In
  this plugin that is a session-level or Workflow `effort` choice, never
  an agent pin. The top two levels also change what a model does after
  the work is done: at `xhigh` and `max` Sonnet 5.5 starts its own rounds
  of review and verification and launches reviewer subagents where the
  harness offers them. Anthropic measured a system-prompt instruction
  against that - stop and report once the checks pass, no self-started
  review rounds, no reviewer subagents unless asked - cutting session
  cost by about a third at `max` with no quality change (less frequent,
  not gone). Two rules follow. Routine work belongs at `high` or below,
  where this is rare. And on a session running `xhigh` or `max`, review
  what the plan, the user or these rules asked for - `reviewer` on a
  finished diff, `verifier` on batched output - and do not open a second
  round on top of it because the level invites one. A round is the
  review, the fixes it asked for, and a check that each finding is fixed;
  that check belongs to the same round. A fresh review of the whole diff
  is a second one: open it when the fixes changed more than the findings
  called for, or when the user asks.
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
top-level effort value between requests invalidates the cached prompt
prefix, so per-agent pins and per-`agent()` opts - each with its own
context - are the cache-safe way to differ. (The API has a per-message
effort change in beta that keeps the cache, on Fable 5.1, Mythos 5.1,
Opus 5, Opus 5.5 and Sonnet 5.5; nothing documents Claude Code's
`/effort` using it, so inside a session assume the rule above holds.)

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
| Breadth sweeps: enumerate, list, trace a chain end to end | subagent | `surveyor` (haiku) | low |
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
- **Ordinary implementation -> sonnet/medium.** Sonnet 5.5 is sold as
  the best combination of speed and intelligence, and Anthropic still
  points at an Opus model for the hardest long-horizon work - which is
  the split this table has always drawn. It stays permanently priced at
  $2/$10 against Opus 5.5's $4/$20, so for work whose approach the plan
  already decided, the margin does not change the outcome and sonnet
  stays the value default. Medium effort because the agent executes, it
  does not design - and medium is where Sonnet 5.5's own guidance starts
  well-specified agentic coding.
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
  Opus 5 was a step-change over Opus 4.8 at unchanged
  price, and Opus 5.5 is stronger again at 20% less ($4/$20, cache reads
  60% less), so the opus tier buys strictly more per dollar than when
  this table was tuned - when in doubt between sonnet and opus for
  implementation, take opus. That holds on every session model, Fable
  included - see the fable-to-opus bullet below.
- **Against Opus 5.5 the tier gap closed on cache reads and stayed open
  everywhere else.** Opus 5.5 reads cache at $0.20/MTok and so does
  Sonnet 5.5 (0.05x of $4 against the standard 0.1x of $2), so the tokens
  a subagent re-reads turn by turn cost the same on either model - a
  parity Opus 5.5 already had with Sonnet 5, not something Sonnet 5.5
  introduced. What routing down still buys is half price on everything
  else: $2 against $4 for the first read of a file, $2.50 against $5 to
  cache it, $10 against $20 for output. Count the dollars, not the
  tokens: cache reads are most of the VOLUME in an agentic loop while
  writes and output usually carry most of the BILL, and the saving falls
  as that stops being true. For identical token usage it is 50% with no
  cache reads at all; the one profile measured here, the scout eval (74k
  written, 451k re-read, 6k out), costs $0.3352 on sonnet against $0.5802
  on opus, 42.2% off; at that same write-and-output mix it is about 30%
  once cache reads reach 20 times the written-plus-output tokens; and on
  a profile of 1k written, 1k out and 1M re-read it is about 5.6%, where
  there is almost nothing left for the halved rates to halve. The share of the
  bill decides, not an absolute token count. The parity is also specific to that pair: a
  Fable 5.1 session reads at $0.25 and an Opus 5 one at $0.50, so against
  those the cheaper tier still wins on every token type.
- **Review -> opus/high.** Review is one cheap pass guarding against
  expensive misses - an asymmetric bet where the strongest reasoning at
  high effort is worth it, because a bug that ships costs far more than
  the review. The case for `medium` grew with Opus 5.5: Anthropic reports
  it catches more bugs with fewer false alarms, its `medium` beats Opus 5
  at `high` on coding, and at `high` it thinks more per turn than Opus 5
  did, so the same pin now costs more. That is vendor evidence on
  model-level evals, not this plugin's review eval - the pin stays at
  high until a medium-vs-high review run on Opus 5.5 is measured.
- **Tests / verification -> haiku/low.** Running a command and
  summarizing output, or checking a diff matches its task, is mechanical.
  The cheapest tier at low effort suffices; the value is keeping raw
  output out of the main context, not the model doing it.
- **Effort tracks task shape, not tier** (levels: the ladder above). A
  strong model at low effort beats a weak model at high effort for a
  fraction of the cost. On the Opus 5 generation this is amplified:
  low/medium punch well above their weight - when a dispatch feels too
  expensive, step the EFFORT down before the tier - on a Workflow stage,
  or by choosing an agent pinned lower; when a result is too
  shallow, step effort up before tier up - on a Workflow stage, where the `effort` opt exists; a plain dispatch has only the tier.
- **The fable-to-opus price gap is exactly the sticker.** The documented
  ~30% token inflation is measured against models from BEFORE Opus 4.7,
  which is the generation whose tokenizer Fable 5 uses - it is not a gap
  between Fable and opus, and the model table lists the same token
  density for both. So budget the fable-to-opus gap as the sticker -
  2.5x on base input and output against Opus 5.5 ($10/$50 vs $4/$20).
  Cache reads no longer run the other way either: Fable 5.1 reads at
  $0.25/MTok and Opus 5.5 at $0.20, so opus is the cheaper step on every
  token type, whatever the mix. This retired a rule. On Opus 5 (cache
  reads $0.50) opus implementers dispatched from Fable 5.1 sessions
  priced at $275.55 over the author's 7 days to 2026-09-17, against
  $221.52 for the same tokens at Fable 5.1 rates, and the implementer's
  step above sonnet on those sessions was the session model. The same
  token mix on Opus 5.5 prices at about $133. `/model-routing:stats`
  still names any agent and model pair that ran below the session tier
  yet priced above it - the evidence to reopen the rule on if a later
  model moves the rates again.
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
- **A refusal is a redirect, not a weak result.** Fable 5.1, Fable 5,
  Opus 5.5, Opus 5 and Sonnet 5.5 ship safety classifiers that can
  decline a request outright rather than answer it badly - Sonnet 5.5
  included, which makes it the most common dispatch this can happen to,
  while Haiku 4.5 and Sonnet 5 carry no documented categories. A declined dispatch is the one failure the
  escalation ladder below does not fix, and a step up no longer reliably
  clears it: Opus 5.5 runs cybersecurity and biology classifiers like
  Fable 5.1's, and both it and Sonnet 5.5 add a `reasoning_extraction`
  category whose declines a fallback model does not retry at all. Which classifier
  fired is API-level and invisible from inside a dispatch, so do not
  re-dispatch a declined request on opus by reflex - hand it back to the
  main session to rephrase or drop.

Research backing: task-type routing outperforms complexity-score routing
(RouteLLM, ICLR 2025); benchmark tier gaps confirm sonnet as the
implementation default with opus reserved for the margin cases - a margin
the Opus 5 launch widened at unchanged opus pricing and Opus 5.5 widened
again at a lower one, which is why the escalation bar above sits lower
than benchmarks alone would suggest.

Model names in agent pins are FAMILY aliases (opus, sonnet, haiku), not
versions - on the Anthropic API the harness resolves them to the current
model of each family, while the cloud platforms lag (`sonnet` is Sonnet
4.6 on Claude Platform on AWS and Sonnet 4.5 on Bedrock, Google Cloud and
Foundry, where the parity figures above do not hold at all) -
so a generation jump (Opus 5 -> Opus 5.5, then Sonnet 5 -> Sonnet 5.5 on
2026-09-28) upgrades `reviewer`, every sonnet-pinned agent and every
`model=opus` escalation automatically, with no plugin change. Prices,
effort defaults and every rule derived from them do NOT follow the alias:
the stats price table, the per-model effort defaults and the cost-driven
exceptions above need a check on every launch. Verify what actually ran
with `/model-routing:stats`.

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
- Three exploration routes, told apart by what has to come back rather
  than by how the question is phrased. Unverified candidates to look at
  next ("which files mention X"): the harness's built-in Explore agent,
  dispatched with `model=haiku` - since Claude Code 2.1.198 a bare Explore
  inherits the session model, capped at opus on the Claude API, and no
  longer runs haiku on its own. A complete list or an ordering, verified
  by following the code ("every stage in order", "everything that imports
  X"): `surveyor`. A judgement about behaviour ("how does Y work", "does
  this retry"): `scout`. "Which files import X" and "which files mention
  X" look alike and are not: one is answered by grep and may be wrong at
  the edges, the other has to be right.
- Split exploration by what the question demands, not by what it costs.
  Enumerating and tracing - list these stages in order, which files import
  X, where does this chain end - is breadth, and breadth runs correctly a
  tier down: that is `surveyor` (haiku). Working out what code actually
  does - does this loop retry, what does this function return for that
  input - is not breadth, and the cheap tier fails it in a way that looks
  confident: that is `scout` (sonnet). Both halves are measured in `evals/`,
  on one generated fixture at three runs each: on a twelve-stage tracing
  question haiku answered correctly every run at a third of sonnet's price;
  on a question whose code contains an obvious wrong answer, haiku took the
  bait once in three runs while sonnet took it in none. Three runs on one
  fixture cannot pin a failure rate, and the reason to keep judgement on
  sonnet is not the rate but the asymmetry: a cheap right answer saves
  cents, while a cheap wrong one arrives looking identical and sends the
  main session back to read the files itself. That recovery was not
  measured; it does not need to be, to be worth avoiding. Reach for the
  pinned agent rather than overriding `scout` downward - the floor rule
  below is not a formality.
- Batch related plan tasks per subagent. Each subagent re-reads files from
  scratch; one tiny task per agent costs more than it saves.
- A text-only end of turn does not by itself mean the task is finished. On
  long multi-part work these models end a turn with a progress update
  rather than a tool call, and a caller that reads that as completion
  stops there. Keep the parts in a list the agent reports against - the
  task description is where it starts, the agent's Open items line is
  where it comes back - and when a turn ends with items left and no
  blocker named, send one short message naming them (SendMessage where
  the harness offers it, otherwise a fresh dispatch carrying both what is
  already done and what is left, so the new agent does not redo it). An escalation block is always a blocker named; an Open items
  entry counts as one only where it says what prevents progress, since
  "implement B, test C" is unfinished work rather than a blocker. Such a
  return is a continuation, not a weak result - continue it at the same
  tier rather than climbing one. Stop after two or three continuations
  and take it to the main session, the same place a second failure goes,
  so a run that is genuinely stuck ends instead of looping. And if
  something the agent started is still running - a background command, a
  nested agent - wait for it and feed the output back before calling the
  task done.
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
  redo it one step up - a higher tier, or higher effort where a Workflow opt can set it - never at the
  same level that just failed.
- The escalation ladder generalizes: any failed or visibly weak subagent
  RESULT (wrong answer, broken diff, report that dodges the question)
  retries exactly one step up - next tier via the Agent `model` param, or
  the same tier at higher effort when the miss looks like shallow thinking
  rather than missing capability and a Workflow opt is there to raise it. One step, not a leap to the top: most
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
  right model beats a swarm of subagents. Suggest it between phases
  rather than mid-task: a thinking block is bound to the model that
  wrote it, and the families no longer read each other's - Sonnet 5.5
  reads Sonnet 5, Opus 4.8 and Haiku 4.5 blocks but not Opus 5, Opus 5.5
  or any Fable one, and no other model reads Sonnet 5.5's. The API drops what
  the new model cannot read, unbilled and without an error, so the turns
  after a switch run without the reasoning that led to them. A dispatch
  does not have this problem: a subagent starts empty either way.

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
  the script opt wins, then a frontmatter pin, then the
  `CLAUDE_CODE_SUBAGENT_MODEL` env var, then the session model - unless
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set, which ignores the opt and
  the pin and runs the env var (or the session model if it is unset).
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
- **Time is a third knob, next to tier and effort.** Opus 5.5 pays close
  attention to elapsed time, and Anthropic's guidance for a lead agent
  delegating to subagents is to feed it one: either a budget line at the
  end of each message (`elapsed 340s / 1200s`) or, where no sensible
  budget exists, the sentence "Time matters here: do not spend time that
  can be avoided, and the earlier a correct result is obtained, the
  better." In their evaluations of small agent teams both signals made
  teams finish sooner than a single agent, with a budget keeping answer
  quality comparable. It is not a cheaper effort level in disguise:
  lowering effort cuts the work itself, while a budget mostly keeps more
  agents running in parallel. Three caveats before reaching for it. The
  clock comes from the harness, not the agent: a Workflow script or a
  hook has to append the line, and a plain Agent dispatch has nowhere to
  put one, so there only the sentence is available. The budget is
  advisory - keep your own timeout if you need a hard stop. And under
  time pressure the model searches and verifies a little less, so the
  checks stay where they were: `verifier` on batched implementer diffs,
  `reviewer` on the code, the main session on a high-risk diff. A budget
  buys pace, it does not waive any of them. The measurement behind all of
  this is on Opus 5.5; whether the same signals move a sonnet or haiku
  stage is untested here.
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
  or its quota is exhausted. On the Anthropic API Opus 4.7+ and Sonnet 5+ run a native 1M window, so the bare aliases need no `[1m]` suffix; Claude Code skips a fallback with a smaller window than the primary's during compaction, which is where a 200K entry (an Opus/Sonnet 4.6 pin, or an alias on a cloud platform that still resolves to one) silently drops out. A fallback also crosses a model boundary, so any thinking block the fallback model cannot read is dropped for the turns that run on it (see the /model rule above). Which way a pair goes is per model, not per tier - Sonnet 5.5 reads Opus 4.8's blocks, while neither Opus 5.5 nor Fable reads Sonnet 5.5's - so the requests succeed either way and the reasoning carries over only where the pair allows it.
- `/advisor`, the `advisorModel` setting, or `--advisor`: a server-side tool that consults a stronger model at decision points - before committing to an approach, on a recurring error, before declaring a task done. Claude chooses when to call it, and the advisor receives the FULL conversation, so unlike a subagent it needs no state packaging and has no fresh-context blind spot. This is the advisor strategy above, productized. What to know before enabling it:
  - The advisor must be at least as capable as the main model, and the accepted list is per model rather than per tier. An Opus 5 or Opus 5.5 session accepts Fable or Opus 5 and later (the API refuses Opus 4.7/4.8, Sonnet is rejected); an Opus 4.7/4.8 session accepts Fable, Opus 4.7+ or Sonnet 5.5; a Sonnet 5.5 session accepts Fable, Mythos, Opus 5, Opus 5.5 or Sonnet 5.5 itself, and rejects the Opus 4.7/4.8 and Sonnet 5 advisors a Sonnet 5 session still accepts; a Fable 5.1 session accepts only Fable 5.1. A saved advisor that was valid on Sonnet 5 therefore starts failing on Sonnet 5.5 with a 400 rather than quietly running without one.
  - Fable as advisor needs Fable access and, on plans that bill Fable to usage credits, the one-time consent from `/model fable`. Before that consent a saved `"fable"` sends requests without the advisor.
  - Subagents inherit the configured advisor and re-run the pairing check against their own model. A sonnet `implementer` with an opus advisor is exactly the pairing the advisor strategy measures, applied automatically.
  - Cost scales with conversation length, not task size: each call re-reads the whole transcript at the advisor's rates and is never cached. It does not appear in `/model-routing:stats` - a server tool is not an Agent dispatch - so `/usage` is where it lands.
  - Anthropic API only (not Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, or Microsoft Foundry). Experimental. `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` disables it entirely.
- `/model opusplan`: built-in two-tier hybrid (Opus plans, Sonnet
  executes) - a good lazy default for sessions that do not need the
  strongest tier.
- Output-token reducers (terser-output skills like ponytail/caveman) cut
  ~15-20% on top of routing - orthogonal to tier and effort. They trim
  what the model emits; routing decides who emits it. Use together.
