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

- **low** - mechanical or well-scoped work: exploration, renames, running
  tests, reading a diff for a known-shape change.
- **medium** - normal implementation and review: real logic, but the
  approach is already clear.
- **high / max** - genuinely hard reasoning: architecture, subtle
  debugging, high-risk final review, anything where a wrong approach is
  expensive to unwind.

Match effort to task difficulty, not to tier. Reserve `high`/`max` for the
few tasks that actually need it - most work is a `low`/`medium` task in
disguise. Where effort is set: the bundled agents pin theirs in frontmatter
(`effort:` field - overrides the session level for that agent); Workflow
scripts take an `effort` option per `agent()` call; any other Agent
dispatch inherits the session effort.

## Routing table

Each row carries a default effort - the second knob, tuned to the task,
not the tier. For the bundled agents the effort is pinned in their
frontmatter; the column documents it rather than asking the caller to set
it:

| Task | Where | Agent / model | Effort |
|------|-------|---------------|--------|
| Planning, brainstorming, specs, docs, architecture | main session | strongest (user's /model choice) | high |
| Codebase exploration ("where is X", "how does Y work") | subagent | `scout` (sonnet) | low |
| Implementing an approved plan/spec (ordinary: single-file, clear shape) | subagent | `implementer` (sonnet) | medium |
| Complex implementation: multi-file refactor, subtle concurrency/security | subagent | `implementer` with `model=opus` | medium-high |
| Trivial mechanical tasks: renames, boilerplate, mirrored constants | subagent | sonnet | low |
| Small interactive edits, quick fixes | main session | strongest | low-medium |
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
- **Ordinary implementation -> sonnet/medium.** On SWE-bench Verified the
  strongest tier leads sonnet by ~1-2 points (as of mid-2026: 80.8% vs
  79.6%) while costing several times more. For single-file, clear-shape work that
  margin does not change the outcome, so sonnet is the value default.
  Medium effort because the approach is already decided by the plan - the
  agent executes, it does not design.
- **Complex implementation -> opus/medium-high.** Multi-file refactors,
  concurrency, and security changes are exactly the cases where the 1-2
  point SWE-bench gap becomes a wrong-approach-is-expensive gap. Here the
  stronger tier's reasoning pays for itself; spend it deliberately, not by
  default.
- **Review -> opus/high.** Review is one cheap pass guarding against
  expensive misses - an asymmetric bet where the strongest reasoning at
  high effort is worth it, because a bug that ships costs far more than
  the review. This is the one place to prefer the top tier by default.
- **Tests / verification -> haiku/low.** Running a command and
  summarizing output, or checking a diff matches its task, is mechanical.
  The cheapest tier at low effort suffices; the value is keeping raw
  output out of the main context, not the model doing it.
- **Effort tracks task shape, not tier.** Low when the work is mechanical
  or the shape is known; medium when there is real logic but the approach
  is clear; high/max only when a wrong approach is expensive to unwind
  (architecture, subtle debugging, high-risk review). A strong model at
  low effort beats a weak model at high effort for a fraction of the cost,
  so effort is a real cost lever, not a formality.

Research backing: task-type routing outperforms complexity-score routing
(RouteLLM, ICLR 2025); SWE-bench Verified tier gaps confirm sonnet as the
implementation default with opus reserved for the margin cases.

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
  verifier on top would double-pay.
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
  because the failed attempt's context is part of the problem.
- Agent pins are ceilings, not floors. A pin says "this task never needs
  more than X"; the session model says what the user is willing to pay.
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
  forget: every `agent()` call without explicit `model`/`effort` opts
  inherits the session model at session effort, multiplied by the fan-out.
  Set both per call - finder/mechanical stages cheap and low, verify/judge
  stages a tier up only when the stage earns it. A 50-agent workflow with
  one forgotten `model` opt costs more than every other routing decision
  in the session combined.
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
- Output-token reducers (terser-output skills like ponytail/caveman) cut
  ~15-20% on top of routing - orthogonal to tier and effort. They trim
  what the model emits; routing decides who emits it. Use together.
