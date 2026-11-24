import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSubagentTurn, bandText, costOf, emptyLedger, rateOf, summarize } from './lib/ledger.mjs'

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
  const u = { cache_creation_input_tokens: 1000, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 }
  assert.ok(Math.abs(costOf('claude-opus-5-5', u) - 1000 * 4e-6 * 2) < 1e-12)
})

test('creation tokens without a TTL split count as 5m writes', () => {
  assert.ok(Math.abs(costOf('claude-opus-5-5', { cache_creation_input_tokens: 1000 }) - 1000 * 4e-6 * 1.25) < 1e-12)
})

test('a dated fable-5 id is not priced as fable-5.2', () => {
  assert.deepEqual(rateOf('claude-fable-5-20261101'), [10, 50, 0.1])
  assert.deepEqual(rateOf('claude-fable-5-2'), [8, 40, 0.025])
})

test('subagents are counted once per id, tokens keep adding', () => {
  let l = emptyLedger()
  l = addSubagentTurn(l, 'a1', sonnetTurn)
  l = addSubagentTurn(l, 'a1', sonnetTurn)
  l = addSubagentTurn(l, 'a2', sonnetTurn)
  const s = summarize(l, 'claude-opus-5-5')
  assert.equal(s.n, 2)
  assert.ok(Math.abs(s.actual - 3 * costOf('claude-sonnet-5-5', sonnetTurn)) < 1e-12)
})

test('the session-model side follows the current session model, not the one at completion', () => {
  const l = addSubagentTurn(emptyLedger(), 'a1', sonnetTurn)
  const underOpus = summarize(l, 'claude-opus-5-5').atSession
  const underSonnet = summarize(l, 'claude-sonnet-5-5').atSession
  assert.ok(Math.abs(underOpus / underSonnet - 2) < 1e-9)
  assert.match(bandText(l, 'claude-sonnet-5-5'), /the same on sonnet-5-5/)
})

test('unpriced subagents are reported next to the priced ones', () => {
  let l = addSubagentTurn(emptyLedger(), 'a1', sonnetTurn)
  l = addSubagentTurn(l, 'a2', { ...sonnetTurn, model: 'claude-x-9' })
  assert.match(bandText(l, 'claude-opus-5-5'), /^model-routing: 1 subagent \$0\.\d\d, the same on opus-5-5 \$0\.\d\d, 1 not priced$/)
  assert.match(bandText(addSubagentTurn(emptyLedger(), 'a1', { ...sonnetTurn, model: 'claude-x-9' }), 'claude-opus-5-5'), /model not priced/)
})

test('without a known session model the band shows only what ran', () => {
  const l = addSubagentTurn(emptyLedger(), 'a1', sonnetTurn)
  assert.match(bandText(l, null), /^model-routing: 1 subagent \$0\.\d\d$/)
})

test('a session model with no price shows only what ran, never "$0.00" as the comparison', () => {
  const l = addSubagentTurn(emptyLedger(), 'a1', sonnetTurn)
  assert.match(bandText(l, 'claude-x-9'), /^model-routing: 1 subagent \$0\.\d\d$/)
})

test('before the first subagent the band says so, so a loaded mod is visible', () => {
  assert.equal(bandText(emptyLedger(), 'claude-opus-5-5'), 'model-routing: no subagents yet this session')
})
