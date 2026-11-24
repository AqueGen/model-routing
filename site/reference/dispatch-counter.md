# Dispatch counter

Every Agent dispatch is logged by a PostToolUse hook (agent name, model, the
`effort` param when the dispatch passed one, the session model, and the session effort level - nothing else) to
`<config>/model-routing/dispatches.jsonl`, self-pruned to 30 days. Stats show
how much work routing actually kept off your session model - real counts, not
invented dollar savings:

```text
/model-routing:stats
# in-chat report: per-agent dispatch breakdown + real token volume per model
# also flags "tier leaks" - bare dispatches of an agent type carrying no
# pin this plugin knows, which inherit a strong session model unless the
# agent pins one itself; the count is descriptive, not a verdict. Counted only
# where the session model is recorded AND rankable - the rest is left out
# and declared, because "did this inherit something strong" has no answer
# for a session nothing can rank

/model-routing:stats --days 1
# today's slice; --days N sizes the window (default 7)

/model-routing:stats --days 7 --ago 7
# the week before last week's end - before/after comparison when you
# tune routing (dispatch history reaches 30 days back; token history as
# far as Claude Code keeps transcripts)

/model-routing:stats --session fable
# only sessions that ran on your default model - useful when a
# fallbackModel ladder or manual /model switches mix tiers into one
# window and you want the numbers for your normal setup
```

```text
node "<plugin>/hooks/dispatch-counter.mjs" stats
# routed-down: 14 today · 92 7d  (one-liner for status lines)

node "<plugin>/hooks/dispatch-counter.mjs" tokens
# token volume per model from subagent transcripts (7d), with the share
# that ran BELOW its own session's model - fable days and opus days are
# each judged against their own baseline
```

Coverage note: dispatch counts see Agent-tool dispatches only (the hook
matches `Agent|Task`); Workflow-spawned agents never pass through that
tool, so they are invisible to the dispatch report - but `tokens` reads
their transcripts (nested under `subagents/workflows/`) and counts their
volume against the parent session like any other subagent.

### Below-pin dispatches

An agent pin is a ceiling AND a floor. The ceiling is documented above: when the pin sits over your session model, cap the dispatch at the session model. The floor is the other half - the pin states how much reasoning the ROLE needs, so `reviewer` dispatched with `model=haiku` is not a cheaper review, it is a weaker one, and a missed bug costs more than the review did.

The report calls these out because every other figure counts them as wins: they genuinely ran on a lower tier than the session, so they pad the routed-down percentage while breaking the thing they were routed for.

```text
4 of the cheaper ones went BELOW their agent's own pin, which is not a saving - the pin is the tier the role needs, and nothing about the session required going under it.

Ran BELOW the agent's pin (counted cheaper above, but the role was undercut - drop the model= override, or use an agent whose pin matches the work):
   3  model-routing:reviewer (model=haiku, pin=opus)
   1  model-routing:implementer (model=haiku, pin=sonnet)
```

The floor is `min(pin, session model)`, not the pin, so capping at a cheaper session is never flagged - `reviewer` running sonnet on a sonnet session is the rule being followed, not broken. A dispatch whose session model cannot be read is not flagged either: without it the cap is unknowable, and the same dispatch might have been correct. Unpinned agent types have no floor. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is excluded too: it overrides every pin at once, which is a deliberate machine-wide setting rather than a per-dispatch decision, and the `forced=` rows already say so. A plain `CLAUDE_CODE_SUBAGENT_MODEL` is only a default below the pin, so it can never put a pinned agent under its pin at all.

If the cheap tier really was right for that work, the fix is to pick an agent whose pin matches it - `test-runner` and `verifier` pin haiku for exactly that reason - rather than to override a role agent downward.

### The effort line

`report` also prints how many dispatches ran on an agent type carrying no effort pin and passed no `effort` param, and therefore inherited whatever the session was set to. That is the failure a tier-only report scores as a win: a mechanical errand sent to `general-purpose` with `model=sonnet` still thinks as hard as your session does, while `scout` would have run the same errand at `low`.

Dispatches that passed an `effort` param are listed on their own line, for example `Passed an effort param: 1 model-routing:reviewer effort=high`. Only the five documented levels count, and a `fork` never does, because the Agent tool ignores `effort` for a fork. Entries logged before the hook recorded the param cannot show whether one was passed, and the line says so for them.

Effort is reconstructed rather than observed, because transcripts do not record it. The sources are read in the order Claude Code applies them: `CLAUDE_CODE_EFFORT_LEVEL` first (the only place `max` is accepted), then the level saved for the model in `modelSettings` or, failing that, an `effortLevel` from the settings cascade (local, then project, then user - these accept `low`/`medium`/`high`/`xhigh` only), then the documented model default described in [the effort ladder](/how-it-works/model-tiers). Levels that came from that last rung are counted separately in the report, so an inferred default never reads as a setting somebody chose, and a level the session model does not support is recorded as the one Claude Code falls back to instead. Two cases contribute nothing to the line rather than a guess: a session on a model the docs give no effort support, and a session whose model could not be read at all, since the same configured level means different things on different models.

The line states its limits rather than hiding them, and there are more than the sources suggest. Four documented states override the reconstruction and none of them are visible to a hook: a `/effort` or `--effort` choice made inside a running session, ultracode (which sends `xhigh`), an organization effort cap, and a per-model `maxEffortLevel` cap. Only the pins of the bundled agents are known here too - an agent from another plugin may pin its own effort and will still be counted as inheriting. Read the figure as what the visible sources resolve to, not as a measurement.

### The by-agent section

`report` counts dispatches; `tokens` weighs them. A dispatch is one line in a log whether it processed four thousand tokens or four million, so a count-based warning ranks by how often something happened and never by how much it cost. `tokens` closes that gap by naming the agent behind each slice of volume:

```text
By agent - which role processed the volume:
   304.0M (49%)  model-routing:implementer  24 agents on sonnet-5, opus-5
    59.8M (10%)  model-routing:reviewer     28 agents on sonnet-5, fable-5, opus-5
     15.3M (2%)  codex:codex-rescue         11 agents on sonnet-5
  Below the agent's own pin: 49.6M (8% of the volume seen here) - model-routing:reviewer 40.1M, model-routing:scout 9.5M.
  Inherited the session model bare: 1.8M (0% of the volume seen here) - Explore 1.7M, claude 86k, general-purpose 73k.
```

The two callout lines above are the same two problems the dispatch report flags, now with a size beside them. A third line, printed only when it applies, names agent and model pairs that ran below the session tier yet priced above the same tokens on the session model - this was opus-class work dispatched from a Fable 5.1 session on Opus 5, where cache reads cost twice the session rate; on Opus 5.5 that no longer happens, since it reads cache cheaper than Fable 5.1 and at the same rate as Fable 5.2. Both verdicts are re-derived from the model each transcript ACTUALLY ran on, which is the one thing this side of the report has and the dispatch log does not: an override the harness declined and a fallback mid-run both reach the usage lines, while the log can only ever record what was asked for.

Neither report is the authority on everything, and it is worth knowing which half each one owns. **What model ran, and how much it processed** - only the transcripts know that; the log records a request. **What was asked for** - only the log knows that; it records the request. Both sides now stamp the session at dispatch time: the log writes the model it is on when the dispatch fires, and this side matches the agent's sidecar `toolUseId` back to the assistant line that dispatched it and takes that line's model, falling back to the model in effect at the agent's launch and then to the transcript head only when no such line can be found. So a below-pin verdict here is measured on the agent's side and read from the dispatching line on the session's, and a mid-session `/model` switch moves both reports together. Read a disagreement as each report describing the half it can see.

Inheritance is tested by model identity, not by tier. An agent from another plugin can pin a SIBLING of your session model - opus-4.8 under an opus-5 session - and a tier comparison cannot tell that from inheritance, which is the same false positive one tier up. The session model it compares against is the one the dispatching assistant line names, so a mid-session switch or a quota fallback carries the test with it; the only agents left unresolved are those whose dispatching line cannot be found at all, which fall back to the model in effect at launch and then to the transcript head.

What identity does not fix, and nothing on this side can, is a foreign agent whose frontmatter pins EXACTLY your session model. It ran opus on an opus session because it was told to, and that is byte-identical to having inherited it. Such an agent is counted here. The rule that survives is narrower than "foreign pins drop out": a foreign pin CHEAPER than the session drops out of this section, a foreign pin equal to it cannot.

One limit belongs to this side rather than the other: `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` reaches the usage lines indistinguishably from a pin, so a machine forcing every subagent to haiku puts a pinned agent's volume under "below the pin" here, while the dispatch report excludes forced dispatches on purpose - there the remedy is unsetting one variable, not fixing one dispatch. The volume is right either way; only the remedy printed beside it belongs to the other report.

That difference is how this got noticed. In one window, the dispatch report flagged 18 bare dispatches as tier leaks, 35%; 11 of them were `codex:codex-rescue`, an agent from another plugin whose own frontmatter pins sonnet. The dispatch log could not see that pin, so it had to allow that they inherited opus. The transcripts showed they did not: an agent whose usage lines all name sonnet did not bill opus, whatever the log had to allow. Measured leaked volume was 1.8M of 621M - the count said "act on this", the volume said "there is nothing here".

Two limits on that, because it is the argument this section rests on. The join is between two populations, not two event streams - the dispatch log carries no agent id, so "11 bare rows, 11 sonnet transcripts" is a match of sets and not of events. And what the transcripts refute is the SPEND, not the cause: a dispatch can be logically bare and still run something cheap because of a fallback or a machine-wide override. For the question anyone actually asks a cost report - was expensive money spent here - that is enough. For "why did it run what it ran", it is not.

### Foreign agents this plugin already knows

`codex:codex-rescue` was fixed at the source rather than left as a footnote. `pinnedModel()` in `dispatch-counter.mjs`, which `report` resolves every agent's pin through, now checks a second table beside the bundled one: `FOREIGN_AGENT_PINS`, a small hand-curated map of other plugins' agents to the model their own frontmatter pins - `codex:codex-rescue` to sonnet, two caveman agents to haiku. Nothing here reads another plugin's files at runtime; each entry is added by hand, the same way `AGENT_PINS` is, after that exact agent is seen causing this exact false positive. There is no effort column - an agent's effort pin is not visible from outside its own plugin, so the effort line's stated limits are unchanged. (`tokens` deliberately does NOT resolve through this same function - see below.)

Once an agent is in the table, `report` treats it exactly like a bundled one: a bare dispatch routes down on the strength of its own pin instead of counting as an unresolved leak, and a dispatch that overrides it to something cheaper still gets called out as undercutting the role, the same as an overridden `reviewer` would. Measured on one frozen log snapshot, before and after, with nothing else different: tier leaks went from 14 of 114 (12%) to 8 of 107 (7%) - the denominator shrinks because three specific agent types left the "we don't know" population entirely, not because anything else changed. (An earlier draft of this section quoted two numbers pulled from a live, still-growing log at different points in the day - 18 of 51 against 8 of 105 - which compared two different windows, not a controlled before/after. That was wrong and is corrected here.)

`report` and `tokens` do NOT treat it the same way, and the difference is deliberate. `report` never measures anything - it trusts AGENT_PINS the same way it now trusts FOREIGN_AGENT_PINS, both unverifiable at report time, so extending that trust to a curated foreign entry costs it nothing it did not already have. `tokens` is the side that reads what a subagent actually ran, and its two callouts - below the agent's pin, inherited the session model bare - stay measurement-only: they consult AGENT_PINS, never FOREIGN_AGENT_PINS. A curated pin that goes stale (upstream changes it, or it was guessed wrong) would otherwise silently and permanently blind `tokens`' bare-inheritance detector for that exact agent, for good - the opposite of what building a measured side was for. So a `FOREIGN_AGENT_PINS` agent still gets flagged by `tokens` if it genuinely inherits the session model, and still shows up as plain, unremarkable volume if it runs anything else - `tokens` simply does not know or claim to know its floor.

The table stays deliberately small and reactive. Discovering every installed plugin's agents at runtime would mean walking `~/.claude/plugins/cache` on every report, coupling this plugin to a cache layout it does not own, for agents that may never once be dispatched bare in your logs. Add an entry when a specific foreign agent is actually the thing producing noise in your window - not preemptively for every plugin that might.

Attribution comes from `agent-<id>.meta.json`, the sidecar Claude Code writes beside every subagent transcript, which names the agent type the usage lines omit. It is not a documented interface, so every field is treated as optional: a sidecar that is missing, unreadable, or names no type drops its transcript out of this section only, and the count of those is printed - including when it is ALL of them, which is the case most worth announcing, since it means the file moved or changed name. Every other total in the report is computed from the transcripts alone and is unaffected. Per-subagent token accounting has been [requested and closed as not planned](https://github.com/anthropics/claude-code/issues/22625) upstream, and `/usage` attributes to subagents as a category share of your plan limits rather than per agent type, so the sidecar is currently the only route to this.

### The cost line

`tokens` also prices the volume it just counted, because tokens need translating and dollars do not. Sample output - the window rolls daily, so your figures will differ:

```text
At API list prices (rates as of 2026-09-09), this is what the volume above would have cost on the Claude API:
  as it ran                                             $2,380
  had every subagent inherited its session model        $4,417
  difference                                            $2,037
  main sessions, same rates (not routable)             $15,599
```

Read it as a counterfactual, which is exactly what it is: on a subscription you pay none of this, and the difference carries the same assumption as the volume figures above - that every subagent would otherwise have inherited the session model, which agents pinned by other plugins would not.

The arithmetic is per token type rather than per token, because they are priced an order of magnitude apart: base input at the model rate, cache reads at 0.05x on Opus 5.5 and Sonnet 5.5, 0.025x on Fable and Mythos 5.2 and 5.1, 0.1x elsewhere, five-minute cache writes at 1.25x, one-hour writes at 2x, and output at its own rate. Haiku 5.5 prices each request on its own card: above 100K prompt tokens, cache reads and writes included, the whole request bills at $0.50/$2.50 instead of $0.10/$0.50. Cache reads dominate real transcripts, so a flat volume multiply would overstate the bill several times over. Transcripts break cache writes down by TTL; a line carrying only a total is charged at the cheaper five-minute rate.

Several documented modifiers push these figures DOWNWARD, so treat them as conservative rather than optimistic. Models from Opus 4.7, Sonnet 5 and Fable 5 onward use a tokenizer producing roughly 30% more tokens for the same text than Sonnet 4.6 and earlier, so re-pricing a cheap model's token count at an expensive model's rate understates what that work would really have cost there. Nothing in a usage line reveals whether fast mode (double rates on Fable 5.2, Mythos 5.2, Opus 5.5, Opus 5 and Opus 4.8) or US-only inference (1.1x from 4.6 onward) applied, so neither is added. And a model absent from the price table is excluded from every figure and declared on its own line, never counted as free - a window where nothing can be priced prints that declaration instead of figures, because silence would read as "this cost nothing".

The rates are first-party Claude API list prices; Bedrock and Google Cloud bill separately and are not modelled.

Prices are transcribed from the Anthropic pricing page and stamped with the date, which is printed beside the figure. One model on that table changes rate on a calendar date, so a window is priced at the rates in effect at its end rather than at today's. Before quoting a number anywhere, check the stamp against the [current page](https://platform.claude.com/docs/en/about-claude/pricing).

Embed the one-liner in your status line by appending the command's output
to whatever your `statusLine.command` already prints. Delete the `.jsonl`
any time to reset; a missing file just means zero.

Smoke tests for the counter: `node --test hooks/dispatch-counter.test.mjs`. The cost line above the prompt has its own test, `hooks/band.test.ts`, which runs only under `claude plugin test .`; CI has no Claude Code CLI, so run it locally before changing `hooks/register.mjs` or `hooks/lib/`.
