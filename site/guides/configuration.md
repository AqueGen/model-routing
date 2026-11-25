# Configuration

One optional file controls the above-session warning and the bare-dispatch advice. It does not control pins - those stay in the agent files, see [Overriding pins](/guides/overriding-pins).

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
| `bareDispatch` | `"warn"`, `"deny"` or `"off"` | `"warn"` |
| `exempt` | list of agent type names | `[]` |
| `isOn` | `true` or `false` | `true` |
| `mode` | `"economy"`, `"balanced"`, `"strict"` or `"quality"` | `"quality"` |
| `manualMode` | same as `mode` | the value of `mode` |
| `autoSwitch` | `true` or `false` | `false` |
| `showStats` | `true` or `false`: show the Claude 5h and week figures in the band | `true` |
| `showCodex` | `true` or `false`: show the Codex figures in the band, and poll them | `true` |
| `redirect` | object, agent type to agent type | `{}` |

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

## Bare dispatches

A `general-purpose` or `Explore` dispatch with no `model` runs on the session model (on the Claude API, Explore is capped at opus). `bareDispatch` controls what the plugin does about that.

- `"warn"` (default) - the dispatch counter hook prints the advice below after the dispatch, in the same JSON shape as the hook notice.
- `"deny"` - a PreToolUse hook refuses the call before it runs, with the advice as the reason. The model is expected to re-issue the call with `model`. Nothing is re-dispatched by the plugin.
- `"off"` - nothing is said.

```text
model-routing: a bare <agent> dispatch runs on <inherited model>. Pass model "<suggested>" for ordinary work, or "<inherited family>" when the task needs that reasoning.
```

The inherited model is the session model, or, on the Claude API, opus for an Explore on a session above opus. The second option names its family (`opus`, `fable`, `sonnet`, `haiku`) because the Agent tool's `model` param takes family aliases; for a model outside those families it is left out.

The suggested model is `sonnet` for `general-purpose` and `haiku` for `Explore`. The advice fires only when all of these hold:

- the agent type is `general-purpose` or `Explore` and the call has no `model`;
- the model it would inherit is a higher tier than the suggested one, so a Sonnet or Haiku session gets nothing for `general-purpose`, and a Haiku session nothing for `Explore`;
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is not set;
- for `general-purpose`, `CLAUDE_CODE_SUBAGENT_MODEL` is unset or `inherit` (when it names a model, that model already applies; Explore is not moved by it);
- the agent type is not in `exempt`;
- the session model can be read from the transcript and is recognized.

## Routing modes

A PreToolUse hook on `Agent` and `Task` applies the `mode` to every dispatch and refuses what the mode forbids, with a reason starting `model-routing:` that names the tag which would allow it. `isOn: false` switches every rule on this page off, including the `bareDispatch` deny. The default mode is `quality`: with no config file the hook behaves as before this feature, and the tags below matter only in `balanced`, `economy` and `strict`.

Agent names are compared by the part after the last colon, so `reviewer` covers `model-routing:reviewer`; a `redirect` key with a colon matches that exact agent type. "Opus tier" means `model` is `opus` or `fable`. Tags are read, case-insensitively, from the description plus the first 300 characters of the prompt.

| Case | quality | balanced | economy | strict |
| --- | --- | --- | --- | --- |
| `redirect` has the agent | deny, use the target | deny | deny | deny |
| `reviewer` with model `sonnet` or `haiku`, when the session model is known and higher than that model | allow | deny | deny | deny |
| `implementer`, `general-purpose` or `Explore` on the opus tier, no tag | allow | deny | deny | deny |
| the same with `[opus: retry]` or `[opus: concurrency]` | allow | allow | allow | deny, use Codex or sonnet with a fixed brief |
| the same with `[opus: security]`, `[opus: money]` or `[opus: migration]` | allow | allow | allow | allow |
| `general-purpose` or `Explore` with no `model` | as `bareDispatch` | deny | deny | deny |
| `reviewer` without `[final]` | allow | allow | deny | deny |
| anything else (`fork`, `pre-push-reviewer`, `ui-reviewer`, ...) | allow | allow | allow | allow |

The bare-dispatch rows deny only when the inherited model is a higher tier than the suggested one, with the conditions listed under Bare dispatches. `bareDispatch: "off"` wins in every mode. `general-purpose` and `Explore` are matched by the part after the last colon. A `redirect` chain (`a` to `b`, `b` to `c`) is followed to its end; a chain that leads back to an agent already on it, its own key included, redirects nothing.

## The band

The mod draws two rows above the prompt on every surface. Row 1 is the controls, row 2 is the cost line with the limits appended:

```text
routing [on]  [economy] [balanced] [strict] [quality]  [auto]
model-routing: 3 opus, 3 sonnet - API $4.58 vs $2.42 at parent - 5h 12% - week 41% - codex 3%/20%
```

Pressing a mode sets `mode` and `manualMode` and turns routing on. `on`/`off` flips `isOn`. `auto` flips `autoSwitch`. Each press writes `config.json`, keeping keys the mod does not own, and leaves a file that is not a JSON object untouched. Rendering never writes. `showStats` and `showCodex` have no buttons; edit them in `config.json`.

Row 2 is the cost line (see What it reports) followed by ` - `-separated limits. With `showStats`, `5h N%` and `week N%` appear once the session has reported that window. With `showCodex`, `codex N%/M%` (5h/week) appears once the Codex figures are read. With no cost line the row is the limits alone, and with nothing to show there is no row 2.

With `autoSwitch` on, the mode follows the Claude weekly limit: at 90% and above `strict`, at 80% and above `economy`, otherwise `manualMode`, and never looser than `manualMode`. It only runs while `isOn` is true and never turns routing back on. The check runs on every limit reading and after every press.

Codex limits come from the newest `~/.codex/sessions` logs (`hooks/codex-limits.mjs`, every 10 minutes, only while `showCodex` is true). `config.json` is re-read every minute. Timers start with an interactive session and survive `/clear` and resume.
## What it does not do

Nothing is dispatched or re-dispatched. Refusals come only from the modes above and from `bareDispatch: "deny"`.
