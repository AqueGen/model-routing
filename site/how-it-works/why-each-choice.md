# Why each choice

Every model and effort assignment follows from where a tier actually
earns its cost (the knobs themselves:
[Model tiers and effort ladder](/how-it-works/model-tiers)):

| Situation | Model | Effort | Why this model | Why this effort |
| --------- | ----- | ------ | -------------- | --------------- |
| Exploration (`scout`) | sonnet | low | Finding and tracing code is retrieval, not reasoning - a cheap tier reports as well as a costly one, and the file volume stays in the subagent regardless. | The work is mechanical lookup; extra thinking buys nothing. |
| Ordinary implementation (`implementer`) | sonnet | medium | Sonnet 5.5 pairs speed with intelligence at half the opus price ($2/$10 against $4/$20) - for work whose approach the plan already decided, the margin never changes the outcome. | The plan already decided the approach; the agent executes real logic, not design, and medium is where Sonnet 5.5's own guidance starts well-specified agentic coding. |
| Risky implementation (`implementer` `model=opus`) | opus | medium (pinned) | Security, money, data migrations or concurrency, or a retry after a weak sonnet result - a wrong approach is expensive there. Multi-file work alone stays on sonnet: on `evals/implementer-multi-file` it cost 53% less than opus with every hidden test passing, and Opus 5.5 is stronger again at 20% less than Opus 5 ($4/$20, cache reads 60% less). This holds on every session model, Fable included: Opus 5.5 costs half of Fable 5.2 on input, cache writes and output, and the same on cache reads ($0.20/MTok). (Ambiguous tasks are not an escalation case: implementer stops on ambiguity by contract - clarify first.) | `model=opus` alone changes the model, not the pinned medium; an `effort` param on the dispatch raises it. |
| Code review (`reviewer`) | opus | high | Review is an asymmetric bet - one pass guards against a bug that costs far more if it ships, so it is the one place to prefer the top tier by default. | High. Opus 5.5 at `medium` matches or exceeds Opus 5 at `high` on coding (vendor evidence), but on `evals/reviewer-seeded-bugs` medium and high both found 12/12 seeded bugs and medium was not cheaper (warm mean $0.159 against $0.150); the case is saturated, so the pin stays high. |
| Per-task review in a plan loop (`task-reviewer`) | sonnet | high | Superpowers SDD scales the model of its per-task reviews and scoped re-reviews to the diff, with a mid-tier floor; a sonnet-pinned agent takes those seats instead of `reviewer` with `model=sonnet`, which undercuts its pin. Final, whole-branch, high-risk and pre-PR review stays on `reviewer`. | High: same correctness job as `reviewer`, on a smaller diff. |
| Tests / builds (`test-runner`) | haiku | low | Running a command and summarizing output is mechanical; the value is keeping raw logs out of the main context, not the model doing it. | Low: no reasoning, just report. |
| Diff sanity gate (`verifier`) | haiku | medium | Checking a diff matches its task (scope, completeness, obvious breakage) is a cheap spot-check, not a quality judgment. | Medium: completeness is the job, and at `low` Haiku 5.5 "is more likely to skip a search, stop early, or skip a check". |
| E2E / failure interpretation (`e2e-runner`) | sonnet | medium | Driving a browser and telling a product bug from a flake needs some judgment, but not top-tier reasoning. | Medium: real interpretation, clear method. |
| Planning, architecture (and a high-risk review, if you ask the main session for it) | main session (strongest) | high | These set the direction everything else follows - the one place raw capability changes the outcome most. | High: a wrong call here is the most expensive kind to unwind. |

The 0.10.0 report caps follow the same accounting. [Anthropic's own
context-engineering
guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
describes the shape a subagent should have: it may spend tens of
thousands of tokens exploring and return a distilled summary of
roughly 1,000-2,000 tokens. The caps (test-runner PASS <= 5
lines, scout <= 15, e2e step log <= 20) are that principle applied to a
success path - failures are never truncated, because a failure IS the
high-signal content.

Research backing: task-type routing beats complexity-score routing
([RouteLLM, ICLR 2025](https://arxiv.org/pdf/2406.18665)); the
sonnet-vs-opus tier gap on benchmarks such as
[SWE-bench Verified](https://www.swebench.com) is what makes sonnet
the implementation default with opus reserved for the margin cases; the
dispatch report's tier-leak count is descriptive, not a verdict - it says
how many bare dispatches could have inherited a strong session model, and
leaves the judgment call to the reader. Benchmark numbers are a
snapshot (last reviewed July 2026, at the
[Opus 5 launch](https://www.anthropic.com/news/claude-opus-5)) and shift
with every release; the principle - a small tier gap on ordinary work, a
decisive one on hard work - has held across generations, with one
refinement per generation: when a new top-of-family ships at unchanged
price (Opus 5 did), the escalation bar drops, not the default tier.

The overall shape - one strong orchestrator delegating scoped tasks to
cheaper workers and consuming their compact reports - is the
orchestrator-workers pattern from Anthropic's
[Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents),
implemented on Claude Code's native
[subagents](https://code.claude.com/docs/en/sub-agents) (frontmatter
`model`/`effort` pins, per-dispatch `model` override) rather than any
external machinery.
