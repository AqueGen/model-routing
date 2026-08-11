# Changelog

## [0.14.0](https://github.com/AqueGen/model-routing/compare/v0.13.2...v0.14.0) (2026-08-11)

Makes the report answer three things it could not answer before - what effort ran, what the volume would have cost in dollars, and which dispatches went below their own agent's pin - then stops it scoring the cases it cannot judge. No pin or routing-rule changes: what the plugin asks a session to do is unchanged, what it can tell you about the result is not.

### Features

* **Effort is reported**, the second knob a tier-only report cannot show ([#25](https://github.com/AqueGen/model-routing/issues/25), [634a32a](https://github.com/AqueGen/model-routing/commit/634a32aab27cec07810193e8c7e64c2a26a46739)). Reconstructed from the documented precedence - `CLAUDE_CODE_EFFORT_LEVEL`, then the `effortLevel` settings cascade, then the model default - clamped to what the session model actually supports, and tagged with which of the three sources it came from. The four states it cannot see are printed beside it rather than left implied: a mid-session `/effort`, ultracode, an organization cap, and the model-default hold some models apply on first run. The same change stopped losing large sessions from the routed-down math: the session model was read from a 256KB head window, so a multi-megabyte transcript naming its model past that point counted as unknown. 123.1M tokens came back, with the headline share unchanged.
* **The volume is priced in dollars** ([#26](https://github.com/AqueGen/model-routing/issues/26), [c00d736](https://github.com/AqueGen/model-routing/commit/c00d73656ac1fba40006a221e15d152228b634f3)). What ran, what it would have cost had every subagent inherited the session model, and the difference - computed per token type, because cache reads bill at a tenth of input and a flat multiply overstates the total several times over. It is a counterfactual, not a bill, and says so: on a subscription you pay none of it, both documented biases point downward, and the price table carries the date it was transcribed.
* **Below-pin dispatches get their own section** ([#27](https://github.com/AqueGen/model-routing/issues/27), [2b9b433](https://github.com/AqueGen/model-routing/commit/2b9b433baa3bdeb66d618555d8315c0d5ddafdc3)). A pin is a ceiling, but it is also a floor: pushing an agent below the tier its own file names - a reviewer onto sonnet, an implementer onto haiku - was counted as a routing win, since it did run cheaper than the session. The report now names it, judging against the lower of the pin and the session so a cheap session is never blamed for a cap it required.
* **A version notice on session start** ([d6affc2](https://github.com/AqueGen/model-routing/commit/d6affc2e5949c2de5a49a61bc5a91569d660df1c)). Marketplace installs never update themselves, so the plugin checks at most once a day and says when you are behind.

### Bug Fixes

* **The version notice reaches the user**, not Claude ([#28](https://github.com/AqueGen/model-routing/issues/28), [4ab07f5](https://github.com/AqueGen/model-routing/commit/4ab07f5ba748671d5bc46c621051da027f5ff7ad)). It was written to plain stdout, which `SessionStart` adds to the model's context rather than showing anyone - and the model can neither run the update nor be relied on to pass the message along, so the notice shipped in this same release was reaching nobody. It now goes through `systemMessage`, the only output field documented as user-visible. The advice was incomplete too: nothing refreshes the marketplace catalog on its own, so `claude plugin update` alone can reinstall the version already sitting in a stale catalog. Both commands are named in the order they have to run, plus a link to the release notes.
* **Unknown is no longer scored as fine** ([#29](https://github.com/AqueGen/model-routing/issues/29), [6565dfe](https://github.com/AqueGen/model-routing/commit/6565dfe455565d31d73b5ec8a37b6f3fefadc591)). Four measurements flattered themselves the same way. Tier leaks ranked an unrecognized session family as the cheapest tier there is, so a bare dispatch on a future top-tier model came out clean, and session-less entries padded the denominator where they could never be anything else - three such dispatches printed "0 of 3 (0%)", a clean bill of health over a population nothing can judge. The by-session row counted models instead of agents, so one agent that fell back mid-run reported as two, more agents than transcripts on disk. A mixed row counted out of the raw total while the headline above it counted out of the judged entries. Unpriced volume blamed the agent's model when the session's was the unpriceable one, contradicting the line directly above it. Also `mythos-5` had a price and a tier but no effort row, and two pieces of dead code went: an unreachable tier comparison and a counter nobody read.

## 0.13.2 - 2026-08-02

Says what the token charts can and cannot be credited with. Docs only - no pin, config, hook, or stats changes.

- **The "without routing" bar is labelled an upper bound rather than a measurement.** It assumes every subagent would otherwise inherit the session model, which is the documented default only for an UNPINNED agent. Other installed plugins ship their own pinned agents and Claude Code's built-in `Explore` picks its own tier, so some of that volume would have run cheaply with this plugin uninstalled. How much was never measured, and the README now says so instead of implying the whole bar is the saving.
- **Added an attribution table over the same week.** Of 199 routed-down dispatches: 68 came from agent frontmatter pins this plugin ships, which fire automatically whether or not any rule is followed; 127 came from an explicit `model=` on the dispatch, which is the routing rules being applied and is enforced by nothing; 4 came from the built-in `Explore` agent and are not this plugin at all. The automatic half is fully attributable, the behavioural half is not, and the difference is now visible.
- Stated the obvious limit plainly: this is the author's own workload, measured with the author's own tool, with no before-install baseline and no control group.
- Recorded that `CLAUDE_CODE_SUBAGENT_MODEL` was unset in the window - a global subagent override would have produced routed-down volume with no routing decision behind it, and the report annotates rows with `env=` when it is set, so its absence is evidence rather than an assumption.

## 0.13.1 - 2026-08-02

Re-measures the README token section on 0.13.0 so every figure in it comes from one run, and corrects a claim the new measurement made false. Docs only - no pin, config, hook, or stats changes.

- **Every number in the token section now comes from a single measurement.** The previous draft quoted 1.79B of subagent volume in one paragraph and 283.7M two lines later. Both were true - the first across all sessions, the second scoped to fable-default ones - and a reader had no way to reconcile them. The section now opens with a two-column table, all sessions against fable-default sessions, with main-session and subagent volume on separate rows, and every later figure states which column it belongs to.
- **Corrected a claim the re-measurement falsified.** The fable slice grew from 0.7M to 2.1M, and the growth is a `model=fable` reviewer dispatched deliberately above the session tier - to review 0.13.0 itself. The old text called that slice "the honest remainder" of accidental inheritance, which is now wrong about most of it. It says so instead, and points at the above-tier reporting added in 0.8.0 as the reason a deliberate top-tier dispatch shows up as a decision rather than hiding among at-tier work.
- The scoped headline is 99%, not the 100% quoted before: a fable subagent in a fable session is at tier, not below it, so the deliberate review moved the figure. Left as measured rather than re-scoped to keep the round number.
- Snapshot attribution corrected to v0.13.0; the previous line still credited v0.12.0, which could not have produced the main-session figures beside it.

## 0.13.0 - 2026-08-02

`tokens` now prints the denominator its percentage is measured against. The routed-down share was true and easy to over-read, including by the author, which is the failure this release exists to close.

- **Main-session volume is reported next to the routed-down share.** `tokens` walked `agent-*.jsonl` only, so it described subagent work exclusively. That is the right subject - the main session model is fixed for the turn and no routing decision can move it - but printing "283.1M of 283.7M (100%) processed on a cheaper model" with nothing beside it reads as "almost everything was optimized". In the author's own window main sessions were 6.82B against 1.79B of subagent volume, so routing governed 21% of what was actually spent. The report now says so, with a per-model split of the main-session side.
- **A `--session` filter no longer shows its share alone.** Scoping to fable-default sessions reported 100% routed down; unfiltered across the same week it was 33%, because opus-default sessions have little room to route down at all. Both are honest, and the filtered figure was the one on the README. The unfiltered share is now printed directly beneath the scoped one, with the reason they differ.
- Populations are separated by an explicit test rather than a negative one: a bare `<session-id>.jsonl` at a project root is a main session, a transcript whose name begins with `agent-` is subagent work, and a non-agent file under `subagents/` is neither. A stray sidecar there would otherwise inflate the denominator it is being measured against.
- The empty case improved too: with main-session volume present but no dispatches, the report says how much the session spent undelegated instead of only "no subagent transcripts found".
- Per-file usage summation was extracted into one helper now that both populations need it, so per-line model attribution and timestamp-vs-mtime windowing cannot drift between them.
- **The main-session test is positive, not negative** - exactly depth 1, `projects/<proj>/<session-id>.jsonl`. The first cut asked "not an agent transcript and not under `subagents/`", which the walk applies down to depth 6, so any sidecar the harness writes beside a transcript would have enrolled as a whole session. Since that sidecar's volume lands in the denominator, the error would have pushed the routed-down share UP - the same direction of flattery this release removes.
- **An unreadable transcript is reported, not swallowed.** `tokens` previously read only agent transcripts, which are small; main-session transcripts run to hundreds of MB, and `readFileSync` as a string throws past V8's ~512MB limit. That now fails the single file instead of the whole command, and the count is printed, because a silently dropped session understates the denominator and again biases the share upward.
- The empty-window note says "no subagent volume counted against them" rather than "none of it delegated": agent transcripts can exist and still contribute nothing to a window, e.g. a resumed transcript whose lines predate an `--ago` range.
- Tests 27 -> 32: the denominator line, the unfiltered-beside-scoped line, a non-agent file under `subagents/`, a sidecar beside `subagents/` (the depth case above), and `--session` scoping the denominator as well as the headline. Measured at ~2s over 83 sessions and 8.63B tokens, so the extra read stays comfortable for an on-demand command.
- README: the token section now opens with its own scope - subagent volume only, main session excluded and why - and states the unfiltered share next to the scoped one.
- The first three findings above came from an adversarial review of this diff run on Fable; the arithmetic of the new accumulators was checked and confirmed correct in the same pass.

## 0.12.1 - 2026-08-02

Refreshed token snapshot, a fix to how release notes are extracted, and a readability pass over every past changelog entry. Docs and CI only - no pin, config, hook, or stats changes.

- **README token snapshot refreshed to 2026-08-02 / v0.12.0**, replacing the 2026-07-20 / v0.8.1 figures. 98% of dispatches (82 of 84) and 283.1M of 283.7M tokens ran below the session tier, over a window roughly 1.7x larger than the previous one.
- The refresh has a story worth reading, not just newer numbers: the inherited-session-tier slice fell from 21.4M of 166.8M to 0.7M of 283.7M. That slice was the accidental-inheritance case the previous snapshot flagged, 0.7.2 added the Workflow routing rule in response to that exact measurement, and this window is the evidence it worked. Tier leaks now sit at 1 of 11 unpinned dispatches (9%), under the 20% rework threshold the report warns at.
- **Release-notes extraction anchored on the exact version header.** The workflow matched the version as a substring of any `## ` line, which is fragile - a short version can match inside an unrelated header - and it relied on the next header resetting a flag rather than stopping. It now matches `^## <version>` with a delimiter and exits at the following `## `, so one release's notes can never bleed into another's.
- **Every past changelog entry rewritten for readability.** Two problems: entries were hard-wrapped at ~72 columns for no reason (Markdown reflows anyway, and the wrapping only made diffs and edits noisy), and many entries opened straight into a bullet with no summary line, so the rendered GitHub release read as though it had been cut off. Every version now leads with one sentence saying what the release is, and no line is wrapped by hand. Substance is unchanged - nothing was padded to look longer, and the genuinely small releases stayed small.
- All 35 published release bodies were re-pushed from the rewritten entries, so the GitHub releases and the file agree.

## 0.12.0 - 2026-08-02

Adds the advisor pattern: a plan check before implementation, for the case where no plan exists yet. Docs only - no pin, config, hook, or stats changes.

- **Plan check before implementation, when no plan exists yet.** Every escalation rule in the skill was reactive - a stuck agent hands back, a weak result retries one step up. This adds the proactive counterpart: when implementation work is dispatched with no approved plan behind it, the cheap-tier agent returns its PLAN first and the main session checks it before any code is written.
- Source and measurement: Anthropic's model-selection guidance names this the advisor strategy - "faster, lower-cost worker models to call more intelligent models to check their plan and evaluate their work" - and reports Sonnet 5 with a Fable 5 advisor within 10% of Fable 5's SWE-bench Pro score at 63% of the price of using Fable 5 for the whole task.
- Costs one short turn and adds no new agent. In this plugin's shape the main session already IS the advisor, so the pattern reuses the loop that is already there instead of introducing a seventh bundled agent.
- Written as a condition, not a rule-plus-exemption: it fires when there is no approved plan and is silent when there is one. That form holds for a setup where this plugin is the only thing installed as well as one with a planning workflow in front of it, and it leaves no exemption clause for a model to negotiate with under pressure.
- Skill: new bullet placed ahead of the escalation rules, which are now named reactive so the two read as a pair rather than as competing advice.
- Routing anchor: one line, so the pattern is present in every session rather than only when the skill is explicitly invoked. The anchor is the surface that actually changes behaviour here; the skill entry documents it for anyone reading the plugin.
- Audited the rest of the plugin for assumptions about an external planning workflow and found none: planning is already routed to the main session, the verifier and reviewer agents ship with the plugin, and the SendMessage-unavailable path was already handled.

## 0.11.1 - 2026-08-01

Scopes the `verifier` gate so the routing cannot be read as contradicting Opus 5's guidance on self-verification. Docs only - no pin, config, hook, or stats changes.

- **Scoped the `verifier` gate explicitly**: the verifier gates ANOTHER agent's cheap-tier diff, never the main session's own work.
- Rationale: a current-generation model self-verifies, so spawning a subagent to re-check what the main session just wrote burns tokens for no quality gain - which is exactly what Opus 5's prompting guide means by "do not use subagents to verify or double-check your own work".
- Skill: the batched-output verifier bullet now carries that scope and the citation, alongside the existing "skip it when the main session reads the full diff anyway" exemption, so both ways of double-paying are named in one place.
- Routing anchor: the one-line verifier rule gained the same scope, so the distinction is present in every session rather than only on skill invoke.
- The cheap-tier gate itself is unchanged - gating another agent's diff was always the intent and stays recommended.

## 0.11.0 - 2026-07-30

Effort accuracy fix plus a Workflows chapter. Docs only - no pin, config, hook, or stats changes.

- **Corrected a stale claim**: the skill and README stated that Anthropic's quality-first guidance for Opus-class models starts coding and agentic work at `xhigh`. That is the Opus 4.7/4.8 recommendation. Opus 5 is told to start at `high`, step up to `xhigh` for demanding coding and agentic work, and use `low`/`medium` liberally as the primary cost control - the generation this plugin has targeted since 0.9.0. The text now names which generation each recommendation belongs to and says to re-sweep effort after a model change.
- Effort is documented as shaping all response tokens, tool calls included: at lower effort the model makes fewer tool calls, so a cheap pin saves twice. `low`'s own documented use case is subagents.
- Sonnet 5 at `medium` is comparable to Sonnet 4.6 at `high` - stated next to the sonnet/medium pins, which that comparison justifies.
- Prompt-cache caveat: changing effort between requests invalidates the cached prefix, so effort should vary across workloads (per-agent pins, per-`agent()` opts) rather than inside one conversation.
- New `## Workflows` chapter in the skill: the breadth-vs-chain boundary, per-stage routing with `CLAUDE_CODE_SUBAGENT_MODEL` precedence, granularity as saved progress on resume, the `/config` size guideline (default `medium` since Claude Code 2.1.219), the 25-agent / 1.5M-token warning and the 16-concurrent / 1000-total runtime caps, and the `acceptEdits` permission note for workflow subagents. The `## Rules` bullet that restated part of this is now a pointer at the chapter.
- README: workflow cost settings and the ultracode stance in Recommended settings; the 0.10.0 report caps now cite the 1,000-2,000 token subagent-summary shape; the old "Workflow use" section is renamed "Superpowers flow" so the word "workflow" means one thing.
- SKILL.md grew 2377 -> 2973 words. Deliberate: the skill is charged per invoke, and the routing anchor - charged every session - was not touched.

## 0.10.0 - 2026-07-25

Token diet: the plugin's own overhead cut with zero rule loss, plus success-path report caps. Budgets were soft and meaning won every conflict - the numbers below are what non-debatable cuts yielded.

| Surface | Words before | after | Paid when |
| ------- | ------------ | ----- | --------- |
| routing anchor | 501 | 428 | every session start + every compact |
| agent descriptions (6) | 278 | 173 | every session (agent list) |
| agent files (6, incl. bodies) | 1870 | 1674 | per dispatch |
| SKILL.md | 2445 | 2377 | on skill invoke |

- Report caps, success-path only (failures always full): test-runner PASS <= 5 lines, verifier terse one-line reasons (a FAIL lists every real one), scout <= 15 lines, e2e-runner step log <= 20 lines.
- implementer's stale SWE-bench point-gap claim removed from its body (the 0.9.0 dated-framing pass missed it).
- All 15 anchor directives, every agent boundary and anti-misuse clause, and every skill rule survived - the PR carries the rule-survival matrix. No pin, config, or stats changes.

## 0.9.1 - 2026-07-25

Effort-model correctness pass, verified against the official effort documentation. Docs only, no pin changes.

- Removed the invented `medium-high` / `low-medium` effort levels; the documented ladder is now the real one: low, medium, high, xhigh, max.
- Documented actual dispatch behavior: `implementer` with `model=opus` changes the model only - the Agent tool has no effort param, so the agent's pinned medium effort still applies.
- Separated Claude's product default (unset effort = high; Anthropic's quality-first guidance starts Opus-class coding work at xhigh) from this plugin's cost-first recommendations - a medium session and below-default pins are a deliberate step down, not "the default".
- Sonnet-to-opus escalation criteria made concrete: multi-file or cross-layer work, security/money/migrations/concurrency/protocols/public contracts, retry after a weak sonnet result, hard E2E/visual interpretation. Ambiguity is explicitly NOT a trigger - implementer rejects ambiguous tasks by contract, so an unclear task or root cause is clarified in the main session (or scouted) first (Codex review finding).
- Default-high and xhigh availability qualified as model-dependent - xhigh is absent on some models that support max (e.g. the 4.6 generation) - instead of stated as universal (Codex review finding).
- README gained a "Model tiers and effort ladder" section: per-family roles with relative cost anchors and all five effort levels with where each is used.
- Dropped the unmeasured "max/xhigh buys little for review" claim. Reviewer stays opus/high; medium is noted as a future eval candidate, the pin does not move until measured.

## 0.9.0 - 2026-07-24

Opus 5 research pass. No pin changes - and that is the point: pins name model FAMILIES, so reviewer and every `model=opus` escalation already resolve to Opus 5 automatically, and the tier ladder in the dispatch counter already ranks it (family regex). What changed is the guidance.

- Escalation bar lowered: Opus 5 is a step-change over Opus 4.8 at UNCHANGED price ($5/$25), so "when in doubt between sonnet and opus for implementation, take opus" replaces the old strictly-marginal framing. Sonnet stays the ordinary-implementation default (near-opus on clear-shape coding; intro pricing ~2.5x cheaper through 2026-08-31).
- Effort guidance: on the Opus 5 generation low/medium punch above their weight - step EFFORT down before stepping tier down when a dispatch feels expensive, effort up before tier up when a result is shallow. Reviewer stays opus/high (Opus 5 review is precise AND high-recall and stays accurate at lower effort; max/xhigh buys little).
- Stale benchmark snapshot (mid-2026 SWE-bench point-gap numbers) replaced with dated Opus-5-launch framing; family-alias auto-upgrade documented in README and skill.
- Opus 5 sessions delegate to subagents more readily - README notes the conscious-tier rule and tier-leak line matter more, not less.

## 0.8.2 - 2026-07-20

README charts re-dated as a versioned snapshot, because 0.8.1 changed how the numbers are computed. Docs only.

- README charts are now a dated, versioned snapshot ("2026-07-20, measured with v0.8.1") instead of implicitly-current figures: a rolling 7d window moves daily and 0.8.1 changed how the numbers are computed (per-line attribution, comparable-only denominators), so the old values no longer matched what the tool prints. Values refreshed from the current run and the commands to re-measure are named in the text.

## 0.8.1 - 2026-07-18

Second-pass review follow-ups (external Codex re-review of 0.8.0: six prior findings confirmed fixed, four residual items - all four addressed).

- Unknown SESSION family excludes the entry/volume from routed-down math, same as an unknown agent model - a sonnet dispatch from a future `claude-zephyr-*` session is no longer guessed routed-down by the heuristic (dispatch report) or counted comparable (tokens). Labels broadened from "unrecognized models" to "not tier-comparable".
- Historical `--ago` windows no longer lose resumed transcripts: the file mtime is only a lower-bound early skip; timestamped lines decide their own window membership, and untimestamped lines count only when the mtime itself is in-window.
- `CLAUDE_CODE_SUBAGENT_MODEL` is recorded by the hook (`env` field) and outranks both the model param and the frontmatter pin in effective-model resolution - a global override no longer silently miscounts every dispatch against the pin table; report rows show `(env=<model>)`.
- implementer's escalation text aligned with the conditional SendMessage wording (harness may not offer it; packaged-state re-dispatch fallback).
- Review round 2 on the PR itself: the comparable-only denominator now also holds inside the per-session breakdowns (dispatch "By session model" rows and the tokens session rows show "not comparable" instead of a fake 0%), and an env-overridden bare dispatch no longer counts as a tier leak (it did not inherit the session model).
- Tests 22 -> 26: unknown session family (dispatch + tokens, including the per-session rows), resumed transcript in an --ago window, env-override capture, precedence, and leak exemption.

## 0.8.0 - 2026-07-18

Honesty release, driven by an external (Codex) review: several soft routing rules were described as if they were technical guarantees, and three stats blind spots could misattribute work. All six findings addressed.

- Session model at dispatch time: the hook now records the LAST model named in the session transcript (bounded tail read), so `/model` switches, opusplan plan->execute handoffs, and quota fallbacks judge each dispatch against the model actually in effect - not the session's first model. The tokens report still samples the session START model (per-dispatch linkage does not exist in transcripts) and now says so in its footer.
- Above-tier visibility: a new per-entry verdict (down/at/up/unknown) surfaces uncapped pins - a bare opus-pinned dispatch from a sonnet session now lands in a dedicated "Ran ABOVE the session tier" section with a headline callout, instead of hiding among deliberate at-tier work. Pins-are-ceilings wording in README/skill/anchor now states plainly that the cap is behavioral (the `model` param enforces it, the pin alone does not).
- Unknown tiers leave the denominator: routed-down percentages are now over comparable entries/volume only, with unrecognized-model counts reported separately - one exotic model no longer drags the share down.
- Per-line token attribution: usage accumulates onto the model named on each transcript line (a mid-run fallback splits the volume instead of crediting the last model seen), and lines carrying timestamps are windowed individually - a resumed old transcript with a fresh mtime no longer leaks stale volume into the window.
- Read-only hardening: reviewer, verifier and test-runner now block `Edit`/`Write`/`NotebookEdit` via `disallowedTools` (scout already did). README states the honest boundary: Bash/MCP remain available and are governed by prompt rules, not a sandbox; scout keeps its denylist so code-graph MCP servers stay usable.
- SendMessage continuation is conditional: "continue the same agent" applies when the harness offers SendMessage; otherwise re-dispatch with the packaged state. Requirements section notes neither path is a hard dependency.
- Tests 19 -> 22: above-tier section, last-model sampling, per-line attribution + timestamp windowing, comparable-denominator headline.

## 0.7.6 - 2026-07-18

README attribution pass - the sources behind the plugin's numbers and its design are now named. Docs only.

- README sources completed: SWE-bench Verified now links to the leaderboard the numbers are read from; new paragraph credits the orchestrator-workers pattern (Anthropic, "Building Effective Agents") and the native Claude Code subagents mechanism the plugin builds on. RouteLLM and the Augment rework-threshold guide were already linked.

## 0.7.5 - 2026-07-18

README visuals re-measured on fable-default sessions only, where the routing story is not diluted by mixed session tiers. Docs only.

- README visuals rebased onto fable-default sessions only (via the new `--session fable` filter): the mixed-tier window understated routing on the normal setup. Fable-only, 7d: 100% of dispatches and 89% of volume below the session tier; the remaining fable slice is explicitly labeled as the accidental-inheritance case the 0.7.2 Workflow rule targets.

## 0.7.4 - 2026-07-18

New `--session <family>` filter on the stats commands, so a mixed-tier window can be read one session tier at a time.

- `--session <family>` flag on stats/report/tokens: scope the numbers to sessions whose model matches (e.g. `--session fable`). A fallbackModel ladder or manual /model switches mix session tiers inside one window; the filter answers "how does routing do on my normal setup" - live data: fable-only sessions show 100% dispatches routed down vs 78% across the mixed window. Entries with no recorded session are excluded when the filter is active.

## 0.7.3 - 2026-07-18

README gains measured token visuals - real numbers from the plugin's own stats, no invented dollar figures. Docs only.

- README "What that looks like in tokens": three GitHub-native mermaid visuals - without-vs-with bar of volume billed at the session tier, measured per-model pie of where subagent volume actually ran (7d live snapshot, dated), and a task->tier flowchart. Real measured numbers, no invented dollars; the deliberate opus slice is called out as a decision, not a leak.

## 0.7.2 - 2026-07-18

CI enforcement for the pin table, a Workflow-dispatch routing rule, and the override paths documented in place of a config subsystem.

- CI runs the counter smoke tests (`node --test`) on every push/PR - the PINNED_MODELS-vs-frontmatter sync test now enforces in CI, so a pin change that forgets the stats table fails the build instead of rotting silently until the next audit.
- Workflow-dispatch routing rule in the skill and session anchor: every Workflow `agent()` call without explicit `model`/`effort` opts inherits the session model at session effort, multiplied by the fan-out - the costliest place to forget the conscious-tier rule. Observed live: a 77-agent review workflow ran 10% of its volume on the session tier through exactly this omission.
- README "Overriding pins": the three existing override paths (per-dispatch `model` param, frontmatter edits guarded by the CI sync test, git-checkout reset) documented in place of a config subsystem - the agent files are the config.

## 0.7.1 - 2026-07-18

Dispatch-classification accuracy pass: bare dispatches to pinned agents were being miscounted, Workflow-spawned agents were invisible to the token report, and the test suite grew to catch that class of drift.

- Pin-aware dispatch classification: a bare dispatch (no `model` param) to a bundled agent now resolves through the agent's frontmatter pin (`PINNED_MODELS` table) before tier comparison. Bare `implementer` dispatches (pin=sonnet since 0.6.0) were miscounted as session-tier work - on live data the routed-down share corrected from 72% to 80%. Bare pinned rows are annotated `(pin=<model>)` in the report.
- Report rows classify per entry (session included) while aggregating, instead of re-judging the reconstructed row key without a session - a bare pin=sonnet implementer from a sonnet session no longer prints under "Ran cheaper" while the headline says 0%. Rows aggregating sessions on different tiers go to the majority side annotated `[k of n down]`. The key-reparsing probe is gone, so dashed model ids can no longer land in the Unrecognized section by regex truncation.
- Robustness: the heuristic fallback ranks cheapness via the tier ladder (dashed full ids like `claude-sonnet-5` now classify like short names); `firstModelIn` does a bounded 256KB fd read instead of slurping the whole session transcript inside the PostToolUse hook, and accepts vendor-prefixed (Bedrock/Vertex) model ids; the 30d prune can no longer be blocked forever by a missing/NaN head-entry timestamp; the tier-leak `BUNDLED` set derives from `PINNED_MODELS` instead of duplicating it.
- tokens mode: Workflow-spawned agents are now counted. Their transcripts nest under `subagents/workflows/<wf-id>/`, below the old walk depth limit, so entire workflow runs were invisible to the volume report; the walk now reaches them and attributes each agent to its parent session. (Dispatch counts remain Agent-tool-only by design - the hook has no per-agent model data for Workflow runs; README documents the split.)
- tokens mode: the empty-window message reports the actual window (`--days`/`--ago`) instead of a hardcoded "last 7 days".
- plugin.json description matches the current pins (sonnet implementer since 0.6.0; scout and verifier listed).
- Test suite 7 -> 18 cases, including a PINNED_MODELS-vs-agents-frontmatter sync test (the exact drift class this release fixes), hook-mode Task + session capture, the 30d prune path, populated stats/tier-leak/by-session output, and a tokens happy path over synthetic transcripts.
- Caveat: the pin table reflects current frontmatter, so pre-0.6.0 log entries (when implementer pinned opus) are judged by today's pin until they age out of the 30d retention.
- CHANGELOG correction: 0.7.0 shipped 6 smoke tests, not 5.

## 0.7.0 - 2026-07-16

Release hardening: the plugin now degrades honestly on setups unlike the author's instead of printing nothing.

- Stats never emit silent emptiness: report/stats/tokens explain in words why there is no data (no log yet, no transcripts, wrong config dir), and `/model-routing:stats` falls back to a loud error line when node is missing - plus an instruction to re-run via a working shell tool when the embedded shell run itself fails.
- Unknown-tier guard: `tierOf` no longer ranks unrecognized model families as 0. A future model cannot silently corrupt routed-down math or leak detection; such rows are marked `?` in the report and counted separately in tokens mode.
- Smoke tests: 6 `node:test` cases drive the counter CLI end-to-end (`node --test hooks/dispatch-counter.test.mjs`), zero dependencies.
- README: Requirements section (node 18+ is stats-only), honest validated-on status, dated benchmark snapshots (mid-2026), stale implementer row fixed (sonnet since 0.6.0).
- Window flags: `--days N` (size, default 7) and `--ago M` (shift back) on stats/report/tokens; `/model-routing:stats --days 1` is today's slice, `--days 7 --ago 7` the week before - for before/after comparisons when tuning routing. Dispatch retention raised 7d -> 30d to make past windows real.
- Readable report: grouped sections (ran cheaper / at session tier / unrecognized) with a plain-language summary line instead of per-row v/- markers; tokens mode leads with its summary.

## 0.6.0 - 2026-07-13

Research-tuned tiers: implementer drops from opus to sonnet on benchmark evidence, and accidental inheritance becomes a number you can see.

- Research-tuned tiers. `implementer` now pins **sonnet** (was opus): SWE-bench Verified puts the top tier only ~1-2 points ahead at several times the cost, so sonnet is the value default for ordinary implementation; dispatch with `model=opus` for multi-file, architectural, or subtle-reasoning work. reviewer stays opus/high (review is the asymmetric bet worth the top tier).
- Tier-leak detection in the dispatch report: flags unpinned general-purpose/custom dispatches that inherited a strong session model bare, and warns past the 20% rework threshold from coding-agent routing practice. Surfaces accidental inheritance as a number.
- Skill + README now carry per-choice rationale: why each model and each effort, backed by RouteLLM (ICLR 2025, task-type > complexity-score routing) and SWE-bench tier gaps.
- README: recommended session model + effort (weighted price/quality) - pick the session tier for the hardest thing kept in the main seat, since everything else routes down.

## 0.5.4 - 2026-07-13

Conscious tier choice for unpinned dispatches, which silently inherit the session model.

- Conscious tier choice for unpinned dispatches: general-purpose and custom agents dispatched bare silently inherit the session model. Mechanical/exploratory work now gets an explicit sonnet/haiku param; the session tier stays right for genuinely hard tasks - the rule kills accidental inheritance, not top-tier usage.

## 0.5.3 - 2026-07-13

Session-model breakdown: the reports now show which main model each dispatch was routed FROM, not just what it ran on.

- Session-model breakdown in both reports: `report` and `tokens` now show which MAIN model each dispatch / token volume was routed FROM (e.g. fable sessions route 90% down, opus sessions 45%).
- The dispatch hook records `session` (sampled from the head of the session transcript) in each log entry; `isRoutedDown` judges by tier comparison when both model and session are known, so implementer/reviewer on sonnet in a fable session now count as routed down.
- Pre-0.5.3 log entries lack the field and group as "(session not recorded)" until the 7d window rolls over.

## 0.5.2 - 2026-07-13

Real token volume alongside dispatch counts - the honest denominator for "how much did routing actually save".

- `tokens` mode in dispatch-counter.mjs: real token volume per model from subagent transcripts (7d), with a routed-down share judged against each subagent's OWN session model - fable days and opus days both count fairly instead of assuming one fixed top tier.
- `/model-routing:stats` now prints both the dispatch report and the token-volume report.

## 0.5.1 - 2026-07-13

The `/model-routing:stats` slash command, so the numbers land in the chat instead of only a status line.

- `/model-routing:stats` command - prints the dispatch report into the chat: routed-down counts plus a per-agent 7d breakdown.
- `dispatch-counter.mjs report` mode backing the command; `stats` stays the one-liner for status lines.

## 0.5.0 - 2026-07-13

New `verifier` agent, the dispatch counter behind all later stats work, and two routing rules that stop the plugin from costing more than it saves.

- New agent: `verifier` (haiku/low) - cheap gate on subagent diffs before accepting them. Checks scope match, completeness, obvious breakage, and unbacked "tests pass" claims; PASS/FAIL under 15 lines. Not a code review - reviewer owns quality (#5).
- Dispatch counter: a PostToolUse hook logs every Agent dispatch (agent name + model only) to `<config>/model-routing/dispatches.jsonl`, self-pruned to 7 days; `dispatch-counter.mjs stats` prints `routed-down: N today / M 7d` for status-line embedding. Dispatch counts, not invented dollar savings (#6).
- Trivial-first rule: questions answerable from context or general knowledge get answered inline - a dispatch costs more than the answer (#3).
- Escalation ladder formalized: a failed or weak subagent RESULT retries exactly one step up (next tier or higher effort), fresh dispatch; a second failure goes to the main session. Distinct from the stuck-on-approach handback, which continues the same agent (#4).

## 0.4.2 - 2026-07-11

Accuracy and diet pass on the skill and the session anchor, plus repo hygiene.

- Skill: the knowledge-cutoff routing row no longer names a `deep-research` agent the plugin does not ship - it now says "mid-tier agent with web access".
- Skill: locate-only sweeps route to the harness's built-in Explore agent when present; `scout` is for answers that need verification (traced code paths, confirmed file:line).
- Anchor diet: routing-anchor.md cut by a third (2272 to 1509 bytes) - bare rules only, rationale lives in the skill. Saves ~200 tokens per session on an always-injected hook.
- Marketplace metadata description added (fixes the validator warning).
- Superpowers design docs and ledgers moved out of the published repo (.gitignore).

## 0.4.1 - 2026-07-11

Pins are ceilings, not floors - fixes the tier inversion where a pinned agent cost more than the session it was dispatched from.

- Agent pins are ceilings, not floors: when an agent's pinned model is above the session model, routing caps the dispatch at the session model (verified: the Agent `model` param overrides frontmatter pins). Fixes the tier inversion where opus-pinned implementer/reviewer cost more than a sonnet main session.

## 0.4.0 - 2026-07-11

Universality pass: the plugin no longer assumes any specific tool stack, plus a re-ask escalation rule and a Getting started section.

- Universality pass: the plugin no longer names any specific tool stack. Scout's index rule and the routing anchor speak of "a code-graph or code-index MCP server" generically instead of graphify and its tool names. Behavior with a connected graph server is unchanged; nothing assumes one exists.
- New skill rule: a re-asked question or a "too shallow" verdict redoes the work one step up (tier or effort), never at the same level.
- README: Getting started section - plain and workflow recipes, what runs where at which effort, and the sonnet-session inversion warning.

## 0.3.8 - 2026-07-11

Scout's tool restriction switched from an allowlist to a denylist, which enforces the same two guarantees without hiding MCP servers.

- Scout's tool allowlist replaced with a denylist (`disallowedTools: Agent, SendMessage, Edit, Write, NotebookEdit`). The allowlist enforced the same two guarantees (no delegation, real read-only) but silently hid every MCP tool - including a connected code-graph server (the 0.3.7 gap) - and demanded a plugin release per new tool. The denylist bans exactly the two failure modes and inherits everything else, future MCP tools included, with zero maintenance.

## 0.3.7 - 2026-07-11

Closes the graph-orphan gap: a connected code-graph server was reachable by nobody.

- Close the graph-orphan gap: the routing anchor sent all exploration to scout, whose 0.3.4 tool whitelist made code-graph MCP tools invisible - so a connected graph server was never queried by anyone. Scout's whitelist now includes `mcp__graphify__*` (inert when no such server is connected) and its index rule names the MCP tools explicitly for structural questions. The anchor gains a line: structural questions may be answered by one cheap graph call in the main session, with scout for file:line verification.

## 0.3.6 - 2026-07-11

Scout's index-first step relaxed back to advisory - live testing showed the mandatory form only bought a wasted tool call.

- Scout's mandatory index-first step relaxed back to an advisory rule: live tests showed the model pays the check and greps anyway, and its grep answers are solid - the forced step only cost a wasted tool call per dispatch. Organic graph usage is better served by exposing the index as first-class tools (e.g. an MCP server) than by prompt force.

## 0.3.5 - 2026-07-11

Index-first rule hardened after the 0.3.4 retest showed scout skipping the soft wording.

- Index-first rule hardened to a mandatory first step with the exact command (`graphify query "<question>"` when `graphify-out/graph.json` exists): the 0.3.4 retest showed scout skipping the soft-worded check and going straight to Grep.

## 0.3.4 - 2026-07-11

Scout hardened against delegation and writes, after an injected hook talked it into spawning its own subagent.

- `scout` gets a hard tool whitelist (`Read, Grep, Glob, Bash, ToolSearch, LSP`): no `Agent`/`SendMessage`, so it can no longer delegate exploration to nested subagents (observed in the wild: an injected "work in a sandbox" hook talked scout into dispatching a general-purpose agent, doubling the cost and bypassing scout's own instructions). The whitelist also makes read-only actual, not declarative - no Write/Edit.
- The pre-built-index check moved from an intro paragraph into the first rule, plus an explicit "do the exploration yourself" rule.

## 0.3.3 - 2026-07-11

Scout checks for a pre-built code index before sweeping files, and treats what it finds as leads rather than answers.

- `scout` now checks the repo for a pre-built code index before sweeping files - a knowledge graph (e.g. `graphify-out/graph.json`), a tags/cscope database, or any documented repo code map. Index answers are treated as leads and verified against the actual code before reporting.

## 0.3.2 - 2026-07-11

Per-agent effort moves into frontmatter, now that Claude Code supports the field.

- Per-agent effort pinned in frontmatter: Claude Code now supports an `effort` field in agent definitions (overrides the session level), so the bundled agents set it directly - scout/test-runner `low`, implementer/e2e-runner `medium`, reviewer `high`.
- Prose "Effort hint for the caller" lines removed from the agents; frontmatter is the single source of truth.
- Skill and session-start anchor updated to describe the new mechanics; reviewer's routing-table effort is now `high` (was medium-high).

## 0.3.1 - 2026-07-09

Correctness pass on how effort actually works - 0.3.0 described a parameter that does not exist.

- Fix: the skill and anchor pointed at a nonexistent Agent-tool `effort` param. Effort is now described as it actually works: Workflow `agent()` takes an `effort` option; a plain Agent dispatch inherits the session effort.
- Escalation loop: after a main-session decision, continue the SAME agent (SendMessage) instead of re-dispatching - a fresh agent pays the full file re-read.
- Per-agent effort notes reworded as caller hints; prompt text cannot self-set reasoning effort.
- Routing table now notes that main-session effort is the user's session setting - advisory only.

## 0.3.0 - 2026-07-09

Effort becomes a second routing knob alongside model tier, plus the escalate-don't-guess rule and release automation.

- Effort dimension: routing now tunes reasoning effort as a second knob alongside model tier. New "Effort, not just tier" section in the skill, an effort column in the routing table, a per-agent default effort, and an effort note in the session-start anchor.
- Advisor-escalation: an "escalate, don't guess" rule plus an explicit escalation protocol in `implementer` - a subagent stuck on the approach packages its state and hands back for a main-session decision instead of thrashing.
- Routing table gains a row for knowledge-cutoff gaps (deep-research / mid-tier research pass) and a note on output-token reducers as an orthogonal saving.
- Release automation: pushing a `v*` tag creates the GitHub release with notes from the matching CHANGELOG section.
- CI badge in README.

## 0.2.0 - 2026-07-07

Zero-config session injection and the `scout` agent - the plugin now works without a CLAUDE.md snippet.

- SessionStart hook: the routing anchor is now auto-injected into every session - zero config, no CLAUDE.md snippet required.
- New `scout` agent (sonnet): read-only codebase exploration; conclusions and file:line refs return, file dumps stay out of the main session.
- CI: GitHub Actions workflow validating JSON manifests and agent/skill frontmatter on every push.

## 0.1.0 - 2026-07-07

Initial release: four agents and the routing skill.

- Initial release: `test-runner` (haiku), `e2e-runner` (sonnet), `implementer` (opus), `reviewer` (opus) agents + the `model-routing` skill with the tier routing table.
