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
| cost / wall clock per run | $0.310 / 32s | $0.136 / 11s | +$0.174 / +21s |

Two things are true at once and both matter. The guidance does change what the
session does, cleanly and every time - the arms separate perfectly, and the
baseline had `Explore` available and still chose to grep inline. That is the
control-group number the README did not have.

And on this fixture the change is a net loss: same answer, 2.3x the money, 3x
the wall clock. The plugin's own anchor says a dispatch costs more than the
answer for anything trivial, and four files is trivial - so the honest reading
is that the routing fired where its own rule says it should not have. What the
fixture cannot show is the other side of the trade: delegation exists to keep
file contents out of the main context, and a four-file project has no context
worth protecting.

So the next case wants a fixture big enough that reading it inline actually
floods the session - that is where the trade is supposed to pay - and the case
after that wants the mirror of this one: a genuinely trivial question, where
dispatching at all is the failure being measured.

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
