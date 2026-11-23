# Install

```text
claude marketplace add AqueGen/model-routing
```

Then enable the plugin:

```text
/plugin install model-routing@model-routing
```

(or toggle it in the `/plugin` menu, or add
`"model-routing@model-routing": true` to `enabledPlugins` in
`~/.claude/settings.json`).

For local development: clone the repo and
`claude marketplace add /path/to/model-routing`.

## Requirements

- Claude Code with plugin support (agents, skills, hooks).
- `node` 18+ on PATH - used only by the dispatch counter and
  `/model-routing:stats`. The routing itself (skill, agents, session
  anchor) works without node; if node is missing you lose stats, nothing
  else, and the stats command says so instead of printing nothing.
- The tier ladder recognizes the current Claude families
  (fable/opus/sonnet/haiku). A future model family shows up in stats as
  not tier-comparable rather than silently skewing the numbers.
- Status: validated in daily use (Windows, opus/fable sessions). The
  `tokens` mode parses Claude Code transcript files, whose format may
  evolve - if it breaks, stats degrade to an explanatory message, not
  wrong numbers. Issues welcome.
- Continuing a stuck agent uses `SendMessage` when the harness provides
  it; where it is absent the skill falls back to re-dispatching with the
  packaged state. Neither path is a hard requirement.
- What "read-only" means here: scout, reviewer, task-reviewer, verifier and test-runner
  block the file-edit tools (`Edit`, `Write`, `NotebookEdit`) at the tool
  level via `disallowedTools`. `Bash` (needed to run tests and inspect
  repos) and MCP tools remain available and could in principle mutate
  state - that boundary is behavioral (prompt rules), not a sandbox.
  Scout deliberately uses a denylist rather than a tool allowlist so a
  connected code-graph MCP server stays usable (an allowlist silently
  hides every MCP tool).

## Turn it off or remove

The `enabledPlugins` entry in `~/.claude/settings.json` named above, or the `/plugin` menu, is where the plugin is toggled. The dispatch log at `<config>/model-routing/dispatches.jsonl` can be deleted any time to reset the stats; a missing file just means zero.
