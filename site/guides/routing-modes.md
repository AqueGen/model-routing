# Routing modes

Routing modes let you pick how hard the plugin holds subagents to cheaper models. The skill already advises Claude which tier to use; a mode turns that advice into a check that runs before every `Agent` or `Task` dispatch and refuses what the mode does not allow. The refusal names what was missing, Claude fixes the dispatch and sends it again. The plugin itself never dispatches anything.

The mode is one setting per machine: it lives in `config.json` and applies to every session at its next dispatch. The default is `quality`, which keeps the plugin's behaviour from before modes existed, so nothing changes until you pick another mode.

Agents are matched by the part of their name after the last colon, so the rules for `reviewer` and `implementer` cover an agent with that name from any plugin.

## What each mode means

### quality

The plugin advises and does not hold back. Any agent may run on opus without a reason. A bare `general-purpose` or `Explore` dispatch is handled by your `bareDispatch` setting as before: warned about by default, refused with `"deny"`. A [redirect](#redirect) you configured is enforced too.

Use it when the result matters more than the bill, for a hard debugging day, or while you are trying the plugin out.

### balanced

Opus stays available, but each use needs a stated reason:

- `implementer`, `general-purpose` or `Explore` on opus need an `[opus: ...]` [tag](#stating-a-reason-tags);
- a `general-purpose` or `Explore` dispatch without `model` is refused when it would inherit a model above sonnet (above haiku for `Explore`), so it does not silently run on an expensive session model; `bareDispatch: "off"` turns this check off;
- `reviewer` with model `sonnet` or `haiku` is refused when the session runs on a higher model (on an opus session a sonnet `reviewer` is refused; on a sonnet session it is fine).

Use it for everyday work on a strong session model.

### economy

Everything in `balanced`, and the opus `reviewer` is kept for the final branch review: a `reviewer` dispatch needs `[final]`, and per-task reviews go to `task-reviewer` (sonnet).

Use it when many runs go in parallel, or the weekly limit is getting close.

### strict

Everything in `economy`, and opus is allowed only for work where a mistake costs more than the tokens: `[opus: security]`, `[opus: money]` or `[opus: migration]`. `[opus: retry]` and `[opus: concurrency]` are refused, so a weak sonnet result is retried on sonnet with a better brief.

Use it when the weekly limit is nearly used up.

### Summary

| | quality | balanced | economy | strict |
| --- | --- | --- | --- | --- |
| Opus on implementer, general-purpose, Explore | free | with any tag | with any tag | security, money, migration only |
| general-purpose / Explore without `model`, on a pricier session model | as `bareDispatch` | refused | refused | refused |
| reviewer on sonnet or haiku, below the session model | allowed | refused | refused | refused |
| reviewer without `[final]` | allowed | allowed | refused | refused |
| redirect | enforced | enforced | enforced | enforced |

Other agents (`task-reviewer`, `test-runner`, `scout`, `fork` and the like) are never refused by a mode, unless a `redirect` names them. The rule for every case is in [Configuration > Routing modes](/guides/configuration#routing-modes).

## Stating a reason: tags

Outside `quality`, an opus dispatch carries its reason as a tag in the dispatch description (the first 300 characters of the prompt count too):

| Tag | Meaning | Accepted in |
| --- | --- | --- |
| `[opus: security]`, `[opus: money]`, `[opus: migration]` | High-risk work where a mistake costs more than the tokens | balanced, economy, strict |
| `[opus: concurrency]` | Locking, races, ordering | balanced, economy |
| `[opus: retry]` | A sonnet attempt came back weak | balanced, economy |
| `[final]` | The final branch review by `reviewer` | needed in economy and strict |

A dispatch described as `[opus: migration] backfill order totals` with `model: "opus"` passes in every mode. `fix the login form` with `model: "opus"` is refused outside `quality` and goes out again on sonnet. The note the plugin adds at session start lists these tags, so Claude usually tags a justified opus dispatch on the first try; in `strict`, a retry or concurrency dispatch is still refused by design.

## The band

Two rows above the prompt show and switch the mode:

```text
routing [on]  [economy] [balanced] [strict] [quality]  [auto]
model-routing: 3 opus, 3 sonnet - API $4.58 vs $2.42 at parent - 5h 12% - week 41%
```

- `on` / `off` turns every check on this page off and back on, keeping the chosen mode.
- A mode button switches the mode at once; the next dispatch in every open session on the machine follows it.
- `auto` turns on the [auto-switch](#auto-switch).
- Row 2 is the session's cost line, then the Claude 5-hour and weekly limits. Each limit appears once a reading for it has arrived, so the 5-hour one can be missing while the weekly one shows.

The buttons write `config.json`; you can also edit the file by hand, see [Configuration](/guides/configuration).

### Where the band shows

| Where | Band | Mode checks |
| --- | --- | --- |
| Claude Code in a terminal (CLI) | yes | yes |
| VS Code extension | yes | yes |
| Claude desktop app | yes | yes |
| Claude mobile app | yes | yes |
| Headless runs (`claude -p`) | no, there is no prompt to draw above | yes, the mode from `config.json` applies |

To change the mode for scripted runs, edit `config.json` or press a button in any interactive session on the same machine.

## Auto-switch

With `auto` on, the mode follows the Claude weekly limit: from 80% it tightens to `economy`, from 90% to `strict`, and after the weekly reset it returns to the mode you picked. It only ever tightens, never loosens below your choice, never turns routing back on when you switched it off, and changes nothing until the session's first weekly reading has arrived.

## Redirect

`redirect` sends dispatches of one agent type to another, for example to your own implementer instead of this plugin's:

```json
{
  "mode": "economy",
  "redirect": { "model-routing:implementer": "implementer" }
}
```

A redirected dispatch is refused with `use implementer`, and Claude dispatches the target instead. Redirects apply in every mode while routing is on. A chain is followed to its end, and a chain that loops back redirects nothing.

## Fallback agents

`fallback` lists the agents a refused opus dispatch may go to instead, in the order you prefer them. Any subagent type works, including agents from other plugins:

```json
{
  "mode": "strict",
  "fallback": ["implementer", "codex:codex-rescue"]
}
```

When a mode refuses an opus `implementer`, `general-purpose` or `Explore` dispatch, the refusal ends with the list and Claude can pick one: a refused `general-purpose` gets `Or hand it to: implementer, codex:codex-rescue.`, a refused `implementer` gets `Or hand it to: codex:codex-rescue.`. The list leaves out any agent with the same name after the last colon as the refused one, and any agent that is itself redirected. Other refusals (redirect, reviewer, `[final]`, bare dispatch) do not mention it. With an empty list, refusals suggest sonnet only.
