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
| Implementing an approved plan/spec | subagent | `implementer` (opus) | medium |
| Trivial mechanical tasks: renames, boilerplate, mirrored constants | subagent | sonnet | low |
| Small interactive edits, quick fixes | main session | strongest | low-medium |
| Code review of implemented work | subagent | `reviewer` (opus) | high |
| Final review of high-risk or large diffs | main session | strongest | high |
| Run tests/builds/linters, report failures | subagent | `test-runner` (haiku) | low |
| Playwright/E2E scenarios, failure interpretation | subagent | `e2e-runner` (sonnet) | medium |
| Fresh external context, knowledge-cutoff gap (new APIs, recent releases) | subagent | mid-tier agent with web access | medium |

Main-session rows: the effort there is the user's session setting - Claude
cannot change it mid-session, only suggest.

## Rules

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
- Escalate, don't guess. When a subagent is stuck on the *approach* (not
  just missing a fact), it should package its state - what it tried, why
  each attempt failed, the candidate directions it sees - and hand it back
  for a main-session decision. A strong model advising a stuck subagent is
  cheaper than that subagent thrashing at the wrong approach. After
  deciding, continue the SAME agent (SendMessage) with the direction - a
  fresh dispatch pays the full file re-read the batching rule exists to
  avoid.
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
  implementer and reviewer run on sonnet.
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
