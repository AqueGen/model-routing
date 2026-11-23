# Model tiers and effort ladder

What each family is for in this routing scheme. Names are family
aliases, not versions (see
[Recommended settings](/guides/recommended-settings) on generation jumps), and
cost is anchored relative to opus - ratios drift less than list prices;
exact numbers live on
[Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing):

| Family | Cost vs opus | Role in this plugin |
| ------ | ------------ | ------------------- |
| fable | 2x (Fable 5.2, $8/$40; cache reads $0.20/MTok, the same as Opus 5.5) | Frontier reasoning. A main-session choice for all-hard-reasoning days (architecture, subtle debugging hunts) - not a dispatch target. |
| opus | 1x | The escalation tier: code review, security/money/migration/concurrency-sensitive implementation. Opus 5 made this tier a step stronger at the same price; Opus 5.5 stronger again at a lower one ($4/$20). |
| sonnet | 0.5x (permanent $2/$10) | The workhorse: ordinary implementation from an approved plan, exploration, E2E driving. Sonnet 5.5 is the best speed-intelligence combination on offer, at half of Opus 5.5 on every token type, cache reads included ($0.10 against $0.20/MTok). |
| haiku | 0.025x (Haiku 5.5, prompts up to 100K tokens; 0.125x above), 0.25x (Haiku 4.5) | Mechanical grind: test/build runs, diff sanity checks, trivial sweeps. |

Generation notes (as of the Sonnet 5.5 launch, 28 September 2026 - these rot
fastest, re-verify against Anthropic's model overview): Sonnet 5.5 keeps
Sonnet 5's $2/$10 but reads cache at 0.05x, $0.10/MTok, so it costs half
of Opus 5.5 on every token type. It
defaults to `medium` effort in Claude Code and starts well-specified
agentic coding there. Opus 5.5 is cheaper than Opus 5 ($4/$20 vs $5/$25),
defaults to `medium` too, and per Anthropic is stronger at that lower
default than Opus 5 was at `high` - which is what lowered the escalation
bar further. Sonnet 5.5 is told to start well-specified agentic coding at
medium and move to high for harder work, which is why the medium pins
survived the generation jump unchanged. Notes still true from the Opus 5
launch: per Anthropic's launch figures Opus 5 lands near the fable-class
tier on coding at half its price, which is what lowered the escalation
bar in 0.9.0; the fable-class tier is built for long-horizon frontier
work - a session-model choice, not a dispatch target.

The effort ladder - the second knob. Unset effort means Claude Code's
per-model default: `high` on every model that supports effort, except
`medium` on Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 and `xhigh` on Opus 4.7 - a recommendation is
a value you pass, and on Opus 4.7 that recommendation IS what runs when
you pass nothing; Opus 4.8 still defaults to `high`. Levels are saved
per model under `modelSettings`, and a top-level `effortLevel` in the
user settings file no longer reaches Opus 5.5 or anything released after
it, Sonnet 5.5 and Fable 5.2 included. Support
itself is an explicit list rather than a
version cutoff: Fable 5 through 5.2, Mythos 5 through 5.2, Opus 5 and Sonnet 5 with their 5.5 successors, Haiku 5.5, Opus 4.8 and Opus 4.7
take the whole ladder, Opus 4.6 and Sonnet 4.6 take everything but `xhigh`, and a
model absent from that list - Haiku 4.5 among them, still what `haiku`
resolves to on the cloud platforms - has no effort knob at all. Setting a level a model does not support runs the highest supported
level at or below it, so `xhigh` becomes `high` on Opus 4.6. The vendor
recommendation is
per-generation ([effort
reference](https://platform.claude.com/docs/en/build-with-claude/effort)):
Opus 4.7 and 4.8 start coding and agentic work at `xhigh`, while Opus 5
starts at `high`, steps up to `xhigh` for demanding coding and agentic
work, and treats `low` and `medium` as the primary cost control. Opus 5.5
moves the scale again: Anthropic reports its `medium` matching or exceeding
Opus 5 at `high` on coding and knowledge work, and at any given level it thinks
more per turn than Opus 5 did. The
pins below are this plugin's cost-first reading of that: start low,
step up on evidence.

| Effort | What it buys | Where the plugin uses it |
| ------ | ------------ | ------------------------ |
| low | Most efficient: significant token savings with some capability reduction. On the Opus 5 generation low/medium punch well above their weight. | Pins: `scout`, `test-runner` (on the cloud platforms `haiku` is Haiku 4.5, which has no effort knob, so there the haiku pins only document intent). |
| medium | Balanced: real logic whose approach is already decided, at moderate savings. On Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 this is the model's own default, so a pin at medium steps down only from a session running high or above. | Pins: `implementer`, `e2e-runner`, `surveyor`, `verifier`. Recommended session setting. |
| high | Full capability - Claude Code's per-model default except on Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 (medium) and Opus 4.7 (xhigh). Complex reasoning, subtle debugging, high-risk review. | Pins: `reviewer`, `task-reviewer`. Main-session planning. |
| xhigh | Extended capability for long-horizon agentic/coding runs (multi-hour, token budgets in the millions). | Session-level or Workflow `effort` opt only - never an agent pin. |
| max | Unconstrained token spend for frontier-grade problems; Anthropic notes diminishing returns and overthinking risk on routine work. | Not used by any pin - reach for it deliberately or not at all. |
