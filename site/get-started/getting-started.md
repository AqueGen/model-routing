# Getting started

### Plain use

1. Pick your session model with `/model` (opus, fable, whatever your
   plan offers). The plugin never changes it - the main session is where
   planning and decisions happen, so give it the strongest tier you are
   willing to pay for. Session effort: left unset, you get Claude Code's
   per-model default - medium on Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5, xhigh on Opus 4.7, high on every
   other model that has the knob, and some models have no effort knob at all
   (see [the effort ladder](/how-it-works/model-tiers));
   The plugin adds no dispatches, so most work stays on this model: pick
   it for the hardest work the session itself does. The bundled agents
   pin their own effort either way.
2. Work normally. When work is dispatched - you ask for it, or a skill
   such as Superpowers does - it runs here:

   | Dispatched work | Who runs it | Model / effort |
   | --------------- | ----------- | -------------- |
   | Exploration ("where is X handled?") | `scout` | sonnet / low |
   | Breadth sweep ("list every stage this order goes through") | `surveyor` | haiku / medium |
   | Test or build run | `test-runner` | haiku / low |
   | Plan task | `implementer` | sonnet / medium (`model=opus` for security, money, migrations, concurrency or a retry) |
   | Diff review | `reviewer` | opus / high |
   | Per-task review in a plan loop | `task-reviewer` | sonnet / high |
   | Browser flow | `e2e-runner` | sonnet / medium |

### Superpowers flow (brainstorm - plan - execute)

Works with any plan-driven process (superpowers or similar):

1. Brainstorming and plan-writing stay in the main session on the
   strongest model - protecting this thinking is the point of the
   plugin.
2. Plan execution goes to `implementer`: one plan task with its own verification step per dispatch, one at a time. Small edits to the same files under one check share a dispatch (every fresh agent re-reads files from scratch); anything bigger gets a fresh agent (a long run re-reads its whole growing context every turn).
3. Verification the process asks for: test runs it dispatches go to
   `test-runner`, the loop's per-task reviews and scoped re-reviews to
   `task-reviewer` (sonnet), a completed chunk or branch review to
   `reviewer` (opus). For high-risk diffs you can also ask the main
   session to review them itself.

### "I don't want the expensive model"

Switch the session down: `/model opus` or `/model opusplan`. Tiers are
relative - "strongest" simply means your session model. Agent pins are
ceilings, not floors: when a pin sits above your session model, the
routing rules instruct Claude to cap the dispatch at the session model
(Agent `model` param) - on a `sonnet` session, `implementer` and
`reviewer` run on sonnet. Honesty note: the cap is a routing rule, not a
harness guarantee - a bare dispatch runs the frontmatter pin as-is. The
dispatch report has a dedicated "Ran ABOVE the session tier" section, so
a missed cap shows up as a number instead of hiding.
