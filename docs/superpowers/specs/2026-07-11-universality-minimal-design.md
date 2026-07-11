# Universality + minimalism pass (0.4.0)

Date: 2026-07-11
Status: approved (A-minimal)

## Goal

Remove tool-specific references (graphify) so the plugin works identically
in any environment, and keep the plugin's total text weight flat or
smaller. No new files, no new mechanisms, no scripts.

## Background

- Verified 2026-07-11: subagent model pins work (test-runner frontmatter
  `haiku` and Agent `model: haiku` both ran on `claude-haiku-4-5` while the
  main session ran `claude-fable-5`). Issue anthropics/claude-code#43869
  does not reproduce here; the plugin's tier-saving pitch holds.
- No native auto-routing announced by Anthropic; auto-routing by task type
  is an open feature request (anthropics/claude-code#44976). The niche
  stays open.
- Competitor scan (PIRSAndrew/claude-model-routing, tzachbon hook,
  claude-code-router): nothing bundles subagent tiering + context
  isolation + effort pinning. Borrowed one idea (re-ask escalation);
  rejected language-signal heuristics and feedback logs as bloat.

## Changes

1. `agents/scout.md` (lines 16-23): generalize the structural-questions
   rule. Remove the graphify name, its tool names (query_graph,
   shortest_path, get_neighbors, god_nodes), and the `graphify query` CLI
   mention. New wording: if a code-graph or code-index MCP server is
   connected (discover via ToolSearch, e.g. "graph", "index", "symbols"),
   query it FIRST for structural questions; documented pre-built indexes
   (ctags/cscope, a project index CLI) serve the same role. Keep "index
   answers are leads, not proof" and the point-lookup grep rule unchanged.
   Result must be no longer than the current text.

2. `hooks/routing-anchor.md` (line 5): drop "(e.g. `mcp__graphify__*`)",
   keep "when a code-graph MCP is connected". No other anchor changes.

3. `skills/model-routing/SKILL.md` (Rules section): add one line -
   "User re-asks or calls the answer shallow = redo one step up (tier or
   effort), never at the same level." Nothing else added.

4. `README.md`: add a "Getting started" section with two short recipes.
   - Plain use: pick the session model (`/model`) - the strongest tier
     you are willing to pay for; the plugin never changes it. Table of
     what runs where: exploration -> scout (sonnet, low), tests ->
     test-runner (haiku, low), implementation -> implementer (opus,
     medium), review -> reviewer (opus, high), E2E -> e2e-runner
     (sonnet, medium); the main session burns tokens only on planning,
     decisions, final review, and coordination.
   - Workflow use (brainstorm -> plan -> execute, e.g. superpowers):
     brainstorming and plan-writing stay in the main session on the
     strongest model; executing the plan dispatches implementer per task
     batch, test-runner for verification, reviewer per completed chunk.
   - "I don't want the expensive model": switch `/model` down (opus,
     opusplan) - agent pins do not change, tiers are relative. Warn
     about the inversion: on a sonnet session, opus-pinned
     implementer/reviewer cost MORE than the main session (isolation
     still works, tier economy does not).

5. `CHANGELOG.md` + version bump to 0.4.0 in
   `.claude-plugin/plugin.json`. Rationale for
   the minor bump: the plugin no longer knows about any specific tool
   stack - a semantic shift, not a patch.

## Explicitly rejected (bloat)

- Language-signal routing heuristics (quick/analyze phrasing): models
  already do this; the table stays the base.
- Anti-leak rule: duplicates anchor lines 4 and 8.
- Receipts (token-savings reporting hook): new script, cross-platform
  cost, cosmetic value.
- Feedback log (self-tuning tier memory): new state and write rules;
  unproven upstream.

## Success criteria

- `grep -ri graphify` over the plugin (excluding CHANGELOG and this spec)
  returns nothing.
- Total injected text (agents + skill + anchor) is not larger than
  before; the README guide adds repo-docs weight only, never enters any
  model context.
- Existing behavior unchanged when no graph/index MCP is connected.
