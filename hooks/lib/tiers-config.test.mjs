import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isAboveSession, tierOf } from './tiers.mjs'
import { DEFAULT_CONFIG, configDir, isExempt, loadConfig, parseConfig } from './config.mjs'

test('tierOf keeps the ladder', () => {
  assert.deepEqual(['fable-1', 'mythos-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5', 'claude-x-9', null].map(tierOf), [4, 4, 3, 2, 1, null, null])
})

test('isAboveSession is true only when both rank and ran is higher', () => {
  assert.equal(isAboveSession('claude-opus-5-5', 'claude-sonnet-5-5'), true)
  assert.equal(isAboveSession('claude-sonnet-5-5', 'claude-opus-5-5'), false)
  assert.equal(isAboveSession('claude-sonnet-5-5', 'claude-sonnet-5-5'), false)
  assert.equal(isAboveSession('claude-x-9', 'claude-sonnet-5-5'), false)
  assert.equal(isAboveSession('claude-opus-5-5', 'claude-x-9'), false)
  assert.equal(isAboveSession(null, 'claude-sonnet-5-5'), false)
  assert.equal(isAboveSession('claude-opus-5-5', null), false)
  assert.equal(isAboveSession('claude-fable-1', 'claude-mythos-1'), false)
})

const DIR = Symbol('dir')
const withConfig = (content, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'mr-cfg-'))
  try {
    if (content === DIR) mkdirSync(join(dir, 'config.json'))
    else if (typeof content === 'string') writeFileSync(join(dir, 'config.json'), content)
    return fn(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('loadConfig: no file gives the defaults', () => {
  withConfig(null, (dir) => assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG))
})

test('loadConfig returns a valid file as written', () => {
  const cfg = { aboveSession: 'off', bareDispatch: 'deny', exempt: ['pre-push-reviewer'] }
  withConfig(JSON.stringify(cfg), (dir) => assert.deepEqual(loadConfig(dir), { ...DEFAULT_CONFIG, ...cfg }))
})

test('bareDispatch defaults to warn, keeps deny and off, and falls back on anything else', () => {
  assert.equal(DEFAULT_CONFIG.bareDispatch, 'warn')
  for (const v of ['warn', 'deny', 'off']) assert.equal(parseConfig(JSON.stringify({ bareDispatch: v })).bareDispatch, v)
  for (const v of [5, null, true, 'block', 'DENY', {}]) assert.equal(parseConfig(JSON.stringify({ bareDispatch: v })).bareDispatch, 'warn')
  assert.equal(parseConfig('{"bareDispatch":"deny","aboveSession":5}').aboveSession, 'warn')
})

test('loadConfig falls back on wrong types, invalid JSON and a directory in place of the file', () => {
  withConfig('{"aboveSession":5,"bareDispatch":5,"exempt":"x"}', (dir) => assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG))
  withConfig('{not json', (dir) => assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG))
  withConfig('null', (dir) => assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG))
  withConfig(DIR, (dir) => assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG))
})

test('loadConfig drops non-string exempt entries', () => {
  withConfig('{"exempt":["a",1,null,"b"]}', (dir) => assert.deepEqual(loadConfig(dir).exempt, ['a', 'b']))
})

test('loadConfig never hands out the shared default exempt array', () => {
  withConfig(null, (dir) => {
    loadConfig(dir).exempt.push('x')
    assert.deepEqual(DEFAULT_CONFIG.exempt, [])
  })
})

test('configDir honours CLAUDE_CONFIG_DIR', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpdir()
  try { assert.equal(configDir(), tmpdir()) } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = prev
  }
})

test('isExempt: a bare entry matches the bare name, a namespaced entry only the identical full type', () => {
  assert.equal(isExempt({ exempt: ['reviewer'] }, 'model-routing:reviewer'), true)
  assert.equal(isExempt({ exempt: ['reviewer'] }, 'reviewer'), true)
  assert.equal(isExempt({ exempt: ['model-routing:reviewer'] }, 'model-routing:reviewer'), true)
  assert.equal(isExempt({ exempt: ['other-plugin:reviewer'] }, 'model-routing:reviewer'), false)
  assert.equal(isExempt({ exempt: ['model-routing:reviewer'] }, 'reviewer'), false)
  assert.equal(isExempt({ exempt: ['reviewer'] }, 'implementer'), false)
  assert.equal(isExempt({ exempt: ['reviewer'] }, null), false)
})

test('parseConfig and loadConfig tolerate a UTF-8 BOM', () => {
  assert.equal(parseConfig('\uFEFF{"aboveSession":"off"}').aboveSession, 'off')
  withConfig('\uFEFF{"aboveSession":"off"}', (dir) => assert.equal(loadConfig(dir).aboveSession, 'off'))
})
