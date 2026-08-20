# forced-dispatch-tier - unfinished, do not read numbers off it yet

## What it is for

The unforced cases cannot answer "is delegating at the session tier - what
Superpowers does by default - more expensive than delegating at a lower one",
because whether a session delegates at all is a coin it flips: observed 3/3,
3/3, 2/3, 2/3 and 0/3 across otherwise identical batches. This case takes the
decision away and holds everything else identical to
`traces-a-flow-end-to-end`, so the only variable left is the subagent's tier.

Intended configurations, same prompt and follow-ups throughout:

| Configuration | What it stands for |
| --- | --- |
| no plugin, unforced (already measured, $1.359) | ordinary work, no delegation |
| no plugin, forced | subagent inherits the session model - Superpowers |
| plugin, `scout` pinned sonnet | what ships today |
| plugin, `scout` pinned haiku | the change the wide case argues for |

## Where it stands

Isolation works and took three attempts. Every attempt is worth knowing about,
because each looked like it had worked:

1. Asking in the system prompt: the session read the files anyway.
2. Denying `Read`, `Grep`, `Glob`: the session read the whole codebase through
   Bash instead - `cat`, `grep -n`, `sed -n`. Three opus runs were spent before
   the tool census showed it, and their cost figures were meaningless.
3. Denying the shells too: the session pulled a deferred `Read` back in through
   `ToolSearch`.
4. An allowlist (`tools: [Task, Agent, TodoWrite]`) holds. Nothing to read with,
   nothing to recover.

The `main-session-read-nothing` grader now covers the shells and is the thing to
check before believing any cost number from this case.

## The open problem, and the wrong diagnosis it was first given

With the allowlist in place the answers come back **wrong**, on haiku and on opus
alike. This was first written up as "one dispatch and no way to check the result",
i.e. as evidence that forcing delegation costs quality. That was wrong, and the
`subagent-answer-quality` case is what exposed it: **`--tools` propagates to
subagents**. The allowlist did not merely stop the main session from reading - it
starved `scout` of file tools too, so the dispatches came back with nothing and
the main session correctly refused to invent an answer. One transcript says so in
as many words: "two scout runs returned zero real tool executions".

So the isolation problem is worse than attempt 4 suggested. Every mechanism tried
so far either fails to stop the main session or disables the subagent as well:

| Mechanism | Main session stopped | Subagent still able to read |
| --- | --- | --- |
| System-prompt request | no | yes |
| Deny Read/Grep/Glob | no - moves to Bash | untested |
| Deny the shells too | no - ToolSearch reloads Read | apparently not |
| `--tools` allowlist | yes | **no** |

What is needed is a per-session tool restriction that does not reach the agents
that session dispatches, and nothing tried yet does that. Candidates, untested:
a settings-file `permissions.deny` passed with `--settings` (deny rules may scope
differently from `--tools`), or accepting main-session reads and instead pricing
the arms by which model did the reading, from the per-model split the runner
already prints.

Until then this case cannot price delegation at the session tier, and the
Superpowers-by-default question stays open.

## Also open

`scout` is still pinned sonnet, as it ships. The wide case says haiku is 9%
cheaper on that workload with correctness held; that is one workload, and the
quality case that would justify re-pinning has not been written.
