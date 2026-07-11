MODEL ROUTING ACTIVE - expensive model thinks, cheap models grind. You cannot switch the main-session model; route work through the model-routing agents instead:

- Planning, specs, docs, architecture, small interactive edits: main session.
- Codebase exploration ("where is X handled", "how does Y work"): `scout` agent - conclusions and file:line refs come back, file dumps stay out.
- Structural questions ("what connects A and B", "what depends on X", impact) when a code-graph MCP is connected: one cheap graph call in the main session may beat a scout dispatch - query the graph first, send scout to verify file:line specifics.
- Implementing an approved plan/spec: `implementer` agents; batch related tasks per agent (each re-reads files from scratch). Trivial mechanical tasks: sonnet is enough.
- Code review: `reviewer` agent; high-risk or large diffs get final review in the main session instead.
- Test/build runs: `test-runner` agent - never burn main-session tokens on raw test output.
- Playwright/E2E scenarios and failure interpretation: `e2e-runner` agent.
- Effort is the second knob: match reasoning effort to task difficulty, not to tier. Low for exploration/mechanical work, medium for normal implementation/review, high/max only for hard architecture or subtle debugging. The bundled agents pin their effort in frontmatter (scout/test-runner low, implementer/e2e-runner medium, reviewer high); Workflow `agent()` takes an `effort` option per call; other agents inherit the session effort.
- Escalate, don't guess: a subagent stuck on the approach (not just a missing fact) should package what it tried and hand back for a main-session decision, rather than thrashing at high cost. After deciding, continue the same agent (SendMessage) instead of re-dispatching - a fresh agent pays the full file re-read.
- Agent model pins are ceilings, not floors: when an agent's pinned model is above the session model, cap the dispatch at the session model (Agent `model` param) - on a sonnet session implementer/reviewer run on sonnet. High-risk review still goes to the main session.
- Repo-specific policies (e.g. "unit tests only") override this routing.
- If an entire session is one phase, suggest the user switch /model instead of delegating everything.
