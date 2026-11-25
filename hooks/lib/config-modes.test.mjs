import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, autoMode, defaultConfig, parseConfig } from './config-core.mjs'

test('empty, invalid and non-object input give the defaults', () => {
  for (const text of ['', '{not json', 'null', '5', '"x"']) assert.deepEqual(parseConfig(text), DEFAULT_CONFIG, text)
  assert.equal(DEFAULT_CONFIG.mode, 'quality')
  assert.equal(DEFAULT_CONFIG.manualMode, 'quality')
  assert.equal(DEFAULT_CONFIG.isOn, true)
  assert.equal(DEFAULT_CONFIG.autoSwitch, false)
})

test('an old config with only bareDispatch keeps it and gets the new defaults', () => {
  assert.deepEqual(parseConfig('{"bareDispatch":"deny"}'), { ...defaultConfig(), bareDispatch: 'deny' })
})

test('valid new fields are read; manualMode defaults to mode', () => {
  const c = parseConfig(JSON.stringify({ isOn: false, mode: 'strict', autoSwitch: true, showStats: false, showCodex: false, redirect: { a: 'b' } }))
  assert.deepEqual(c, { ...defaultConfig(), isOn: false, mode: 'strict', manualMode: 'strict', autoSwitch: true, showStats: false, showCodex: false, redirect: { a: 'b' } })
  assert.equal(parseConfig('{"mode":"economy","manualMode":"quality"}').manualMode, 'quality')
})

test('each wrong-typed field falls back on its own', () => {
  const c = parseConfig(JSON.stringify({ isOn: 'yes', mode: 'turbo', manualMode: 5, autoSwitch: 1, showStats: 'no', showCodex: null, redirect: ['x'], bareDispatch: 'deny' }))
  assert.deepEqual(c, { ...defaultConfig(), bareDispatch: 'deny' })
  assert.deepEqual(parseConfig('{"redirect":{"a":"b","c":5}}').redirect, { a: 'b' })
  assert.equal(parseConfig('{"mode":"strict","manualMode":"nope"}').manualMode, 'strict')
})

test('autoMode: pressure raises strictness, never loosens, off or unknown keeps manual', () => {
  const on = (manualMode, autoSwitch = true) => ({ ...defaultConfig(), manualMode, autoSwitch })
  assert.equal(autoMode(on('balanced'), 79), 'balanced')
  assert.equal(autoMode(on('balanced'), 80), 'economy')
  assert.equal(autoMode(on('balanced'), 89), 'economy')
  assert.equal(autoMode(on('balanced'), 90), 'strict')
  assert.equal(autoMode(on('balanced'), null), 'balanced')
  assert.equal(autoMode(on('strict'), 85), 'strict')
  assert.equal(autoMode(on('balanced', false), 95), 'balanced')
  assert.equal(autoMode(on('quality'), 85), 'economy')
})
