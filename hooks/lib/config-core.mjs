export const DEFAULT_CONFIG = { aboveSession: 'warn', exempt: [] }

// Never throws: anything missing, unparseable or wrongly typed falls back to the default for that field.
export function parseConfig(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { ...DEFAULT_CONFIG, exempt: [] }
  }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG, exempt: [] }
  return {
    aboveSession: raw.aboveSession === 'off' || raw.aboveSession === 'warn' ? raw.aboveSession : DEFAULT_CONFIG.aboveSession,
    exempt: Array.isArray(raw.exempt) ? raw.exempt.filter((x) => typeof x === 'string') : [],
  }
}

const bare = (s) => s.slice(s.lastIndexOf(':') + 1)

export const isExempt = (config, agentType) =>
  typeof agentType === 'string' && config.exempt.some((x) => bare(x) === bare(agentType))
