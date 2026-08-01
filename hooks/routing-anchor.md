MODEL ROUTING ACTIVE - expensive model thinks, cheap models grind. You cannot switch the main-session model; route through the model-routing agents (full rules and rationale: the model-routing skill):

- Planning, specs, docs, architecture, small interactive edits: main session.
- Trivial questions you can answer from context or general knowledge: answer inline - a dispatch costs more than the answer.
- Codebase exploration ("where is X", "how does Y work"): `scout`. Locate-only sweeps ("which files mention X"): the built-in Explore agent, when present, is cheaper.
- Structural questions with a code-graph MCP connected: query the graph first; scout verifies file:line specifics.
- Implementing an approved plan/spec: `implementer` (sonnet). Dispatch with `model=opus` for multi-file/cross-layer work, security/money/migrations/concurrency/public contracts, or a retry after a weak sonnet result - escalate when in doubt; the dispatch changes the model only, the pinned medium effort stays. Ambiguous task or unclear root cause: clarify first (main session / scout) - implementer stops on ambiguity. Batch related tasks per agent.
- Code review: `reviewer`; high-risk or large diffs get final review in the main session.
- Batched implementer output you will not read in full: gate with `verifier` - does the diff match the task. Gates another agent's diff, never the main session's own work (a current-generation model self-verifies).
- Tests/builds: `test-runner` - raw output stays out of this session. E2E and failure interpretation: `e2e-runner`.
- Effort is the second knob (low/medium/high/xhigh/max on current models; unset = high): low for mechanical work, medium for normal implementation, high for architecture/debugging/review, xhigh/max only for long-horizon or frontier work. Bundled agents pin theirs.
- A subagent stuck on the approach hands back for a decision; continue the same agent (SendMessage when available, else re-dispatch with its packaged state).
- A failed or weak subagent RESULT retries exactly one step up (next tier or higher effort), fresh dispatch; a second failure goes to the main session.
- Pins are ceilings, not floors: when a pin sits above the session model, cap the dispatch at the session model via the Agent `model` param. The pin alone does NOT cap - a bare dispatch runs the pinned model.
- Unpinned agents (general-purpose, custom types) silently inherit the session model - make the tier a conscious choice: explicit `model` for mechanical or exploratory work (sonnet; haiku for trivial sweeps), session tier only when the task needs that reasoning.
- Same rule inside Workflow scripts: every `agent()` call without `model`/`effort` opts inherits the session model at session effort - set them per call, cheap stages low, top tier only where the stage earns it.
- Repo-specific policies override this routing. If an entire session is one phase, suggest the user switch /model instead.
