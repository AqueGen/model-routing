import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'default-model.mjs')
const REASON = 'model-routing: a bare general-purpose dispatch runs on opus-5-5. Pass model "sonnet" for ordinary work, or "opus" when the task needs that reasoning.'

function hook({ config = { bareDispatch: 'deny' }, session = 'claude-opus-5-5', input = {}, stdin } = {}) {
  const cfg = mkdtempSync(join(tmpdir(), 'mr-dm-'))
  try {
    let transcript
    if (session) {
      transcript = join(cfg, 'session.jsonl')
      writeFileSync(transcript, JSON.stringify({ model: session }) + '\n')
    }
    if (config) {
      mkdirSync(join(cfg, 'model-routing'), { recursive: true })
      writeFileSync(join(cfg, 'model-routing', 'config.json'), JSON.stringify(config))
    }
    const r = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, CLAUDE_CODE_SUBAGENT_MODEL: '', CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '' },
      input: stdin ?? JSON.stringify({ tool_name: 'Agent', tool_input: input, transcript_path: transcript }),
      encoding: 'utf-8',
    })
    assert.equal(r.status, 0)
    return r.stdout
  } finally { rmSync(cfg, { recursive: true, force: true }) }
}

test('deny config, opus transcript and a bare general-purpose dispatch prints the deny JSON', () => {
  assert.deepEqual(JSON.parse(hook()), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON },
  })
})

test('nothing is printed for warn or off config, a sonnet session, an explicit model, no transcript or bad stdin', () => {
  assert.equal(hook({ config: { bareDispatch: 'warn' } }), '')
  assert.equal(hook({ config: { bareDispatch: 'off' } }), '')
  assert.equal(hook({ config: null }), '')
  assert.equal(hook({ session: 'claude-sonnet-5-5' }), '')
  assert.equal(hook({ input: { model: 'sonnet' } }), '')
  assert.equal(hook({ session: null }), '')
  assert.equal(hook({ stdin: '{not json' }), '')
  assert.equal(hook({ stdin: '' }), '')
})
