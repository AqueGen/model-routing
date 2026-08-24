---
description: Show model-routing stats - dispatches and real token volume kept off the session model. Args - --days N (window size, default 7), --ago M (shift window M days back), --session <family> (only sessions on that model, e.g. fable)
argument-hint: [--days N] [--ago M] [--session fable]
allowed-tools: Bash
---

Dispatch report:

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" report $ARGUMENTS 2>&1 || echo "model-routing: stats script failed - node 18+ must be on PATH"`

Real token volume (from subagent transcripts):

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-counter.mjs" tokens $ARGUMENTS 2>&1 || echo "model-routing: tokens script failed - node 18+ must be on PATH"`

If either block above is empty or shows a shell error (not a script message -
the script itself always explains empty data in words), the embedded shell run
failed silently. In that case run the two commands yourself through whatever
shell tool works in this session (`node <plugin>/hooks/dispatch-counter.mjs
report` and `... tokens`) and present those results instead.

Present both reports above to the user as-is in code blocks, then add 2-3
short sentences of interpretation: what share of dispatches and of token
volume stayed below the session model, how the per-session-model split
compares (e.g. fable sessions routing down more than opus sessions), and
anything that looks off (e.g. many subagents running AT the session tier).
Do not re-run the commands, no extra tables, no dollar estimates.

The two reports count different things, and where they disagree the token
one is the measurement. A dispatch row is one line in a log whether it cost
four thousand tokens or four million, while the "By agent" block in the
token report reads the model each subagent actually ran on. So when a
dispatch-side warning names an agent - a tier leak, or a dispatch below its
pin - carry its volume from that block into the sentence, and when the
volume is not there, say the count overstated it and name why the token
report saw it differently (most often an agent from another plugin pinning
its own model, which the dispatch log cannot see).
