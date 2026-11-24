import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const DEFAULT_CONFIG = { aboveSession: 'warn', exempt: [] }

export function configDir() {
  return process.env.CLAUDE_CONFIG_DIR?.trim()
    ? resolve(process.env.CLAUDE_CONFIG_DIR)
    : join(homedir(), '.claude')
}

// Never throws: anything missing, unparseable or wrongly typed falls back to the default for that field.
export function loadConfig(dir = join(configDir(), 'model-routing')) {
  let raw
  try {
    raw = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'))
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
