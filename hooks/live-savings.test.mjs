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

const opusStep = { ...sonnetStep, model: 'claude-opus-5-5' }
const SONNET = 'claude-sonnet-5-5'
const OPUS = 'claude-opus-5-5'
const cfg = (o) => ({ config: { aboveSession: 'warn', exempt: [], ...o }, configRead: true })

test('an above-session subagent is counted with its measured extra cost', () => {
  let l = addSubagentStep(emptyLedger(), 'a1', opusStep, SONNET)
  l = addSubagentStep(l, 'a2', sonnetStep, SONNET)
  assert.match(bandText(l), /, above session: 1 opus \(\+\$0\.\d\d\)$/)
  const extra = costOf(OPUS, volumeOf(opusStep)) - costOf(SONNET, volumeOf(opusStep))
  assert.ok(bandText(l).endsWith(`above session: 1 opus (+${usd(extra)})`))
  assert.ok(near(l.over.a1.extra, extra))
})

test('extra accumulates per response of the same agent', () => {
  let l = addSubagentStep(emptyLedger(), 'a1', opusStep, SONNET, 'model-routing:reviewer')
  l = addSubagentStep(l, 'a1', opusStep, SONNET)
  assert.ok(near(l.over.a1.extra, 2 * (costOf(OPUS, volumeOf(opusStep)) - costOf(SONNET, volumeOf(opusStep)))))
  assert.equal(l.over.a1.type, 'model-routing:reviewer')
})

test('aboveSession off prints nothing extra', () => {
  const l = addSubagentStep(emptyLedger(), 'a1', opusStep, SONNET)
  assert.doesNotMatch(bandText(l, cfg({ aboveSession: 'off' })), /above session/)
})

test('no above-session text when the parent is the highest tier used', () => {
  let l = addSubagentStep(emptyLedger(), 'a1', opusStep, OPUS)
  l = addSubagentStep(l, 'a2', sonnetStep, OPUS)
  assert.doesNotMatch(bandText(l), /above session/)
})

test('an exempt agent type, full or bare, is left out', () => {
  const l = addSubagentStep(emptyLedger(), 'a1', opusStep, SONNET, 'model-routing:reviewer')
  assert.doesNotMatch(bandText(l, cfg({ exempt: ['reviewer'] })), /above session/)
  assert.doesNotMatch(bandText(l, cfg({ exempt: ['model-routing:reviewer'] })), /above session/)
  assert.match(bandText(l, cfg({ exempt: ['other'] })), /above session: 1 opus \(\+\$/)
})

test('an exempt above-session agent next to a non-exempt one leaves the band count and amount to the non-exempt one', () => {
  const big = { ...opusStep, input_tokens: 90000 }
  let l = addSubagentStep(emptyLedger(), 'a1', big, SONNET, 'model-routing:reviewer')
  l = addSubagentStep(l, 'a2', opusStep, SONNET, 'other')
  const extra = costOf(OPUS, volumeOf(opusStep)) - costOf(SONNET, volumeOf(opusStep))
  assert.ok(bandText(l, cfg({ exempt: ['reviewer'] })).endsWith(`, above session: 1 opus (+${usd(extra)})`))
  assert.ok(bandText(l).endsWith(', above session: 2 opus (+' + usd(l.over.a1.extra + l.over.a2.extra) + ')'))
})

test('an above-session total under a cent reads (+<$0.01)', () => {
  const l = addSubagentStep(emptyLedger(), 'a1', { input_tokens: 1000, model: OPUS }, SONNET)
  assert.ok(l.over.a1.extra > 0 && l.over.a1.extra < 0.01)
  assert.match(bandText(l), /, above session: 1 opus \(\+<\$0\.01\)$/)
})

test('an unknown agent type with exempt configured prints the count only', () => {
  const l = addSubagentStep(emptyLedger(), 'a1', opusStep, SONNET)
  const t = bandText(l, cfg({ exempt: ['reviewer'] }))
  assert.match(t, /above session: 1 opus \(exempt not applied\)$/)
  assert.doesNotMatch(t.split('above session')[1], /\$/)
})

test('an unread config is flagged after the amount', () => {
  const l = addSubagentStep(emptyLedger(), 'a1', opusStep, SONNET)
  assert.match(bandText(l, { ...cfg({}), configRead: false }), /above session: 1 opus \(\+\$0\.\d\d\) \(config not read\)$/)
})

test('unpriced models and unknown parents are never judged', () => {
  assert.deepEqual(addSubagentStep(emptyLedger(), 'a1', { ...sonnetStep, model: 'claude-x-9' }, 'claude-haiku-5-5').over, {})
  assert.deepEqual(addSubagentStep(emptyLedger(), 'a1', opusStep, null).over, {})
  assert.deepEqual(addSubagentStep(emptyLedger(), 'a1', opusStep, 'claude-x-9').over, {})
})
