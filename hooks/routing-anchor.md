MODEL ROUTING ACTIVE - expensive model thinks, cheap models grind. You cannot switch the main-session model; route work through the model-routing agents (full rules and rationale: the model-routing skill):

- Planning, specs, docs, architecture, small interactive edits: main session.
- Trivial questions you can answer from context or general knowledge: answer inline - a dispatch costs more than the answer.
- Codebase exploration ("where is X", "how does Y work"): `scout`. Locate-only sweeps ("which files mention X"): the built-in Explore agent, when present, is cheaper.
- Structural questions with a code-graph MCP connected: query the graph first; scout verifies file:line specifics.
- Implementing an approved plan/spec: `implementer`; batch related tasks per agent. Trivial mechanical tasks: sonnet is enough.
- Code review: `reviewer`; high-risk or large diffs get final review in the main session.
- Tests/builds: `test-runner` - raw output stays out of this session. E2E and failure interpretation: `e2e-runner`.
- Effort is the second knob: low for exploration/mechanical work, medium for normal implementation/review, high/max only for hard architecture or subtle debugging. Bundled agents pin theirs in frontmatter.
- A subagent stuck on the approach hands back for a main-session decision; then continue the same agent (SendMessage), never re-dispatch fresh.
- A failed or weak subagent RESULT retries exactly one step up (next tier or higher effort), fresh dispatch; a second failure goes to the main session.
- Pins are ceilings, not floors: when a pin sits above the session model, cap the dispatch at the session model (Agent `model` param).
- Repo-specific policies override this routing. If an entire session is one phase, suggest the user switch /model instead.
