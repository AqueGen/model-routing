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

So the next case wants a fixture big enough that reading it inline actually
floods the session, and a multi-turn prompt so the saved context gets re-read at
least once. The case after that wants the mirror of this one: a genuinely
trivial question, where dispatching at all is the failure being measured.

## Writing another case

`evals/<case>/prompt.md` carries the prompt in its body and its settings in
frontmatter; `evals/<case>/graders/<name>.md` carries one grader each, its type
and pattern in frontmatter and its reasoning in the body - the body is for the
next person, who needs to know why a grader is worth having and what it cannot
tell them. `run-local.mjs` supports `type: regex` over `target: trace` and
`target: last_message`; the real harness additionally has `tool_used`,
`tool_order`, `file_exists`, `llm`, and `baseline`. Prefer the deterministic
ones: a judge model scoring prose is one more thing that can be wrong.

Cases share one fixture, `evals/fixtures/mini-app`. Keep it boring. A fixture
that is interesting to read is a fixture the model answers from memory of
something similar.
