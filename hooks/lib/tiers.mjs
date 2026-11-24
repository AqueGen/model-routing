// Tier ladder shared by dispatch judging and the tokens report. Returns null
// for models it does not recognize (a future model family) - callers must
// treat null as "unknown", never as a rank, or new models silently corrupt
// the routed-down math. Extend TIER_PATTERNS when a new family ships.
export const TIER_PATTERNS = [[/fable|mythos/, 4], [/opus/, 3], [/sonnet/, 2], [/haiku/, 1]]
export const tierOf = (m) => {
  if (!m) return null
  for (const [re, tier] of TIER_PATTERNS) if (re.test(m)) return tier
  return null
}

// Built-in Explore has inherited the session model since Claude Code 2.1.198,
// capped at opus on the Claude API; before that it always ran haiku, which is
// why it used to be exempted here as inherently cheap. The cap survives FORCE
// with no env model. On other providers the cap does not apply, so a Fable
// session's Explore there runs Fable and this reads it one tier low - the log
// records no provider to tell them apart.
export const exploreModel = (session) => session && (tierOf(session) ?? 0) > tierOf('opus') ? 'opus' : session ?? null

export const isAboveSession =(ran, session) => {
  const tr = tierOf(ran)
  const ts = tierOf(session)
  return tr != null && ts != null && tr > ts
}
