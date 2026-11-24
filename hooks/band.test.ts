import { expect, test } from 'claude-code/testing'

const PROPS = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10 }
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

test('the band stays empty until a subagent answers, then names models and both prices', async ($, on) => {
  let usage: any = null
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  let shownModel = 'claude-opus-5-5'
  on('session.model', async () => ({ value: shownModel }) as any)
  const step = async (input: any, u: any) => {
    usage = u
    const s = $.turn.step({ turnId: 't', index: 0, messageCount: 1, ...input })
    for await (const _ of s) { /* drain */ }
    return s.result
  }

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'model-routing', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ text: /model-routing/ })).toBeUndefined()
    await ui.unmount()
  }

  await step({ model: 'claude-opus-5-5' }, { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' })
  await step({ model: 'claude-haiku-5-5', agentId: 'a1' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' })
  await step({ model: 'claude-sonnet-5-5', agentId: 'a2' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'model-routing', surface, component: 'AbovePrompt', props: PROPS })
    const row = await ui.find({ text: /model-routing/ })
    expect(row?.text).toBe('model-routing: 1 haiku, 1 sonnet - API $0.06 vs $0.24 at parent')
    await ui.unmount()
  }

  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined } as any)
  await step({ model: 'claude-sonnet-5-5', agentId: 'a3' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })
  const after = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await after.find({ text: /model-routing/ }))?.text).toBe('model-routing: 1 sonnet - API $0.06 vs $0.12 at parent')
  await after.unmount()
  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined } as any)

  shownModel = 'Opus 5.5'
  await step({ model: 'claude-sonnet-5-5', agentId: 'a4' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })
  const unnamed = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await unnamed.find({ text: /model-routing/ }))?.text).toBe('model-routing: 1 sonnet - API $0.06')
  await unnamed.unmount()
  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined } as any)
  const ui = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await ui.find({ text: /model-routing/ })).toBeUndefined()
  await ui.unmount()
})

const USAGE = { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }

const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')

async function bandRow($: any, on: any, files: Record<string, string>, env: Record<string, string> = { CLAUDE_CONFIG_DIR: 'C:/cfg' }) {
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }) as any)
  on('env.get', async (_$: any, e: any) => ({ value: env[e.name] }) as any)
  on('fs.exists', async (_$: any, e: any) => ({ value: slashed(e.path) in files }) as any)
  on('fs.read', async (_$: any, e: any) => ({ value: files[slashed(e.path)] }) as any)
  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined })
  const s = $.turn.step({ turnId: 't', index: 0, messageCount: 1, model: 'claude-sonnet-5-5', agentId: 'a1' })
  for await (const _ of s) { /* drain */ }
  const ui = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const text = (await ui.find({ text: /model-routing/ }))?.text
  await ui.unmount()
  return text
}

const CONFIG_FILE = 'C:/cfg/model-routing/config.json'

test('a subagent above the session model is named in the band', async ($, on) => {
  const text = await bandRow($, on, {})
  expect(text).toMatch(/above session: 1 opus/)
  expect(text).not.toMatch(/config not read/)
})

test('aboveSession off in config.json drops the above-session part', async ($, on) => {
  const text = await bandRow($, on, { [CONFIG_FILE]: '{"aboveSession":"off"}' })
  expect(text).toMatch(/^model-routing: 1 opus/)
  expect(text).not.toMatch(/above session/)
})

test('an unreadable config falls back to warn and says so', async ($, on) => {
  const text = await bandRow($, on, {}, {})
  expect(text).toMatch(/above session: 1 opus .*\(config not read\)/)
})
