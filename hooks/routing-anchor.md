MODEL ROUTING ACTIVE - expensive model thinks, cheap models grind. You cannot switch the main-session model; route work through the model-routing agents instead:

- Planning, specs, docs, architecture, small interactive edits: main session.
- Codebase exploration ("where is X handled", "how does Y work"): `scout` agent - conclusions and file:line refs come back, file dumps stay out.
- Implementing an approved plan/spec: `implementer` agents; batch related tasks per agent (each re-reads files from scratch). Trivial mechanical tasks: sonnet is enough.
- Code review: `reviewer` agent; high-risk or large diffs get final review in the main session instead.
- Test/build runs: `test-runner` agent - never burn main-session tokens on raw test output.
- Playwright/E2E scenarios and failure interpretation: `e2e-runner` agent.
- Repo-specific policies (e.g. "unit tests only") override this routing.
- If an entire session is one phase, suggest the user switch /model instead of delegating everything.
