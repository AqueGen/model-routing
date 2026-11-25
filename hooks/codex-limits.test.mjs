import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCodexLimits } from './codex-limits.mjs'

const NOW = 1_000_000
const line = (primary, secondary) =>
  JSON.stringify({ payload: { rate_limits: { primary: { used_percent: primary[0], resets_at: primary[1] }, secondary: { used_percent: secondary[0], resets_at: secondary[1] } } } })

function withDir(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mr-codex-'))
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true })
      writeFileSync(join(dir, name), text)
    }
    return fn(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('reads the last rate_limits line of the newest file', () => {
  withDir({ '2026/11/a.jsonl': `{"x":1}\n${line([10, NOW + 5], [20, NOW + 5])}\n${line([33, NOW + 5], [44, NOW + 5])}\n{"y":2}\n` }, (dir) =>
    assert.deepEqual(readCodexLimits(dir, NOW), { fiveHour: 33, week: 44 }))
})

test('a window whose reset is in the past counts as 0', () => {
  withDir({ 'a.jsonl': line([90, NOW - 1], [50, NOW + 5]) + '\n' }, (dir) =>
    assert.deepEqual(readCodexLimits(dir, NOW), { fiveHour: 0, week: 50 }))
})

test('no rate_limits line, a malformed one, or a missing dir gives null', () => {
  withDir({ 'a.jsonl': '{"x":1}\n' }, (dir) => assert.equal(readCodexLimits(dir, NOW), null))
  withDir({ 'a.jsonl': '{"rate_limits":{ broken\n' }, (dir) => assert.equal(readCodexLimits(dir, NOW), null))
  assert.equal(readCodexLimits(join(tmpdir(), 'mr-codex-does-not-exist'), NOW), null)
})
