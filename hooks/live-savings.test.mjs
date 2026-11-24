import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSubagentTurn, bandText, costOf, emptyLedger } from './lib/ledger.mjs'

// Captured from a real session: sonnet-5-5 subagent turn under an opus-5-5 session.
const sonnetTurn = {
  input_tokens: 2, output_tokens: 5, cache_read_input_tokens: 27041,
  cache_creation_input_tokens: 4130, ephemeral_5m_input_tokens: 4130, ephemeral_1h_input_tokens: 0,
  model: 'claude-sonnet-5-5',
}

test('costOf prices cache reads, writes and output at the model rates', () => {
  const sonnet = costOf('claude-sonnet-5-5', sonnetTurn)
  assert.ok(Math.abs(sonnet - (2 * 2e-6 + 4130 * 2e-6 * 1.25 + 27041 * 2e-6 * 0.05 + 5 * 10e-6)) < 1e-12)
  assert.ok(Math.abs(costOf('claude-opus-5-5', sonnetTurn) / sonnet - 2) < 1e-9, 'opus 5.5 is exactly 2x sonnet 5.5')
})

test('1h cache writes cost 2x input and are not double counted', () => {
  const u = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 }
  assert.ok(Math.abs(costOf('claude-opus-5-5', u) - 1000 * 4e-6 * 2) < 1e-12)
})

test('creation tokens without a TTL split count as 5m writes', () => {
  const u = { cache_creation_input_tokens: 1000 }
  assert.ok(Math.abs(costOf('claude-opus-5-5', u) - 1000 * 4e-6 * 1.25) < 1e-12)
})

test('unknown models are counted but not priced', () => {
  const l = addSubagentTurn(emptyLedger(), 'claude-opus-5-5', { ...sonnetTurn, model: 'claude-new-9' })
  assert.deepEqual(l, { n: 1, actual: 0, atSession: 0, unpriced: 1 })
  assert.match(bandText(l, 'claude-opus-5-5'), /not priced/)
})

test('ledger accumulates actual and session-model cost; band shows both', () => {
  let l = emptyLedger()
  l = addSubagentTurn(l, 'claude-opus-5-5', sonnetTurn)
  l = addSubagentTurn(l, 'claude-opus-5-5', sonnetTurn)
  assert.equal(l.n, 2)
  assert.ok(Math.abs(l.atSession / l.actual - 2) < 1e-9)
  assert.match(bandText(l, 'claude-opus-5-5'), /^model-routing: 2 subagents \$0\.\d\d, the same on opus-5-5 \$0\.\d\d$/)
})

test('no band before the first subagent', () => {
  assert.equal(bandText(emptyLedger(), 'claude-opus-5-5'), null)
})
