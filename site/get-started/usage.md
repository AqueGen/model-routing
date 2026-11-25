# Usage

The agents show up as regular subagent types. The plugin does not make
Claude delegate; ask for a subagent, or let a skill dispatch one, and the
skill routes it:

- "Have a subagent find the webhook retry logic" - Claude dispatches
  `scout` (sonnet); you get the answer with file:line refs, not a pile of
  file contents in your context.
- "Run the unit tests in a subagent" - Claude dispatches `test-runner`
  (haiku); you get a compact pass/fail report instead of a wall of logs.
- "Dispatch tasks 1-3 from the plan" - Claude dispatches `implementer`
  (sonnet) with self-contained task descriptions; security, money,
  migration or concurrency work goes out with `model=opus`.
- "Get the diff reviewed by an agent" - Claude dispatches `reviewer`
  (opus). For high-risk diffs you can ask for review in the main session
  instead, since one expensive pass is cheaper than a missed bug. Per-task
  reviews inside a plan loop go to `task-reviewer` (sonnet).
- "Have an agent walk through the checkout flow in the browser" - Claude
  dispatches `e2e-runner` (sonnet).

The routing rules live in the `model-routing` skill and activate when
Claude dispatches work. Two rules worth knowing:

- **Batch small edits, not plan tasks.** Each subagent re-reads files from scratch, so ten one-line edits as ten agents cost more than one agent with ten edits. A plan task with its own verification step gets its own fresh agent: a long run re-reads its whole growing context every turn. Over 30 days of one user's transcripts, the heaviest tenth of implementer runs took 60% of implementer cost.
- **Repo policies win.** If your project says "never run integration
  tests", the runner respects it.

To have the plugin enforce cheaper tiers instead of only advising them, pick a mode in the band above the prompt; see [Routing modes](/guides/routing-modes).
