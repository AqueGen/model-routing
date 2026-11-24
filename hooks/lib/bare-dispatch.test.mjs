import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bareDispatchAdvice, bareDispatchText } from './bare-dispatch.mjs'

const OPUS = 'claude-opus-5-5'
const FABLE = 'claude-fable-5-2'
const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-5-5'
const config = { aboveSession: 'warn', bareDispatch: 'warn', exempt: [] }
const advise = (o = {}) => bareDispatchAdvice({ input: {}, session: OPUS, env: '', envForce: false, config, ...o })

test('a bare general-purpose dispatch on opus or fable advises sonnet', () => {
  assert.deepEqual(advise(), { agent: 'general-purpose', inherited: OPUS, suggested: 'sonnet' })
  assert.deepEqual(advise({ session: FABLE }), { agent: 'general-purpose', inherited: FABLE, suggested: 'sonnet' })
  assert.deepEqual(advise({ input: { subagent_type: 'general-purpose' } }), { agent: 'general-purpose', inherited: OPUS, suggested: 'sonnet' })
})

test('a bare general-purpose dispatch on sonnet or haiku advises nothing', () => {
  assert.equal(advise({ session: SONNET }), null)
  assert.equal(advise({ session: HAIKU }), null)
})

test('a bare Explore dispatch advises haiku, inheriting at most opus', () => {
  const explore = { subagent_type: 'Explore' }
  assert.deepEqual(advise({ input: explore, session: SONNET }), { agent: 'Explore', inherited: SONNET, suggested: 'haiku' })
  assert.deepEqual(advise({ input: explore, session: FABLE }), { agent: 'Explore', inherited: 'opus', suggested: 'haiku' })
  assert.equal(advise({ input: explore, session: HAIKU }), null)
})

test('an explicit model, another agent type, FORCE, off and an exempt type advise nothing', () => {
  assert.equal(advise({ input: { model: 'opus' } }), null)
  for (const t of ['model-routing:implementer', 'fork', 'Plan', 'pre-push-reviewer']) {
    assert.equal(advise({ input: { subagent_type: t } }), null, t)
  }
  assert.equal(advise({ envForce: true }), null)
  assert.equal(advise({ config: { ...config, bareDispatch: 'off' } }), null)
  assert.equal(advise({ config: { ...config, exempt: ['general-purpose'] } }), null)
  assert.equal(advise({ input: { subagent_type: 'Explore' }, config: { ...config, exempt: ['Explore'] } }), null)
})

test('CLAUDE_CODE_SUBAGENT_MODEL moves general-purpose but not Explore; inherit counts as unset', () => {
  assert.equal(advise({ env: 'haiku' }), null)
  assert.ok(advise({ env: 'inherit' }))
  assert.ok(advise({ input: { subagent_type: 'Explore' }, env: 'haiku' }))
})

test('an unknown or missing session, or a non-object input, advises nothing', () => {
  assert.equal(advise({ session: null }), null)
  assert.equal(advise({ session: 'claude-x-9' }), null)
  for (const input of [null, undefined, 'x', 5, []]) assert.equal(advise({ input }), null)
})

test('the advice text is exact', () => {
  assert.equal(
    bareDispatchText({ agent: 'general-purpose', inherited: OPUS, suggested: 'sonnet' }),
    'model-routing: a bare general-purpose dispatch runs on opus-5-5. Pass model "sonnet" for ordinary work, or "opus" when the task needs that reasoning.',
  )
  assert.equal(
    bareDispatchText({ agent: 'Explore', inherited: 'opus', suggested: 'haiku' }),
    'model-routing: a bare Explore dispatch runs on opus. Pass model "haiku" for ordinary work, or "opus" when the task needs that reasoning.',
  )
  assert.equal(
    bareDispatchText({ agent: 'general-purpose', inherited: 'claude-fable-5-2', suggested: 'sonnet' }),
    'model-routing: a bare general-purpose dispatch runs on fable-5-2. Pass model "sonnet" for ordinary work, or "fable" when the task needs that reasoning.',
  )
  assert.equal(
    bareDispatchText({ agent: 'general-purpose', inherited: 'claude-mythos-5', suggested: 'sonnet' }),
    'model-routing: a bare general-purpose dispatch runs on mythos-5. Pass model "sonnet" for ordinary work.',
  )
})
