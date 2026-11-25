import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultConfig } from './config-core.mjs'
import { guardDecision } from './guard.mjs'

const cfg = (over = {}) => ({ ...defaultConfig(), ...over })
const decide = (input, config, session = 'claude-opus-5-5') => guardDecision({ input, config, session })
const MODES = ['quality', 'balanced', 'economy', 'strict']
const expectRow = (input, expected, session) => {
  for (const mode of MODES) {
    const reason = decide(input, cfg({ mode }), session)
    assert.equal(reason !== null, expected[mode], `${mode}: ${JSON.stringify(input)} -> ${reason}`)
    if (reason) assert.match(reason, /^model-routing:/)
    assert.equal(decide(input, cfg({ mode, isOn: false }), session), null, `off, ${mode}`)
  }
}

test('row 1: redirect denies in every mode, names the target, matches by bare name or full name', () => {
  const input = { subagent_type: 'model-routing:implementer', model: 'sonnet' }
  for (const mode of MODES) {
    assert.match(decide(input, cfg({ mode, redirect: { implementer: 'codex-implementer' } })), /use codex-implementer/)
  }
  assert.equal(decide(input, cfg({ redirect: { 'other:implementer': 'x' } })), null)
  assert.match(decide(input, cfg({ redirect: { 'model-routing:implementer': 'x' } })), /use x/)
  assert.equal(decide(input, cfg({ isOn: false, redirect: { implementer: 'x' } })), null)
})

test('row 1: a self-redirect or a redirect to a redirected agent is ignored', () => {
  const input = { subagent_type: 'model-routing:implementer', model: 'sonnet' }
  assert.equal(decide(input, cfg({ redirect: { implementer: 'implementer' } })), null)
  assert.equal(decide(input, cfg({ redirect: { implementer: 'model-routing:implementer' } })), null)
  assert.equal(decide(input, cfg({ redirect: { implementer: 'a', a: 'implementer' } })), null)
  assert.equal(decide({ subagent_type: 'a' }, cfg({ redirect: { implementer: 'a', a: 'implementer' } })), null)
  assert.match(decide(input, cfg({ redirect: { implementer: 'b', a: 'implementer' } })), /use b/)
})

test('row 1: a redirect chain is followed to its end', () => {
  assert.match(decide({ subagent_type: 'a' }, cfg({ redirect: { a: 'b', b: 'c' } })), /use c/)
  assert.match(decide({ subagent_type: 'b' }, cfg({ redirect: { a: 'b', b: 'c' } })), /use c/)
  assert.equal(decide({ subagent_type: 'a' }, cfg({ redirect: { a: 'b', b: 'c', c: 'a' } })), null)
})

test('row 2: reviewer below its opus pin is denied outside quality', () => {
  expectRow({ subagent_type: 'model-routing:reviewer', model: 'sonnet', description: '[final]' }, { quality: false, balanced: true, economy: true, strict: true })
  expectRow({ subagent_type: 'reviewer', model: 'haiku', description: '[final]' }, { quality: false, balanced: true, economy: true, strict: true })
})

test('row 2: the floor applies only when the session tier is known and above the passed model', () => {
  const input = { subagent_type: 'model-routing:reviewer', model: 'sonnet', description: '[final]' }
  const balanced = cfg({ mode: 'balanced' })
  assert.equal(decide(input, balanced, 'claude-sonnet-5-5'), null)
  assert.equal(decide(input, balanced, null), null)
  assert.equal(decide(input, balanced, 'zephyr-9'), null)
  assert.match(decide(input, balanced, 'claude-fable-5-2'), /below its opus pin/)
  assert.equal(decide({ ...input, model: 'haiku' }, balanced, 'claude-sonnet-5-5') === null, false)
  assert.equal(decide(input, cfg(), 'claude-fable-5-2'), null)
})

test('row 3: opus-tier implementer / general-purpose / Explore without a tag', () => {
  const allow = { quality: false, balanced: true, economy: true, strict: true }
  expectRow({ subagent_type: 'implementer', model: 'opus', description: 'x' }, allow)
  expectRow({ subagent_type: 'model-routing:implementer', model: 'fable', description: 'x' }, allow)
  expectRow({ subagent_type: 'general-purpose', model: 'opus', description: 'x' }, allow)
  expectRow({ model: 'opus', description: 'x' }, allow)
  expectRow({ subagent_type: 'Explore', model: 'fable', description: 'x' }, allow)
})

test('row 4: retry and concurrency tags allow except in strict, which names Codex or sonnet', () => {
  for (const tag of ['[opus: retry]', '[OPUS:concurrency]']) {
    expectRow({ subagent_type: 'implementer', model: 'opus', description: tag }, { quality: false, balanced: false, economy: false, strict: true })
    assert.match(decide({ subagent_type: 'implementer', model: 'opus', description: tag }, cfg({ mode: 'strict' })), /Codex.*sonnet/)
  }
  assert.equal(decide({ subagent_type: 'implementer', model: 'opus', prompt: '[opus: retry] brief' }, cfg({ mode: 'balanced' })), null)
  assert.match(decide({ subagent_type: 'implementer', model: 'opus', description: 'x' }, cfg({ mode: 'balanced' })), /\[opus: retry\]/)
  assert.match(decide({ subagent_type: 'implementer', model: 'opus', prompt: 'a'.repeat(300) + '[opus: retry]' }, cfg({ mode: 'balanced' })), /^model-routing:/)
})

test('row 5: security, money and migration tags allow in every mode', () => {
  for (const tag of ['[opus: security]', '[opus: money]', '[opus:migration]']) {
    expectRow({ subagent_type: 'implementer', model: 'opus', description: tag }, { quality: false, balanced: false, economy: false, strict: false })
  }
})

test('row 6: bare general-purpose / Explore follows bareDispatch deny logic outside quality', () => {
  const bareGp = { description: 'x' }
  assert.equal(decide(bareGp, cfg({ mode: 'quality' })), null)
  assert.equal(decide(bareGp, cfg({ mode: 'quality', bareDispatch: 'warn' })), null)
  assert.match(decide(bareGp, cfg({ mode: 'quality', bareDispatch: 'deny' })), /bare general-purpose dispatch runs on opus-5-5/)
  for (const mode of ['balanced', 'economy', 'strict']) {
    assert.match(decide(bareGp, cfg({ mode })), /^model-routing: a bare general-purpose dispatch.*\[opus: retry\|security\|money\|migration\|concurrency\]/)
    assert.equal(decide(bareGp, cfg({ mode, bareDispatch: 'off' })), null)
    assert.match(decide({ subagent_type: 'x:general-purpose' }, cfg({ mode })), /bare general-purpose/)
    assert.match(decide({ subagent_type: 'p:Explore' }, cfg({ mode })), /bare Explore/)
    assert.match(decide({ subagent_type: 'p:general-purpose', model: 'opus', description: 'x' }, cfg({ mode })), /needs a stated reason|only with/)
    assert.match(decide({ subagent_type: 'Explore' }, cfg({ mode })), /bare Explore/)
    assert.equal(decide(bareGp, cfg({ mode }), 'claude-sonnet-5-5'), null)
    assert.equal(decide(bareGp, cfg({ mode }), null), null)
    assert.equal(decide(bareGp, cfg({ mode, exempt: ['general-purpose'] })), null)
    assert.equal(decide(bareGp, cfg({ mode, isOn: false, bareDispatch: 'deny' })), null)
  }
})

test('row 7: reviewer without [final] is denied in economy and strict only', () => {
  expectRow({ subagent_type: 'model-routing:reviewer', description: 'x' }, { quality: false, balanced: false, economy: true, strict: true })
  expectRow({ subagent_type: 'reviewer', description: 'x' }, { quality: false, balanced: false, economy: true, strict: true })
  expectRow({ subagent_type: 'model-routing:reviewer', description: 'branch review [FINAL]' }, { quality: false, balanced: false, economy: false, strict: false })
})

test('row 8: other agents are never denied', () => {
  for (const agent of ['fork', 'pre-push-reviewer', 'ui-reviewer', 'model-routing:task-reviewer', 'model-routing:scout']) {
    expectRow({ subagent_type: agent, description: 'x' }, { quality: false, balanced: false, economy: false, strict: false })
  }
  assert.equal(decide(undefined, cfg()), null)
  assert.equal(decide('nope', cfg()), null)
})
