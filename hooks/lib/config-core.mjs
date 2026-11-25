export const MODES = ['economy', 'balanced', 'strict', 'quality']

export const DEFAULT_CONFIG = {
  aboveSession: 'warn',
  bareDispatch: 'warn',
  exempt: [],
  isOn: true,
  mode: 'quality',
  manualMode: 'quality',
  autoSwitch: false,
  showStats: true,
  redirect: {},
  fallback: [],
}

export const defaultConfig = () => ({ ...DEFAULT_CONFIG, exempt: [], redirect: {}, fallback: [] })

const isMode = (v) => MODES.includes(v)
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Never throws: anything missing, unparseable or wrongly typed falls back to the default for that field.
export function parseConfig(text) {
  let raw
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return defaultConfig()
  }
  if (!raw || typeof raw !== 'object') return defaultConfig()
  const mode = isMode(raw.mode) ? raw.mode : DEFAULT_CONFIG.mode
  return {
    aboveSession: raw.aboveSession === 'off' || raw.aboveSession === 'warn' ? raw.aboveSession : DEFAULT_CONFIG.aboveSession,
    bareDispatch: ['warn', 'deny', 'off'].includes(raw.bareDispatch) ? raw.bareDispatch : DEFAULT_CONFIG.bareDispatch,
    exempt: Array.isArray(raw.exempt) ? raw.exempt.filter((x) => typeof x === 'string') : [],
    isOn: typeof raw.isOn === 'boolean' ? raw.isOn : DEFAULT_CONFIG.isOn,
    mode,
    manualMode: isMode(raw.manualMode) ? raw.manualMode : mode,
    autoSwitch: typeof raw.autoSwitch === 'boolean' ? raw.autoSwitch : DEFAULT_CONFIG.autoSwitch,
    showStats: typeof raw.showStats === 'boolean' ? raw.showStats : DEFAULT_CONFIG.showStats,
    redirect: isPlainObject(raw.redirect)
      ? Object.fromEntries(Object.entries(raw.redirect).filter(([, v]) => typeof v === 'string'))
      : {},
    fallback: Array.isArray(raw.fallback) ? [...new Set(raw.fallback.filter((x) => typeof x === 'string' && x))] : [],
  }
}

const bare = (s) => s.slice(s.lastIndexOf(':') + 1)

export const isExempt = (config, agentType) =>
  typeof agentType === 'string' && config.exempt.some((x) => (x.includes(':') ? x === agentType : x === bare(agentType)))

// quality < balanced < economy < strict
const STRICTNESS = ['quality', 'balanced', 'economy', 'strict']

export function autoMode(config, weekPct) {
  if (!config.autoSwitch || weekPct == null) return config.manualMode
  const pressure = weekPct >= 90 ? 'strict' : weekPct >= 80 ? 'economy' : config.manualMode
  return STRICTNESS.indexOf(pressure) > STRICTNESS.indexOf(config.manualMode) ? pressure : config.manualMode
}
