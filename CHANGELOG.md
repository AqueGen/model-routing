# Changelog

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
