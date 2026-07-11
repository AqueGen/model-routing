# Universality + Minimalism Pass (0.4.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove graphify-specific references so the plugin is stack-agnostic, add one escalation rule, add a README getting-started guide, ship as 0.4.0.

**Architecture:** Text-only edits to four existing markdown files plus a version bump. No new mechanisms, no scripts, no new injected text beyond one skill rule line.

**Tech Stack:** Markdown, JSON (plugin manifest). No build, no tests - verification is grep checks.

## Global Constraints

- All file content in English (user rule).
- Plain ASCII in docs: no unicode arrows or bullets; single dash separators (user rule).
- No AI attribution anywhere, including commit messages (user rule).
- Injected text (agents + skill + anchor) must not grow beyond the one new rule line; scout.md must not get longer.
- Spec: `docs/superpowers/specs/2026-07-11-universality-minimal-design.md`.

---

### Task 1: Generalize scout's index rule

**Files:**
- Modify: `agents/scout.md:16-23`

**Interfaces:**
- Produces: scout.md with no graphify mention; later grep check in Task 5 relies on this.

- [ ] **Step 1: Apply the edit**

In `agents/scout.md`, replace this exact block:

```markdown
- For structural questions ("what connects A and B", "what depends on X",
  impact of a change): if graphify MCP tools are available (load via
  ToolSearch "graphify" - query_graph, shortest_path, get_neighbors,
  god_nodes), query the graph FIRST and use its nodes as your starting
  points. Other documented indexes (tags/cscope, `graphify query` CLI)
  serve the same role. Index answers are leads, not proof: confirm the
  key file:line in the actual code before reporting. For point lookups
  ("where is class X"), grep directly.
```

with:

```markdown
- For structural questions ("what connects A and B", "what depends on X",
  impact of a change): if a code-graph or code-index MCP server is
  connected (discover via ToolSearch - try "graph", "index", "symbols"),
  query it FIRST and use its answers as your starting points. Documented
  pre-built indexes (ctags/cscope, a project index CLI) serve the same
  role. Index answers are leads, not proof: confirm the key file:line in
  the actual code before reporting. For point lookups ("where is class
  X"), grep directly.
```

- [ ] **Step 2: Verify no graphify left and length did not grow**

Run: `grep -in graphify agents/scout.md`
Expected: no output.

Run: `wc -c agents/scout.md`
Expected: byte count <= 2182 (current size; the new block is slightly shorter than the old one).

- [ ] **Step 3: Commit**

```bash
git add agents/scout.md
git commit -m "Scout: generalize index rule to any code-graph/index MCP"
```

### Task 2: Clean the routing anchor

**Files:**
- Modify: `hooks/routing-anchor.md:5`

**Interfaces:**
- Produces: anchor with no graphify mention; Task 5 grep check relies on this.

- [ ] **Step 1: Apply the edit**

In `hooks/routing-anchor.md` line 5, replace:

```markdown
- Structural questions ("what connects A and B", "what depends on X", impact) when a code-graph MCP is connected (e.g. `mcp__graphify__*`): one cheap graph call in the main session may beat a scout dispatch - query the graph first, send scout to verify file:line specifics.
```

with:

```markdown
- Structural questions ("what connects A and B", "what depends on X", impact) when a code-graph MCP is connected: one cheap graph call in the main session may beat a scout dispatch - query the graph first, send scout to verify file:line specifics.
```

- [ ] **Step 2: Verify**

Run: `grep -in graphify hooks/routing-anchor.md`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add hooks/routing-anchor.md
git commit -m "Anchor: drop tool-specific MCP example"
```

### Task 3: Add re-ask escalation rule to the skill

**Files:**
- Modify: `skills/model-routing/SKILL.md` (Rules section, after the "Escalate, don't guess." bullet that ends with "...the batching rule exists to avoid.")

**Interfaces:**
- Produces: one new rule line; CHANGELOG entry in Task 5 describes it.

- [ ] **Step 1: Apply the edit**

In `skills/model-routing/SKILL.md`, after this bullet's last line:

```markdown
  fresh dispatch pays the full file re-read the batching rule exists to
  avoid.
```

insert the new bullet:

```markdown
- When the user re-asks the same question or calls the answer shallow,
  redo it one step up - a higher tier or higher effort - never at the
  same level that just failed.
```

- [ ] **Step 2: Verify placement**

Run: `grep -n "redo it one step up" skills/model-routing/SKILL.md`
Expected: one match, line number between the "Escalate, don't guess" bullet and the "If an entire session is one phase" bullet.

- [ ] **Step 3: Commit**

```bash
git add skills/model-routing/SKILL.md
git commit -m "Skill: re-asked or shallow answer escalates one step up"
```

### Task 4: README Getting started section

**Files:**
- Modify: `README.md` (insert a new `## Getting started` section between the `## Install` section and `## Usage`)

**Interfaces:**
- Consumes: agent names and pins as documented in Tasks 1-3 files (scout/sonnet/low, test-runner/haiku/low, implementer/opus/medium, reviewer/opus/high, e2e-runner/sonnet/medium).

- [ ] **Step 1: Insert the section**

In `README.md`, directly before the line `## Usage`, insert:

```markdown
## Getting started

### Plain use

1. Pick your session model with `/model` (opus, fable, whatever your
   plan offers). The plugin never changes it - the main session is where
   planning and decisions happen, so give it the strongest tier you are
   willing to pay for. Session effort: leave the default (medium); the
   bundled agents pin their own.
2. Work normally. Mechanical work routes down automatically:

   | You ask | Who runs it | Model / effort |
   | ------- | ----------- | -------------- |
   | "Where is X handled?" | `scout` | sonnet / low |
   | "Run the tests" | `test-runner` | haiku / low |
   | "Implement tasks from the plan" | `implementer` | opus / medium |
   | "Review the diff" | `reviewer` | opus / high |
   | "Walk through the flow in the browser" | `e2e-runner` | sonnet / medium |

   The main session spends tokens only on planning, decisions, final
   review of high-risk diffs, and reading the agents' short reports.

### Workflow use (brainstorm - plan - execute)

Works with any plan-driven workflow (superpowers or similar):

1. Brainstorming and plan-writing stay in the main session on the
   strongest model - protecting this thinking is the point of the
   plugin.
2. Plan execution goes to `implementer` with a batch of related tasks
   per dispatch (one agent per batch, not per task - every fresh agent
   re-reads files from scratch).
3. Verification: `test-runner` after each batch, `reviewer` on the
   completed chunk, and for high-risk diffs a final review in the main
   session.

### "I don't want the expensive model"

Switch the session down: `/model opus` or `/model opusplan`. Agent pins
do not move - tiers are relative, "strongest" simply means your session
model. One inversion to know about: on a `sonnet` session the
opus-pinned `implementer` and `reviewer` cost MORE than your main
session. Context isolation still pays off, tier economy does not - on a
sonnet-only budget, review in the main session instead.
```

- [ ] **Step 2: Verify structure**

Run: `grep -n "^## " README.md`
Expected: `## Getting started` appears between `## Install` and `## Usage`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: getting started guide (plain use, workflow use, cheap-model mode)"
```

### Task 5: CHANGELOG + version bump

**Files:**
- Modify: `CHANGELOG.md` (new entry at top, after `# Changelog`)
- Modify: `.claude-plugin/plugin.json:4` (`"version": "0.3.8"` -> `"version": "0.4.0"`)

**Interfaces:**
- Consumes: the changes from Tasks 1-4 (entry text describes them).

- [ ] **Step 1: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert after the `# Changelog` line (before `## 0.3.8`):

```markdown
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
```

- [ ] **Step 2: Bump the version**

In `.claude-plugin/plugin.json`, change:

```json
  "version": "0.3.8",
```

to:

```json
  "version": "0.4.0",
```

- [ ] **Step 3: Final verification (spec success criteria)**

Run: `grep -rin graphify agents/ hooks/ skills/ .claude-plugin/ README.md`
Expected: no output (CHANGELOG and docs/ are allowed to keep the history).

Run: `python -m json.tool .claude-plugin/plugin.json`
Expected: valid JSON printed, version 0.4.0.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md .claude-plugin/plugin.json
git commit -m "Release 0.4.0: universality pass, escalation rule, getting started guide"
```
