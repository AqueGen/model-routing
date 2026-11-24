import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aboveSessionNotice } from './notice.mjs'

const warn = { aboveSession: 'warn', exempt: [] }
const args = { agent: 'model-routing:reviewer', ran: 'claude-opus-4-8', session: 'claude-sonnet-5-5', config: warn }

test('names the agent, both short models and the cost hint', () => {
  assert.equal(
    aboveSessionNotice(args),
    'model-routing: model-routing:reviewer ran on opus-4-8, above the session model sonnet-5-5. This may cost more than planned.',
  )
})

test('null when aboveSession is off', () => {
  assert.equal(aboveSessionNotice({ ...args, config: { aboveSession: 'off', exempt: [] } }), null)
})

test('null when the agent is exempt', () => {
  assert.equal(aboveSessionNotice({ ...args, config: { aboveSession: 'warn', exempt: ['reviewer'] } }), null)
})

test('null when ran is not above the session', () => {
  assert.equal(aboveSessionNotice({ ...args, ran: 'claude-sonnet-5-5' }), null)
  assert.equal(aboveSessionNotice({ ...args, ran: 'claude-haiku-4-5' }), null)
})

test('null when either model is unknown or missing', () => {
  assert.equal(aboveSessionNotice({ ...args, session: null }), null)
  assert.equal(aboveSessionNotice({ ...args, ran: 'zephyr-1' }), null)
})
