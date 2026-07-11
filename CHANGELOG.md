# Changelog

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
