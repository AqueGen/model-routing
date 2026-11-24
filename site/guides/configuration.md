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

An `exempt` entry without a colon matches the agent's name after the last colon, so `reviewer` matches `reviewer` and `model-routing:reviewer`. An entry with a colon matches only that exact agent type, so `other-plugin:reviewer` does not match `model-routing:reviewer`.

A missing, unreadable or invalid file means the defaults. A key with a wrong value falls back to its own default and the other key is still read.

The hook reads the file on every dispatch, so a change applies to the notice at the next dispatch. The cost line reads it once per session, so a change applies there from the next session.

## What it reports

A subagent is above the session when it ran on a higher tier than the session model. Two places say so.

**The cost line.** After the existing cost line, one more part names the subagents that ran above the session model and what that cost beyond running the same tokens on the session model:

```text
model-routing: 3 opus, 3 sonnet - API $4.58 vs $2.42 at parent, above session: 3 opus (+$2.16)
```

This example is built from the figures of a real Sonnet 5.5 session: the cost-line prefix was observed, and the above-session part is computed from it. The amount is the measured `actual - atParent` of those subagents, printed with its own sign. A higher tier is not always the dearer one when cache reads dominate (Opus 5.5 reads cache cheaper than Sonnet 4.6), so the amount can be negative, for example `(-$0.03)`. Nothing is printed when none ran above the session model, or when `aboveSession` is `"off"`. Two labels can follow:

- `(exempt not applied)` - the cost line cannot see agent types yet, so with a non-empty `exempt` it prints the count only, with no amount.
- `(config not read)` - the mod could not read the config location, so the defaults apply, including `"warn"`.

**The hook notice.** When an `Agent` or `Task` dispatch is recorded and the model it will run on can be inferred, the dispatch counter hook (a PostToolUse hook) prints this, with no amount. The hook infers the model from the `model` parameter, this plugin's agent pins, three curated foreign pins and `CLAUDE_CODE_SUBAGENT_MODEL`. The hook cannot see a frontmatter pin the plugin does not know (for example a user-level agent pinned to opus), so such an agent gets no notice, unless `CLAUDE_CODE_SUBAGENT_MODEL` names a model above the session model. Then the notice names that env model, which such a pin would override unless `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set; under `FORCE` the env model really runs, so the notice is right. A value of `inherit` counts as unset. The cost line reads real usage, so it counts every priced subagent that ran above a priced session model, notice or not. Nothing is compared when the session model is unpriced or unknown.

```text
model-routing: <agent> ran on <model>, above the session model <session model>. This may cost more than planned.
```

It is emitted as JSON carrying the text in both `systemMessage` and `additionalContext`. Which of the two reaches you in the Claude Code UI has not been verified here. Both carry the same text, and `exempt` and `"off"` apply to the notice the same way.

## What it does not do

Nothing is blocked and nothing is dispatched or re-dispatched. The plugin only reports.
