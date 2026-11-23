# Overriding pins

There is deliberately no config subsystem - four override paths cover it:

- **Whole session**: since Claude Code 2.1.251 the `CLAUDE_CODE_SUBAGENT_MODEL` env var is a DEFAULT below everything else - an explicit `model` param wins, then a frontmatter pin, then this var, then the session model (`inherit` is the same as leaving it unset) - and the dispatch report marks the rows it actually decided `agent (env=...)`. Since 2.1.257 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` inverts that and makes the harness ignore every param and every pin: with both set, subagents run the env model, with only FORCE set they run the session model, and those rows read `agent (forced=...)`.
- **Per dispatch**: the Agent tool's `model` param overrides any
  frontmatter pin (pins-are-ceilings works through exactly this);
  Workflow `agent()` takes `model` and `effort` opts per call, and an
  Agent dispatch takes an `effort` param for a non-fork subagent;
  without one, effort comes from the agent's frontmatter pin when
  present, else from the session level.
- **Permanent**: edit the `model:` / `effort:` frontmatter in
  `agents/*.md`. A directory-source install picks the change up next
  session. Keep `AGENT_PINS` in `hooks/dispatch-counter.mjs` in step - it
  carries both the model and the effort column, and a CI sync test fails the
  build when either drifts from the frontmatter, because that drift silently
  corrupts the stats (it happened once; see 0.7.1).
- **Reset**: `git checkout -- agents` in the plugin checkout, or
  reinstall from the marketplace.

A runtime config file was considered and rejected: the harness reads
model pins from agent frontmatter directly, so a config file could only
be advisory prose asking Claude to pass overrides - more surface, weaker
guarantee. The agent files are the config.
