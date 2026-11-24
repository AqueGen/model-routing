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

export const isAboveSession = (ran, session) => {
  const tr = tierOf(ran)
  const ts = tierOf(session)
  return tr != null && ts != null && tr > ts
}
