import { isExempt } from './config-core.mjs'
import { isAboveSession } from './tiers.mjs'

export const shortModel = (m) => (m ? m.replace(/^claude-/, '').replace(/-\d{8}$/, '') : m)

export function aboveSessionNotice({ agent, ran, session, config }) {
  if (config.aboveSession === 'off' || isExempt(config, agent) || !isAboveSession(ran, session)) return null
  return `model-routing: ${agent} ran on ${shortModel(ran)}, above the session model ${shortModel(session)}. This may cost more than planned.`
}
