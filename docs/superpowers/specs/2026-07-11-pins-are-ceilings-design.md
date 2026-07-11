# Pins are ceilings (0.4.1)

Date: 2026-07-11
Status: approved

## Goal

Fix the tier inversion: on a session model below an agent's pin (e.g.
sonnet session, opus-pinned implementer/reviewer), subagents cost more
than the main session. Agent pins become ceilings, not floors.

## Evidence

Verified 2026-07-11 in live dispatch: the Agent tool `model` param
overrides an agent's frontmatter pin (model-routing:implementer pinned
`opus` ran on `claude-haiku-4-5` when dispatched with `model: haiku`;
subagent transcript confirmed). The rule is therefore implementable as
pure routing text - no mechanism.

## Changes (text-only, +2 injected lines)

1. `hooks/routing-anchor.md`: new line before the "Repo-specific
   policies" line:
   "Agent model pins are ceilings, not floors: when an agent's pinned
   model is above the session model, cap the dispatch at the session
   model (Agent `model` param) - on a sonnet session implementer/
   reviewer run on sonnet. High-risk review still goes to the main
   session."
2. `skills/model-routing/SKILL.md` (Rules, after the re-ask bullet):
   same rule, one bullet: pins say "this task never needs more than X";
   the session model says what the user is willing to pay; cap at
   dispatch when the pin is higher.
3. `README.md`: rewrite the inversion paragraph in "I don't want the
   expensive model" - the routing now caps pins automatically; keep one
   line explaining the mechanic.
4. `CHANGELOG.md` entry + version bump to 0.4.1 in
   `.claude-plugin/plugin.json`.

## Behavior guarantees

- Session at or above the pin (fable/opus): nothing changes; equal-tier
  pins are kept (implementer opus on opus session stays opus).
- Session below the pin: dispatch capped at session model - subagent
  never costs more per token than the session the user chose.
- High-risk review continues to escalate to the main session regardless.
