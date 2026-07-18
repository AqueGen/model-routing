# Changelog

## 0.7.6 - 2026-07-18

- README sources completed: SWE-bench Verified now links to the
  leaderboard the numbers are read from; new paragraph credits the
  orchestrator-workers pattern (Anthropic, "Building Effective Agents")
  and the native Claude Code subagents mechanism the plugin builds on.
  RouteLLM and the Augment rework-threshold guide were already linked.

## 0.7.5 - 2026-07-18

- README visuals rebased onto fable-default sessions only (via the new
  `--session fable` filter): the mixed-tier window understated routing on
  the normal setup. Fable-only, 7d: 100% of dispatches and 89% of volume
  below the session tier; the remaining fable slice is explicitly labeled
  as the accidental-inheritance case the 0.7.2 Workflow rule targets.

## 0.7.4 - 2026-07-18

- `--session <family>` flag on stats/report/tokens: scope the numbers to
  sessions whose model matches (e.g. `--session fable`). A fallbackModel
  ladder or manual /model switches mix session tiers inside one window;
  the filter answers "how does routing do on my normal setup" - live
  data: fable-only sessions show 100% dispatches routed down vs 78%
  across the mixed window. Entries with no recorded session are excluded
  when the filter is active.

## 0.7.3 - 2026-07-18

- README "What that looks like in tokens": three GitHub-native mermaid
  visuals - without-vs-with bar of volume billed at the session tier,
  measured per-model pie of where subagent volume actually ran (7d live
  snapshot, dated), and a task->tier flowchart. Real measured numbers,
  no invented dollars; the deliberate opus slice is called out as a
  decision, not a leak.

## 0.7.2 - 2026-07-18

- CI runs the counter smoke tests (`node --test`) on every push/PR - the
  PINNED_MODELS-vs-frontmatter sync test now enforces in CI, so a pin
  change that forgets the stats table fails the build instead of rotting
  silently until the next audit.
- Workflow-dispatch routing rule in the skill and session anchor: every
  Workflow `agent()` call without explicit `model`/`effort` opts inherits
  the session model at session effort, multiplied by the fan-out - the
  costliest place to forget the conscious-tier rule. Observed live: a
  77-agent review workflow ran 10% of its volume on the session tier
  through exactly this omission.
- README "Overriding pins": the three existing override paths (per-
  dispatch `model` param, frontmatter edits guarded by the CI sync test,
  git-checkout reset) documented in place of a config subsystem - the
  agent files are the config.

## 0.7.1 - 2026-07-18

- Pin-aware dispatch classification: a bare dispatch (no `model` param) to a
  bundled agent now resolves through the agent's frontmatter pin
  (`PINNED_MODELS` table) before tier comparison. Bare `implementer`
  dispatches (pin=sonnet since 0.6.0) were miscounted as session-tier work -
  on live data the routed-down share corrected from 72% to 80%. Bare pinned
  rows are annotated `(pin=<model>)` in the report.
- Report rows classify per entry (session included) while aggregating,
  instead of re-judging the reconstructed row key without a session - a bare
  pin=sonnet implementer from a sonnet session no longer prints under "Ran
  cheaper" while the headline says 0%. Rows aggregating sessions on
  different tiers go to the majority side annotated `[k of n down]`. The
  key-reparsing probe is gone, so dashed model ids can no longer land in
  the Unrecognized section by regex truncation.
- Robustness: the heuristic fallback ranks cheapness via the tier ladder
  (dashed full ids like `claude-sonnet-5` now classify like short names);
  `firstModelIn` does a bounded 256KB fd read instead of slurping the whole
  session transcript inside the PostToolUse hook, and accepts vendor-prefixed
  (Bedrock/Vertex) model ids; the 30d prune can no longer be blocked forever
  by a missing/NaN head-entry timestamp; the tier-leak `BUNDLED` set derives
  from `PINNED_MODELS` instead of duplicating it.
- tokens mode: Workflow-spawned agents are now counted. Their transcripts
  nest under `subagents/workflows/<wf-id>/`, below the old walk depth
  limit, so entire workflow runs were invisible to the volume report; the
  walk now reaches them and attributes each agent to its parent session.
  (Dispatch counts remain Agent-tool-only by design - the hook has no
  per-agent model data for Workflow runs; README documents the split.)
- tokens mode: the empty-window message reports the actual window
  (`--days`/`--ago`) instead of a hardcoded "last 7 days".
- plugin.json description matches the current pins (sonnet implementer since
  0.6.0; scout and verifier listed).
- Test suite 7 -> 18 cases, including a PINNED_MODELS-vs-agents-frontmatter
  sync test (the exact drift class this release fixes), hook-mode Task +
  session capture, the 30d prune path, populated stats/tier-leak/by-session
  output, and a tokens happy path over synthetic transcripts.
- Caveat: the pin table reflects current frontmatter, so pre-0.6.0 log
  entries (when implementer pinned opus) are judged by today's pin until
  they age out of the 30d retention.
- CHANGELOG correction: 0.7.0 shipped 6 smoke tests, not 5.

## 0.7.0 - 2026-07-16

Release hardening: the plugin now degrades honestly on setups unlike the
author's instead of printing nothing.

- Stats never emit silent emptiness: report/stats/tokens explain in words
  why there is no data (no log yet, no transcripts, wrong config dir), and
  `/model-routing:stats` falls back to a loud error line when node is
  missing - plus an instruction to re-run via a working shell tool when
  the embedded shell run itself fails.
- Unknown-tier guard: `tierOf` no longer ranks unrecognized model families
  as 0. A future model cannot silently corrupt routed-down math or leak
  detection; such rows are marked `?` in the report and counted separately
  in tokens mode.
- Smoke tests: 6 `node:test` cases drive the counter CLI end-to-end
  (`node --test hooks/dispatch-counter.test.mjs`), zero dependencies.
- README: Requirements section (node 18+ is stats-only), honest
  validated-on status, dated benchmark snapshots (mid-2026), stale
  implementer row fixed (sonnet since 0.6.0).
- Window flags: `--days N` (size, default 7) and `--ago M` (shift back)
  on stats/report/tokens; `/model-routing:stats --days 1` is today's
  slice, `--days 7 --ago 7` the week before - for before/after
  comparisons when tuning routing. Dispatch retention raised 7d -> 30d
  to make past windows real.
- Readable report: grouped sections (ran cheaper / at session tier /
  unrecognized) with a plain-language summary line instead of per-row
  v/- markers; tokens mode leads with its summary.

## 0.6.0 - 2026-07-13

- Research-tuned tiers. `implementer` now pins **sonnet** (was opus):
  SWE-bench Verified puts the top tier only ~1-2 points ahead at several
  times the cost, so sonnet is the value default for ordinary
  implementation; dispatch with `model=opus` for multi-file, architectural,
  or subtle-reasoning work. reviewer stays opus/high (review is the
  asymmetric bet worth the top tier).
- Tier-leak detection in the dispatch report: flags unpinned
  general-purpose/custom dispatches that inherited a strong session model
  bare, and warns past the 20% rework threshold from coding-agent routing
  practice. Surfaces accidental inheritance as a number.
- Skill + README now carry per-choice rationale: why each model and each
  effort, backed by RouteLLM (ICLR 2025, task-type > complexity-score
  routing) and SWE-bench tier gaps.
- README: recommended session model + effort (weighted price/quality) -
  pick the session tier for the hardest thing kept in the main seat, since
  everything else routes down.

## 0.5.4 - 2026-07-13

- Conscious tier choice for unpinned dispatches: general-purpose and
  custom agents dispatched bare silently inherit the session model.
  Mechanical/exploratory work now gets an explicit sonnet/haiku param;
  the session tier stays right for genuinely hard tasks - the rule kills
  accidental inheritance, not top-tier usage.

## 0.5.3 - 2026-07-13

- Session-model breakdown in both reports: `report` and `tokens` now show
  which MAIN model each dispatch / token volume was routed FROM (e.g.
  fable sessions route 90% down, opus sessions 45%).
- The dispatch hook records `session` (sampled from the head of the
  session transcript) in each log entry; `isRoutedDown` judges by tier
  comparison when both model and session are known, so implementer/
  reviewer on sonnet in a fable session now count as routed down.
- Pre-0.5.3 log entries lack the field and group as "(session not
  recorded)" until the 7d window rolls over.

## 0.5.2 - 2026-07-13

- `tokens` mode in dispatch-counter.mjs: real token volume per model from
  subagent transcripts (7d), with a routed-down share judged against each
  subagent's OWN session model - fable days and opus days both count
  fairly instead of assuming one fixed top tier.
- `/model-routing:stats` now prints both the dispatch report and the
  token-volume report.

## 0.5.1 - 2026-07-13

- `/model-routing:stats` command - prints the dispatch report into the
  chat: routed-down counts plus a per-agent 7d breakdown.
- `dispatch-counter.mjs report` mode backing the command; `stats` stays
  the one-liner for status lines.

## 0.5.0 - 2026-07-13

- New agent: `verifier` (haiku/low) - cheap gate on subagent diffs
  before accepting them. Checks scope match, completeness, obvious
  breakage, and unbacked "tests pass" claims; PASS/FAIL under 15 lines.
  Not a code review - reviewer owns quality (#5).
- Dispatch counter: a PostToolUse hook logs every Agent dispatch (agent
  name + model only) to `<config>/model-routing/dispatches.jsonl`,
  self-pruned to 7 days; `dispatch-counter.mjs stats` prints
  `routed-down: N today / M 7d` for status-line embedding. Dispatch
  counts, not invented dollar savings (#6).
- Trivial-first rule: questions answerable from context or general
  knowledge get answered inline - a dispatch costs more than the answer
  (#3).
- Escalation ladder formalized: a failed or weak subagent RESULT retries
  exactly one step up (next tier or higher effort), fresh dispatch; a
  second failure goes to the main session. Distinct from the
  stuck-on-approach handback, which continues the same agent (#4).

## 0.4.2 - 2026-07-11

- Skill: the knowledge-cutoff routing row no longer names a
  `deep-research` agent the plugin does not ship - it now says "mid-tier
  agent with web access".
- Skill: locate-only sweeps route to the harness's built-in Explore
  agent when present; `scout` is for answers that need verification
  (traced code paths, confirmed file:line).
- Anchor diet: routing-anchor.md cut by a third (2272 to 1509 bytes) -
  bare rules only, rationale lives in the skill. Saves ~200 tokens per
  session on an always-injected hook.
- Marketplace metadata description added (fixes the validator warning).
- Superpowers design docs and ledgers moved out of the published repo
  (.gitignore).

## 0.4.1 - 2026-07-11

- Agent pins are ceilings, not floors: when an agent's pinned model is
  above the session model, routing caps the dispatch at the session
  model (verified: the Agent `model` param overrides frontmatter pins).
  Fixes the tier inversion where opus-pinned implementer/reviewer cost
  more than a sonnet main session.

## 0.4.0 - 2026-07-11

- Universality pass: the plugin no longer names any specific tool stack.
  Scout's index rule and the routing anchor speak of "a code-graph or
  code-index MCP server" generically instead of graphify and its tool
  names. Behavior with a connected graph server is unchanged; nothing
  assumes one exists.
- New skill rule: a re-asked question or a "too shallow" verdict redoes
  the work one step up (tier or effort), never at the same level.
- README: Getting started section - plain and workflow recipes, what
  runs where at which effort, and the sonnet-session inversion warning.

## 0.3.8 - 2026-07-11

- Scout's tool allowlist replaced with a denylist
  (`disallowedTools: Agent, SendMessage, Edit, Write, NotebookEdit`).
  The allowlist enforced the same two guarantees (no delegation, real
  read-only) but silently hid every MCP tool - including a connected
  code-graph server (the 0.3.7 gap) - and demanded a plugin release per
  new tool. The denylist bans exactly the two failure modes and inherits
  everything else, future MCP tools included, with zero maintenance.

## 0.3.7 - 2026-07-11

- Close the graph-orphan gap: the routing anchor sent all exploration to
  scout, whose 0.3.4 tool whitelist made code-graph MCP tools invisible -
  so a connected graph server was never queried by anyone. Scout's
  whitelist now includes `mcp__graphify__*` (inert when no such server is
  connected) and its index rule names the MCP tools explicitly for
  structural questions. The anchor gains a line: structural questions may
  be answered by one cheap graph call in the main session, with scout for
  file:line verification.

## 0.3.6 - 2026-07-11

- Scout's mandatory index-first step relaxed back to an advisory rule:
  live tests showed the model pays the check and greps anyway, and its
  grep answers are solid - the forced step only cost a wasted tool call
  per dispatch. Organic graph usage is better served by exposing the
  index as first-class tools (e.g. an MCP server) than by prompt force.

## 0.3.5 - 2026-07-11

- Index-first rule hardened to a mandatory first step with the exact
  command (`graphify query "<question>"` when `graphify-out/graph.json`
  exists): the 0.3.4 retest showed scout skipping the soft-worded check
  and going straight to Grep.

## 0.3.4 - 2026-07-11

- `scout` gets a hard tool whitelist (`Read, Grep, Glob, Bash, ToolSearch,
  LSP`): no `Agent`/`SendMessage`, so it can no longer delegate exploration
  to nested subagents (observed in the wild: an injected "work in a
  sandbox" hook talked scout into dispatching a general-purpose agent,
  doubling the cost and bypassing scout's own instructions). The whitelist
  also makes read-only actual, not declarative - no Write/Edit.
- The pre-built-index check moved from an intro paragraph into the first
  rule, plus an explicit "do the exploration yourself" rule.

## 0.3.3 - 2026-07-11

- `scout` now checks the repo for a pre-built code index before sweeping
  files - a knowledge graph (e.g. `graphify-out/graph.json`), a
  tags/cscope database, or any documented repo code map. Index answers are
  treated as leads and verified against the actual code before reporting.

## 0.3.2 - 2026-07-11

- Per-agent effort pinned in frontmatter: Claude Code now supports an
  `effort` field in agent definitions (overrides the session level), so
  the bundled agents set it directly - scout/test-runner `low`,
  implementer/e2e-runner `medium`, reviewer `high`.
- Prose "Effort hint for the caller" lines removed from the agents;
  frontmatter is the single source of truth.
- Skill and session-start anchor updated to describe the new mechanics;
  reviewer's routing-table effort is now `high` (was medium-high).

## 0.3.1 - 2026-07-09

- Fix: the skill and anchor pointed at a nonexistent Agent-tool `effort`
  param. Effort is now described as it actually works: Workflow `agent()`
  takes an `effort` option; a plain Agent dispatch inherits the session
  effort.
- Escalation loop: after a main-session decision, continue the SAME agent
  (SendMessage) instead of re-dispatching - a fresh agent pays the full
  file re-read.
- Per-agent effort notes reworded as caller hints; prompt text cannot
  self-set reasoning effort.
- Routing table now notes that main-session effort is the user's session
  setting - advisory only.

## 0.3.0 - 2026-07-09

- Effort dimension: routing now tunes reasoning effort as a second knob
  alongside model tier. New "Effort, not just tier" section in the skill,
  an effort column in the routing table, a per-agent default effort, and
  an effort note in the session-start anchor.
- Advisor-escalation: an "escalate, don't guess" rule plus an explicit
  escalation protocol in `implementer` - a subagent stuck on the approach
  packages its state and hands back for a main-session decision instead of
  thrashing.
- Routing table gains a row for knowledge-cutoff gaps (deep-research /
  mid-tier research pass) and a note on output-token reducers as an
  orthogonal saving.
- Release automation: pushing a `v*` tag creates the GitHub release with
  notes from the matching CHANGELOG section.
- CI badge in README.

## 0.2.0 - 2026-07-07

- SessionStart hook: the routing anchor is now auto-injected into every
  session - zero config, no CLAUDE.md snippet required.
- New `scout` agent (sonnet): read-only codebase exploration; conclusions
  and file:line refs return, file dumps stay out of the main session.
- CI: GitHub Actions workflow validating JSON manifests and agent/skill
  frontmatter on every push.

## 0.1.0 - 2026-07-07

- Initial release: `test-runner` (haiku), `e2e-runner` (sonnet),
  `implementer` (opus), `reviewer` (opus) agents + the `model-routing`
  skill with the tier routing table.
