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

## The open problem

With the allowlist in place the answer comes back **wrong** - on haiku and on
opus alike, one dispatch and no way to check the result. A configuration that is
cheap and wrong has saved nothing, so the tier comparison cannot be run until
the case can produce correct answers.

Two candidate fixes, untested:

- Let the main session dispatch repeatedly and verify through further dispatches
  rather than by reading. That is closer to what a real delegating session does
  and may just need a longer `max_turns` plus a system prompt that says to check
  the subagent's answer.
- Put the verification burden on the grader instead: score the subagent's report
  rather than the main session's final message.

The first is the honest one. The second measures a different thing.

## Also open

`scout` is still pinned sonnet, as it ships. The wide case says haiku is 9%
cheaper on that workload with correctness held; that is one workload, and the
quality case that would justify re-pinning has not been written.
