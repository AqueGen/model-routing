# Evals

The unit tests in `hooks/` cover the report: given a transcript, does the maths
come out right. They say nothing about the half of this plugin that is prose -
whether the routing guidance actually changes what a session does. That is what
these cases are for, and until they existed the README's admission that there is
no control group was simply true.

## The one thing that makes this a measurement

Every case runs twice: once with the plugin loaded, once without. A number from
the with-arm alone means nothing, because a capable model routes sensibly on its
own a fair share of the time. The delta between the arms is the claim.

`delegates-codebase-question` is scored on two graders both arms can genuinely
pass or fail - did the session hand the question to a subagent, and did the
answer come back right. A third grader checks that the with-arm picked `scout`
specifically; the baseline has no `scout` to pick, so read that one as an
indicator and never as a score.

## Running them

`claude plugin eval` is the harness these cases are written for:

```sh
claude plugin eval model-routing --ablation with-without
```

It is early access and gated per organization; on a machine where the gate is
closed it prints `` `plugin eval` is currently in early access `` and exits 1.
Until then, `run-local.mjs` reads the same case files and does the same two-arm
run through `claude -p`:

```sh
node evals/run-local.mjs --runs 3 --model opus
node evals/run-local.mjs --runs 1 --model haiku --arm without   # smoke test
```

The baseline arm is made plugin-free by dropping the user's own settings
(`--setting-sources ""`), since `enabledPlugins` is where a globally installed
copy of this plugin would otherwise sneak into both arms. Verify that in a trace
before trusting a run: the `system/init` event lists the available agents, and
the baseline's list must not contain any `model-routing:*` entry.

Runs are real sessions against the real API, so they cost real tokens. Traces
and an `aggregate.json` land in `evals/results/<timestamp>/`, which is
gitignored.

## The first result

Opus main session, 3 runs per arm, 2026-08-17:

| Grader | With | Without | Delta |
| --- | ---: | ---: | ---: |
| delegated to a subagent | 3/3 | 0/3 | +1.00 |
| answer is correct | 3/3 | 3/3 | 0.00 |
| scout was the agent (indicator) | 3/3 | 0/3 | - |

The guidance does change what the session does, cleanly and every time - the
arms separate perfectly, and the baseline is not a straw man: it had `Explore`
available and still chose to grep inline. That is the control-group number the
README did not have.

What it costs, per run, split by tier because the total hides the point:

| | With | Without |
| --- | ---: | ---: |
| opus (the expensive tier) | $0.140, 59k in | $0.135, 90k in |
| the subagent | sonnet-5 $0.065, 94k in | - |
| total | $0.206 | $0.136 |
| wall clock | 31s | 11s |

Opus cost is flat and opus read 34% fewer tokens: the file contents went to
sonnet instead, which is exactly the mechanism the plugin exists for, visible
even at this size. The whole increase in the total is the second model - you now
pay two models for a question one of them could answer alone.

On a four-file fixture that is overhead and nothing else. The plugin's own anchor
says a dispatch costs more than the answer for anything trivial, and four files
is trivial, so the routing fired where its own rule says it should not have.

The deeper limitation is structural, not a matter of fixture size: a `-p` run is
one shot. The 31k opus tokens that did not enter the main context have no later
turn to be re-read in, so the saving has nowhere to accumulate and the eval
measures the cost of delegation without the return. A real session re-reads its
context every turn, which is where the trade is supposed to flip. Any case
written here under-measures the plugin by construction, and a case that claims
otherwise is misreading its own numbers.

(First run of a batch pays a cold prompt cache - it came in at $0.518 against
$0.206 for the two that followed. The figures above are the two warm runs; the
cold one is in the traces.)

## The second case, and what it took to make the numbers mean something

`traces-a-flow-end-to-end` is the case that can answer "does this save money".
Three things had to be true before it could, and each one started out false:

**The question has to be wide.** A needle question is answered by one grep, and a
grep costs the same in any session. The fixture is a twelve-stage pipeline where
each stage hands off to exactly one other and no file states the order, so the
chain has to be walked - and the stage modules are fat, so walking it costs
something. The first fixture was four small files and could never have shown
anything.

**The session has to continue.** A single `-p` turn measures the cost of
delegating and none of the return. Follow-up turns (`followup-*.md`, run through
`--continue` in the same session) are where a main session pays again for the
context it carries: on one run the baseline re-wrote 80k of context to cache on
its third turn.

**The subagent's tier has to be cheap enough.** This is the one that decided the
result, and it is arithmetic rather than judgement. A fresh subagent pays cache
*write* for everything it reads; a main session pays cache *read* for what it
already has, and read is 12.5x cheaper than write at the same tier. Delegation
converts cheap re-reads into expensive first-reads, so only a large tier discount
pays for the conversion.

Opus main session, 4 turns, 3 runs per configuration. Per-run totals are shown
rather than only means, because with three runs a mean can hide an overlap:

| Configuration | opus | subagent | total per run |
| --- | ---: | ---: | --- |
| no plugin | $1.358 | - | $1.339 $1.382 $1.356 |
| `scout` pinned sonnet (shipped) | $1.169 | sonnet-5 $0.506 | $1.559 $1.998 $1.468 |
| `scout` pinned haiku | $1.042 | haiku-4.5 $0.198 | $1.142 $1.260 $1.315 |

Both configurations separate cleanly from the baseline, in opposite directions.
Every haiku run came in under the cheapest baseline run; every sonnet run came in
over the dearest. Correctness held at 3/3 throughout, and the plugin dispatched
exactly once per run - the follow-ups were answered from `scout`'s summary rather
than by dispatching again, which is what the guidance asks for.

So the shipped configuration costs 23% more than not having the plugin on this
workload, and pinning `scout` to haiku costs 9% less. The expensive tier drops
either way - opus down 14% with sonnet, 23% with haiku - which is the mechanism
working in both cases. What differs is whether the subagent's bill comes to less
than the saving it produces.

Two things this does not license. One case is no mandate to re-pin `scout`: this
question rewards breadth over judgement, haiku's answer quality on a subtle
question is untested, and a wrong answer that sends the main session back to
re-read is the expensive failure mode nothing here measures. And the largest
single line in every run is opus *output* tokens, $0.33 to $0.43, which no amount
of tier routing touches.

What the eval still cannot see is context-window pressure. Four turns never
compact; a real session does, and a compaction costs a full re-read plus lost
fidelity. That is a cost the baseline dodges here and would not dodge in
practice, so read these numbers as the floor of the plugin's case rather than the
whole of it.

## Writing another case

`evals/<case>/prompt.md` carries the prompt in its body and its settings in
frontmatter; `evals/<case>/graders/<name>.md` carries one grader each, its type
and pattern in frontmatter and its reasoning in the body - the body is for the
next person, who needs to know why a grader is worth having and what it cannot
tell them. `run-local.mjs` supports `type: regex` over `target: trace` and
`target: last_message`; the real harness additionally has `tool_used`,
`tool_order`, `file_exists`, `llm`, and `baseline`. Prefer the deterministic
ones: a judge model scoring prose is one more thing that can be wrong.

A case names its fixture directory under `evals/fixtures` with a `fixture:` key,
defaulting to `mini-app`. A fixture too large to commit ships as
`<name>.gen.mjs` beside it and is generated on first use - `order-service` is 85
modules and 122k of source, which nobody installing this plugin should have to
download. Keep fixtures boring: one that is interesting to read is one the model
answers from memory of something similar.

Add `followup-1.md`, `followup-2.md` and so on to turn a case into a session
rather than a single question. That is not decoration - it is the only way the
context a subagent kept out of the main session gets a chance to pay for itself.

## The comparison the wide case was answering, and the one it was not

The table above answers "should this session have delegated at all", and on a
wide-reading question the answer is no - delegating cost more than doing it
inline, on either pin. That is a real finding and it is not the question most
users are in.

The question most users are in is "the dispatch is happening anyway - Superpowers
dispatches, workflows dispatch, an unpinned agent inherits the session model - so
what does routing it down buy?" That arm has not been run: `forced-dispatch-tier`
exists for it and is blocked. What can be said without running it is arithmetic
on the token counts already measured, because the subagent's work is the same
work at a different price:

| | per run |
| --- | ---: |
| subagent tokens measured | 74k cache write, 451k cache read, 6k output |
| billed at sonnet-5 (what ran) | $0.506 |
| the same tokens at opus-5 rates | $0.844 |

Which gives, against the $1.169 the opus main session cost in that arm:

| | total |
| --- | ---: |
| no delegation | $1.359 |
| delegate, tier routed down | $1.675 |
| delegate, subagent inherits opus | $2.013 |

So routing is roughly a 17% discount on a dispatch that was going to happen, and
a 23% surcharge on one that did not need to. Both numbers belong in the README
and now are.

Two honest limits on the $2.013. It reprices measured tokens rather than
reporting a run, and a live opus subagent might well read less - fewer loops,
better first guesses - which would shrink the gap. The pricing model is not
guesswork though: applied to the sonnet arm it reproduces the billed $0.506 to
the cent, so the tier multiplier is right even if the token count would move.

## The third case, which stopped the re-pin

`subagent-answer-quality` exists because the wide case made haiku look like a
free 9%, and a tier that is cheaper on breadth is not therefore cheaper. It asks
`scout` two questions whose code contains a confident wrong answer:

- `withRetryIntake` loops `maxRetries` times, and `maxRetries` is 3. It also
  breaks the moment `error?.retryable === false`, and every stage error is built
  with `retryable: cause?.retryable ?? false`. So `validateOrder` is called
  **once**, and the file has a 3 sitting in it for anyone who reads one line.
- `applyTaxPolicy` looks up `TAX_POLICY[batch.outcome]` while the table is keyed
  `onWarn`, `onFatal`, `onTimeout`, `onUnknown`. An outcome of `"warn"` misses,
  falls through to `onUnknown: "abort"`, and returns **null** - not the
  `continue` that the `onWarn` row appears to promise. That mismatch is a real
  defect in the fixture and the question asks whether it was intended.

Three runs per tier, four deterministic graders, no judge model:

| Tier | Graders passed | Cost per run |
| --- | ---: | ---: |
| opus (reference, 1 run) | 4/4 | $0.715 |
| sonnet - the shipped pin | **12/12** | $0.212 |
| haiku | 11/12 | $0.103 |

haiku's miss was substantive, not formatting: it answered **3**, having read the
`maxRetries` line and not the loop. Once in three runs, on the question the
fixture was built to trap.

That settled the pin: it stays sonnet. Nine percent off the bill is not worth a
confidently wrong answer in a third of subtle questions, because the wrong answer
sends the main session back to read the files itself and that costs more than the
tier ever saved. What the two cases together do support is a routing rule rather
than a pin - breadth to haiku, judgement to sonnet - which is what the anchor and
the skill now say.

The case runs the tier directly with `agent: scout` in frontmatter, which makes
the session *be* `scout` and grades what comes back. That is the instrument this
question needed all along: no main session to argue with about whether it really
delegated, and no way for it to contaminate the result by reading.

## Next

The mirror of the small case: a genuinely trivial question, where dispatching at
all is the failure being measured. And `forced-dispatch-tier` still needs the fix
described in its NOTES.md before it can price delegation at the session tier -
the Superpowers-by-default question is still open.
