// shortcut: rates copied from dispatch-counter.mjs PRICES without its long-prompt card (haiku-5-5 above 100K prompt
// tokens bills 5x there), so a long-running haiku subagent reads low here; update both tables when prices move.
const RATES = [
  [/(fable|mythos)-5-2(?!\d)/, [8, 40, 0.025]],
  [/fable-5-1|mythos-5-1/, [10, 50, 0.025]],
  [/fable-5|mythos-5/, [10, 50, 0.1]],
  [/opus-5-5/, [4, 20, 0.05]],
  [/opus-5|opus-4-8|opus-4-7|opus-4-6|opus-4-5/, [5, 25, 0.1]],
  [/sonnet-5-5/, [2, 10, 0.05]],
  [/sonnet-5/, [2, 10, 0.1]],
  [/sonnet-4/, [3, 15, 0.1]],
  [/haiku-5-5/, [0.1, 0.5, 0.1]],
  [/haiku-4-5/, [1, 5, 0.1]],
]

export const rateOf = (model) => RATES.find(([re]) => re.test(String(model ?? '')))?.[1] ?? null

export function costOf(model, u) {
  const r = rateOf(model)
  if (!r || !u) return null
  const [inp, out, crMul] = r
  const w5 = u.ephemeral_5m_input_tokens ?? 0
  const w1 = u.ephemeral_1h_input_tokens ?? 0
  const rest = Math.max(0, (u.cache_creation_input_tokens ?? 0) - w5 - w1)
  const perTok = inp / 1e6
  return (
    (u.input_tokens ?? 0) * perTok +
    (w5 + rest) * perTok * 1.25 +
    w1 * perTok * 2 +
    (u.cache_read_input_tokens ?? 0) * perTok * crMul +
    ((u.output_tokens ?? 0) * out) / 1e6
  )
}

const FIELDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens']

export const emptyLedger = () => ({ agents: {}, byModel: {} })

// One entry per subagent id (a subagent that runs again adds its tokens, not a second subagent);
// tokens are summed per model so the "same on the session model" side can be priced at render time.
export function addSubagentTurn(ledger, agentId, usage) {
  const model = usage?.model ?? null
  const key = String(model)
  const sum = { ...(ledger.byModel[key] ?? { model }) }
  for (const f of FIELDS) sum[f] = (sum[f] ?? 0) + (usage?.[f] ?? 0)
  return { agents: { ...ledger.agents, [agentId ?? '?']: model }, byModel: { ...ledger.byModel, [key]: sum } }
}

export function summarize(ledger, sessionModel) {
  let actual = 0
  let atSession = 0
  for (const u of Object.values(ledger.byModel)) {
    const a = costOf(u.model, u)
    if (a === null) continue
    actual += a
    atSession += sessionModel ? (costOf(sessionModel, u) ?? 0) : 0
  }
  const ids = Object.values(ledger.agents)
  const unpriced = ids.filter((m) => rateOf(m) === null).length
  return { n: ids.length, unpriced, actual, atSession }
}

const usd = (v) => (v >= 10 ? '$' + v.toFixed(0) : '$' + v.toFixed(2))
const short = (m) => String(m ?? '').replace(/^claude-/, '')
const plural = (n) => `${n} subagent${n > 1 ? 's' : ''}`

export function bandText(ledger, sessionModel) {
  const s = summarize(ledger, sessionModel)
  if (!s.n) return 'model-routing: no subagents yet this session'
  const priced = s.n - s.unpriced
  const tail = s.unpriced ? `, ${s.unpriced} not priced` : ''
  if (!priced) return `model-routing: ${plural(s.n)}, model not priced`
  if (!sessionModel) return `model-routing: ${plural(priced)} ${usd(s.actual)}${tail}`
  return `model-routing: ${plural(priced)} ${usd(s.actual)}, the same on ${short(sessionModel)} ${usd(s.atSession)}${tail}`
}
