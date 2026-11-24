import { isExempt } from './config-core.mjs'
import { shortModel } from './notice.mjs'
import { exploreModel, tierOf } from './tiers.mjs'

const SUGGESTED = { 'general-purpose': 'sonnet', Explore: 'haiku' }
// The Agent tool's `model` param takes these family aliases, not full model ids.
const aliasOf = (m) => m.match(/fable|opus|sonnet|haiku/)?.[0] ?? null

export function bareDispatchAdvice({ input, session, env, envForce, config }) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.model) return null
  const agent = input.subagent_type ?? 'general-purpose'
  const suggested = SUGGESTED[agent]
  if (!suggested || envForce || config.bareDispatch === 'off' || isExempt(config, agent)) return null
  if (agent === 'general-purpose' && env && env !== 'inherit') return null
  const inherited = agent === 'Explore' ? exploreModel(session) : session
  const ti = tierOf(inherited)
  const ts = tierOf(suggested)
  return ti != null && ts != null && ti > ts ? { agent, inherited, suggested } : null
}

export function bareDispatchText({ agent, inherited, suggested }) {
  const alias = aliasOf(inherited)
  return `model-routing: a bare ${agent} dispatch runs on ${shortModel(inherited)}. Pass model "${suggested}" for ordinary work${alias ? `, or "${alias}" when the task needs that reasoning` : ''}.`
}
