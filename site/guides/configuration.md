# Configuration

One optional file controls the above-session warning. It does not control pins - those stay in the agent files, see [Overriding pins](/guides/overriding-pins).

## The file

`<config>/model-routing/config.json`, where `<config>` is `CLAUDE_CONFIG_DIR` when set, else the `.claude` directory in your home directory.

```json
{
  "aboveSession": "warn",
  "exempt": ["reviewer"]
}
```

| Key | Values | Default |
| --- | --- | --- |
| `aboveSession` | `"warn"` or `"off"` | `"warn"` |
| `exempt` | list of agent type names | `[]` |

An `exempt` entry matches an agent type when the full names are equal or the parts after the last colon are. `reviewer` matches `reviewer` and `model-routing:reviewer`.

A missing, unreadable or invalid file means the defaults. A key with a wrong value falls back to its own default and the other key is still read.

## What it reports

A subagent is above the session when it ran on a higher tier than the session model. Two places say so.

**The cost line.** After the existing cost line, one more part names the subagents that ran above the session model and what that cost beyond running the same tokens on the session model:

```text
model-routing: 4 haiku, 3 opus - API $4.10 vs $1.94 at parent, above session: 3 opus (+$2.16)
```

The amount is the measured `actual - atParent` of those subagents. Nothing is printed when none ran above the session model, or when `aboveSession` is `"off"`. Two labels can follow:

- `(exempt not applied)` - the cost line cannot see agent types yet, so with a non-empty `exempt` it prints the count only, with no amount.
- `(config not read)` - the mod could not read the config location, so the defaults apply, including `"warn"`.

**The hook notice.** When an `Agent` or `Task` dispatch is recorded, the dispatch counter hook (a PostToolUse hook) prints this, with no amount:

```text
model-routing: <agent> ran on <model>, above the session model <session model>. This may cost more than planned.
```

It is emitted as JSON carrying the text in both `systemMessage` and `additionalContext`. Which of the two reaches you in the Claude Code UI has not been verified here. Both carry the same text, and `exempt` and `"off"` apply to the notice the same way.

## What it does not do

Nothing is blocked and nothing is dispatched or re-dispatched. The plugin only reports.
