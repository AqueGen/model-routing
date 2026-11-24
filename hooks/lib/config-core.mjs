export const DEFAULT_CONFIG = { aboveSession: 'warn', bareDispatch: 'warn', exempt: [] }

export const defaultConfig = () => ({ aboveSession: DEFAULT_CONFIG.aboveSession, bareDispatch: DEFAULT_CONFIG.bareDispatch, exempt: [] })

// Never throws: anything missing, unparseable or wrongly typed falls back to the default for that field.
export function parseConfig(text) {
  let raw
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return defaultConfig()
  }
  if (!raw || typeof raw !== 'object') return defaultConfig()
  return {
    aboveSession: raw.aboveSession === 'off' || raw.aboveSession === 'warn' ? raw.aboveSession : DEFAULT_CONFIG.aboveSession,
    bareDispatch: ['warn', 'deny', 'off'].includes(raw.bareDispatch) ? raw.bareDispatch : DEFAULT_CONFIG.bareDispatch,
    exempt: Array.isArray(raw.exempt) ? raw.exempt.filter((x) => typeof x === 'string') : [],
  }
}

const bare = (s) => s.slice(s.lastIndexOf(':') + 1)

export const isExempt = (config, agentType) =>
  typeof agentType === 'string' && config.exempt.some((x) => (x.includes(':') ? x === agentType : x === bare(agentType)))
