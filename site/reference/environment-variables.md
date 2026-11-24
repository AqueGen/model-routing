# Environment variables

The Claude Code variables the plugin's docs and reports rely on, plus where the plugin looks for its own files. Pins are not configurable here; the only config file is the optional above-session warning, see [Configuration](/guides/configuration).

| Variable | Effect |
| --- | --- |
| `CLAUDE_CONFIG_DIR` | The Claude Code config directory, written `<config>` in these docs. The dispatch counter keeps its log at `<config>/model-routing/dispatches.jsonl` and reads transcripts from `<config>/projects`. Unset, it is `~/.claude`. |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Since Claude Code 2.1.251 a DEFAULT below everything else: an explicit `model` param wins, then a frontmatter pin, then this var, then the session model (`inherit` is the same as leaving it unset). The dispatch report marks the rows it actually decided `agent (env=...)`. A plain `CLAUDE_CODE_SUBAGENT_MODEL` can never put a pinned agent under its pin. |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` | Since Claude Code 2.1.257, `=1` inverts the above and makes the harness ignore every param and every pin. With both set, subagents run the env model; with only FORCE set they run the session model. Those rows read `agent (forced=...)`, and the below-pin check excludes them on purpose. |
| `CLAUDE_CODE_EFFORT_LEVEL` | The first source the report's effort line reads (the only place `max` is accepted), before the level saved for the model in `modelSettings` or an `effortLevel` from the settings cascade. |

See [Overriding pins](/guides/overriding-pins) for how these fit with the other override paths, and the [dispatch counter](/reference/dispatch-counter) for how the report treats them.
