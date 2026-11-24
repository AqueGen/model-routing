import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { defaultConfig, parseConfig } from './config-core.mjs'

export { DEFAULT_CONFIG, defaultConfig, isExempt, parseConfig } from './config-core.mjs'

export function configDir() {
  return process.env.CLAUDE_CONFIG_DIR?.trim()
    ? resolve(process.env.CLAUDE_CONFIG_DIR)
    : join(homedir(), '.claude')
}

export function loadConfig(dir = join(configDir(), 'model-routing')) {
  try {
    return parseConfig(readFileSync(join(dir, 'config.json'), 'utf-8'))
  } catch {
    return defaultConfig()
  }
}
