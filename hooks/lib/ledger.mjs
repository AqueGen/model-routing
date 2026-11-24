// shortcut: rates copied from dispatch-counter.mjs PRICES without the long-prompt card, update both when prices move.
const RATES = [
  [/(fable|mythos)-5-2/, [8, 40, 0.025]],
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

export const emptyLedger = () => ({ n: 0, actual: 0, atSession: 0, unpriced: 0 })

export function addSubagentTurn(ledger, sessionModel, usage) {
  const actual = costOf(usage?.model, usage)
  const atSession = costOf(sessionModel, usage)
  if (actual === null || atSession === null) return { ...ledger, n: ledger.n + 1, unpriced: ledger.unpriced + 1 }
  return { n: ledger.n + 1, actual: ledger.actual + actual, atSession: ledger.atSession + atSession, unpriced: ledger.unpriced }
}

const usd = (v) => (v >= 10 ? '$' + v.toFixed(0) : '$' + v.toFixed(2))
const short = (m) => String(m ?? '').replace(/^claude-/, '')

export function bandText(ledger, sessionModel) {
  if (!ledger.n) return 'model-routing: no subagents yet this session'
  const priced = ledger.n - ledger.unpriced
  if (!priced) return `model-routing: ${ledger.n} subagent${ledger.n > 1 ? 's' : ''}, model not priced`
  return `model-routing: ${priced} subagent${priced > 1 ? 's' : ''} ${usd(ledger.actual)}, the same on ${short(sessionModel)} ${usd(ledger.atSession)}`
}
