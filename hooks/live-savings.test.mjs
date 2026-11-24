import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSubagentStep, bandText, emptyLedger, usd, volumeOf } from './lib/ledger.mjs'
import { costOf } from './lib/prices.mjs'

// Captured from a real session: one sonnet-5-5 subagent response under an opus-5-5 session.
const sonnetStep = {
  input_tokens: 2, output_tokens: 5, cache_read_input_tokens: 27041,
  cache_creation_input_tokens: 4130, ephemeral_5m_input_tokens: 4130, ephemeral_1h_input_tokens: 0,
  model: 'claude-sonnet-5-5',
}
const near = (a, b) => Math.abs(a - b) < 1e-12

test('a response is priced with reads, 5m writes and output at the model rates', () => {
  const sonnet = costOf('claude-sonnet-5-5', volumeOf(sonnetStep))
  assert.ok(near(sonnet, 2 * 2e-6 + 4130 * 2e-6 * 1.25 + 27041 * 2e-6 * 0.05 + 5 * 10e-6))
})

test('1h writes cost 2x and creation tokens without a split bill as 5m', () => {
  assert.ok(near(costOf('claude-opus-5-5', volumeOf({ cache_creation_input_tokens: 1000, ephemeral_1h_input_tokens: 1000 })), 1000 * 4e-6 * 2))
  assert.ok(near(costOf('claude-opus-5-5', volumeOf({ cache_creation_input_tokens: 1000 })), 1000 * 4e-6 * 1.25))
})

test('a haiku-5-5 response above 100K prompt tokens bills on the long card, one at the limit does not', () => {
  assert.ok(near(costOf('claude-haiku-5-5', volumeOf({ input_tokens: 100001 })), 100001 * 0.5e-6))
  assert.ok(near(costOf('claude-haiku-5-5', volumeOf({ input_tokens: 100000 })), 100000 * 0.1e-6))
})

test('agents count once per id while every response adds its cost', () => {
  let l = emptyLedger()
  l = addSubagentStep(l, 'a1', sonnetStep, 'claude-opus-5-5')
  l = addSubagentStep(l, 'a1', sonnetStep, 'claude-opus-5-5')
  l = addSubagentStep(l, 'a2', { ...sonnetStep, model: 'claude-haiku-5-5' }, 'claude-opus-5-5')
  assert.match(bandText(l), /^model-routing: 1 haiku, 1 sonnet - API \$\d+\.\d\d vs \$\d+\.\d\d at parent$/)
  assert.ok(near(l.actual, 2 * costOf('claude-sonnet-5-5', volumeOf(sonnetStep)) + costOf('claude-haiku-5-5', volumeOf(sonnetStep))))
  assert.ok(near(l.atParent, 3 * costOf('claude-opus-5-5', volumeOf(sonnetStep))))
})

test('the parent side is frozen per response, so a later /model does not reprice history', () => {
  let l = addSubagentStep(emptyLedger(), 'a1', sonnetStep, 'claude-opus-5-5')
  const before = l.atParent
  l = addSubagentStep(l, 'a2', sonnetStep, 'claude-sonnet-5-5')
  assert.ok(near(l.atParent, before + costOf('claude-sonnet-5-5', volumeOf(sonnetStep))))
})

test('subagents on the parent model read as same as parent', () => {
  const l = addSubagentStep(emptyLedger(), 'a1', { ...sonnetStep, model: 'claude-opus-5-5' }, 'claude-opus-5-5')
  assert.match(bandText(l), /^model-routing: 1 opus - API \$0\.\d\d, same as parent$/)
})

test('an unpriced subagent is named and counted, outside both sums', () => {
  let l = addSubagentStep(emptyLedger(), 'a1', sonnetStep, 'claude-opus-5-5')
  l = addSubagentStep(l, 'a2', { ...sonnetStep, model: 'claude-x-9' }, 'claude-opus-5-5')
  assert.match(bandText(l), /^model-routing: 1 sonnet, 1 x-9 - API \$0\.\d\d vs \$0\.\d\d at parent, 1 not priced$/)
  assert.equal(bandText(addSubagentStep(emptyLedger(), 'a1', { ...sonnetStep, model: 'claude-x-9' }, 'claude-opus-5-5')), 'model-routing: 1 x-9 - not priced')
})

test('an unknown or unpriced parent shows only what ran', () => {
  assert.match(bandText(addSubagentStep(emptyLedger(), 'a1', sonnetStep, null)), /^model-routing: 1 sonnet - API \$0\.\d\d$/)
  assert.match(bandText(addSubagentStep(emptyLedger(), 'a1', sonnetStep, 'claude-x-9')), /^model-routing: 1 sonnet - API \$0\.\d\d$/)
})

test('amounts under a cent read <$0.01, never $0.00', () => {
  assert.equal(usd(0.004), '<$0.01')
  assert.equal(usd(0.012), '$0.01')
  assert.equal(usd(12.4), '$12')
  assert.match(bandText(addSubagentStep(emptyLedger(), 'a1', { input_tokens: 1000, model: 'claude-haiku-5-5' }, 'claude-opus-5-5')), /API <\$0\.01 vs <\$0\.01 at parent/)
})

test('no band before the first subagent', () => {
  assert.equal(bandText(emptyLedger()), null)
})
