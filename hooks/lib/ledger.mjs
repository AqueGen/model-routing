import { DEFAULT_CONFIG, isExempt } from './config-core.mjs'
import { costOf, isPriced, LONG_PROMPT, volOf } from './prices.mjs'
import { isAboveSession } from './tiers.mjs'

// One API response as the price table takes it. The 5m/1h split is optional on the wire; the part without one bills as 5m.
// A response above LONG_PROMPT bills wholly on the long card, so all of it goes to `long`.
export function volumeOf(u) {
  const w1 = u?.ephemeral_1h_input_tokens ?? 0
  const v = {
    in: u?.input_tokens ?? 0,
    out: u?.output_tokens ?? 0,
    cr: u?.cache_read_input_tokens ?? 0,
    cw1h: w1,
    cw5: Math.max(0, (u?.cache_creation_input_tokens ?? 0) - w1),
  }
  return volOf(v) > LONG_PROMPT ? { ...v, long: { ...v } } : v
}

export const emptyLedger = () => ({ agents: {}, actual: 0, compared: 0, atParent: 0, uncompared: false, over: {} })

// `parentModel` is the main thread's model when the response arrived, so a later /model does not reprice history.
export function addSubagentStep(ledger, agentId, usage, parentModel, agentType = null) {
  const id = agentId ?? '?'
  const model = usage?.model ?? null
  const agents = { ...ledger.agents, [id]: model }
  const v = volumeOf(usage)
  const ran = costOf(model, v)
  if (ran === null) return { ...ledger, agents }
  const parent = costOf(parentModel, v)
  if (parent === null) return { ...ledger, agents, actual: ledger.actual + ran, uncompared: true }
  const prev = ledger.over?.[id]
  const over = isAboveSession(model, parentModel)
    ? { ...ledger.over, [id]: { model, type: agentType ?? prev?.type ?? null, extra: (prev?.extra ?? 0) + ran - parent } }
    : ledger.over
  return { ...ledger, agents, over, actual: ledger.actual + ran, compared: ledger.compared + ran, atParent: ledger.atParent + parent }
}

const FAMILY = /fable|mythos|opus|sonnet|haiku/
const family = (m) => String(m ?? 'unknown').match(FAMILY)?.[0] ?? String(m ?? 'unknown').replace(/^claude-/, '')

export function usd(v) {
  if (v > 0 && v < 0.01) return '<$0.01'
  return v >= 10 ? '$' + v.toFixed(0) : '$' + v.toFixed(2)
}

const mixOf = (models) => {
  const counts = {}
  for (const m of models) counts[family(m)] = (counts[family(m)] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f, n]) => `${n} ${f}`).join(', ')
}

function aboveSessionText(ledger, { config, configRead }) {
  if (config.aboveSession === 'off') return ''
  const rows = Object.values(ledger.over ?? {}).filter((o) => !isExempt(config, o.type))
  if (!rows.length) return ''
  const head = `, above session: ${mixOf(rows.map((o) => o.model))}`
  if (config.exempt.length && rows.some((o) => o.type == null)) return `${head} (exempt not applied)`
  return `${head} (+${usd(rows.reduce((s, o) => s + o.extra, 0))})${configRead ? '' : ' (config not read)'}`
}

// null until the first subagent: the band then draws nothing.
export function bandText(ledger, opts = {}) {
  const models = Object.values(ledger.agents)
  if (!models.length) return null
  const mix = mixOf(models)
  const unpriced = models.filter((m) => !isPriced(m)).length
  const tail = unpriced ? `, ${unpriced} not priced` : ''
  if (unpriced === models.length) return `model-routing: ${mix} - not priced`
  let money
  if (ledger.uncompared) money = `API ${usd(ledger.actual)}`
  else if (Math.abs(ledger.atParent - ledger.compared) < 1e-9) money = `API ${usd(ledger.actual)}, same as parent`
  else money = `API ${usd(ledger.actual)} vs ${usd(ledger.atParent)} at parent`
  const over = aboveSessionText(ledger, { config: DEFAULT_CONFIG, configRead: true, ...opts })
  return `model-routing: ${mix} - ${money}${tail}${over}`
}
