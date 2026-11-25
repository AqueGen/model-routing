import { bareDispatchAdvice, bareDispatchText } from './bare-dispatch.mjs'
import { tierOf } from './tiers.mjs'

const bare = (s) => s.slice(s.lastIndexOf(':') + 1)
const UNPINNED = ['general-purpose', 'Explore']
const OPUS_REASON = /\[opus:\s*(retry|security|money|migration|concurrency)\]/i
const STRICT_REASON = /\[opus:\s*(security|money|migration)\]/i
const FINAL_REVIEW = /\[final\]/i

const matchesAgent = (key, agent) => (key.includes(':') ? key === agent : key === bare(agent))

// Follows a redirect chain to its end; a chain that returns to an agent already seen (self or cycle) redirects nothing.
function redirectTarget(redirects, agent) {
  const seen = [agent]
  let current = agent
  for (;;) {
    const next = redirects.find(([key]) => matchesAgent(key, current))?.[1]
    if (!next) return current === agent ? null : current
    if (seen.some((s) => s === next || matchesAgent(next, s))) return null
    seen.push(next)
    current = next
  }
}

// Returns the deny reason, or null to allow. Pure: the caller prints.
export function guardDecision({ input, config, session, env = '', envForce = false }) {
  if (!config.isOn || !input || typeof input !== 'object' || Array.isArray(input)) return null
  const mode = config.mode
  const agent = typeof input.subagent_type === 'string' && input.subagent_type ? input.subagent_type : 'general-purpose'
  const name = bare(agent)
  const model = typeof input.model === 'string' ? input.model.toLowerCase() : ''
  const text = `${input.description ?? ''} ${String(input.prompt ?? '').slice(0, 300)}`

  const target = redirectTarget(Object.entries(config.redirect), agent)
  if (target) return `model-routing: ${agent} is redirected - use ${target}.`

  if (mode !== 'quality' && name === 'reviewer' && /sonnet|haiku/.test(model)) {
    const sessionTier = tierOf(session)
    const modelTier = tierOf(model)
    if (sessionTier != null && modelTier != null && sessionTier > modelTier) {
      return `model-routing: ${agent} with model=${model} runs the same role below its opus pin. Drop the model override, or use model-routing:task-reviewer for a light review.`
    }
  }

  if (mode !== 'quality' && (name === 'implementer' || UNPINNED.includes(name)) && /opus|fable/.test(model)) {
    if (mode === 'strict' && !STRICT_REASON.test(text)) {
      return `model-routing: ${agent} with model=${model} in routing mode 'strict': opus only with [opus: security], [opus: money] or [opus: migration] in the description. For a retry or concurrency work use Codex (codex-implement skill), or sonnet with a fixed brief.`
    }
    if (!OPUS_REASON.test(text)) {
      return `model-routing: ${agent} with model=${model} in routing mode '${mode}' needs a stated reason: add [opus: retry], [opus: security], [opus: money], [opus: migration] or [opus: concurrency] to the description. Otherwise drop model or pass model=sonnet.`
    }
  }

  if (UNPINNED.includes(name) && !model && config.bareDispatch !== 'off' && (mode !== 'quality' || config.bareDispatch === 'deny')) {
    const advice = bareDispatchAdvice({
      input: { ...input, subagent_type: name },
      session,
      env,
      envForce,
      config: mode === 'quality' ? config : { ...config, bareDispatch: 'deny' },
    })
    if (advice) {
      const hint = mode === 'quality' ? '' : ` In routing mode '${mode}' opus needs an [opus: retry|security|money|migration|concurrency] tag in the description.`
      return bareDispatchText(advice) + hint
    }
  }

  if ((mode === 'economy' || mode === 'strict') && name === 'reviewer' && !FINAL_REVIEW.test(text)) {
    return `model-routing: routing mode '${mode}': ${agent} (opus) is for final branch reviews only - add [final] to the description, or use model-routing:task-reviewer for a per-task review.`
  }
  return null
}
