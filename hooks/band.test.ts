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
    expect(await ui.find({ type: 'Text', text: /model-routing/ })).toBeUndefined()
    await ui.unmount()
  }

  await step({ model: 'claude-opus-5-5' }, { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' })
  await step({ model: 'claude-haiku-5-5', agentId: 'a1' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' })
  await step({ model: 'claude-sonnet-5-5', agentId: 'a2' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'model-routing', surface, component: 'AbovePrompt', props: PROPS })
    const row = await ui.find({ type: 'Text', text: /model-routing/ })
    expect(row?.text).toBe('model-routing: 1 haiku, 1 sonnet - API $0.06 vs $0.24 at parent')
    await ui.unmount()
  }

  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined } as any)
  await step({ model: 'claude-sonnet-5-5', agentId: 'a3' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })
  const after = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await after.find({ type: 'Text', text: /model-routing/ }))?.text).toBe('model-routing: 1 sonnet - API $0.06 vs $0.12 at parent')
  await after.unmount()
  await $.session.end({ reason: 'other', sessionId: 's', resume: undefined } as any)

  shownModel = 'Opus 5.5'
  await step({ model: 'claude-sonnet-5-5', agentId: 'a4' }, { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })
  const unnamed = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await unnamed.find({ type: 'Text', text: /model-routing/ }))?.text).toBe('model-routing: 1 sonnet - API $0.06')
  await unnamed.unmount()
  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined } as any)
  const ui = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /model-routing/ })).toBeUndefined()
  await ui.unmount()
})

const USAGE = { input_tokens: 20000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }

const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')

async function bandRow($: any, on: any, files: Record<string, string>, env: Record<string, string> = { CLAUDE_CONFIG_DIR: 'C:/cfg' }, readFails = false) {
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }) as any)
  on('env.get', async (_$: any, e: any) => ({ value: env[e.name] }) as any)
  on('fs.exists', async (_$: any, e: any) => ({ value: slashed(e.path) in files }) as any)
  on('fs.read', async (_$: any, e: any) => {
    if (readFails) throw new Error('unreadable')
    return { value: files[slashed(e.path)] } as any
  })
  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined })
  const s = $.turn.step({ turnId: 't', index: 0, messageCount: 1, model: 'claude-sonnet-5-5', agentId: 'a1' })
  for await (const _ of s) { /* drain */ }
  const ui = await $.ui.mount({ plugin: 'model-routing', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const text = (await ui.find({ type: 'Text', text: /model-routing/ }))?.text
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

test('a read that throws falls back to warn and says so', async ($, on) => {
  const text = await bandRow($, on, { [CONFIG_FILE]: '{"aboveSession":"off"}' }, undefined, true)
  expect(text).toMatch(/above session: 1 opus .*\(config not read\)$/)
})

test('a malformed config.json falls back to the defaults without a label', async ($, on) => {
  const text = await bandRow($, on, { [CONFIG_FILE]: '{not json' })
  expect(text).toMatch(/above session: 1 opus \(\+\$[\d.<]+\)$/)
  expect(text).not.toMatch(/config not read/)
})

test('an exempt list cannot be applied to rows without an agent type', async ($, on) => {
  const text = await bandRow($, on, { [CONFIG_FILE]: '{"exempt":["reviewer"]}' })
  expect(text).toMatch(/above session: 1 opus \(exempt not applied\)$/)
})

const OFF = '{"aboveSession":"off"}'
const HOME_FILE = 'C:/Users/u/.claude/model-routing/config.json'

test('with CLAUDE_CONFIG_DIR unset the config comes from USERPROFILE', async ($, on) => {
  const text = await bandRow($, on, { [HOME_FILE]: OFF }, { USERPROFILE: 'C:\\Users\\u' })
  expect(text).not.toMatch(/above session/)
})

test('with only HOME set the config comes from HOME', async ($, on) => {
  const text = await bandRow($, on, { [HOME_FILE]: OFF }, { HOME: 'C:/Users/u' })
  expect(text).not.toMatch(/above session/)
})

test('USERPROFILE wins over a Git Bash style HOME', async ($, on) => {
  const text = await bandRow($, on, { [HOME_FILE]: OFF }, { HOME: '/c/Users/u', USERPROFILE: 'C:\\Users\\u' })
  expect(text).not.toMatch(/above session/)
})

async function modeBand($: any, on: any, files: Record<string, string>) {
  const written: Record<string, string> = {}
  on('env.get', async (_$: any, e: any) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? 'C:/cfg' : undefined }) as any)
  on('fs.exists', async (_$: any, e: any) => ({ value: slashed(e.path) in written || slashed(e.path) in files }) as any)
  on('fs.read', async (_$: any, e: any) => ({ value: written[slashed(e.path)] ?? files[slashed(e.path)] }) as any)
  on('fs.write', async (_$: any, e: any) => {
    written[slashed(e.path)] = e.text
    return { value: undefined } as any
  })
  return written
}

const mount = ($: any, surface = 'terminal') => $.ui.mount({ plugin: 'model-routing', surface, component: 'AbovePrompt', props: PROPS })
const limits = (...rows: [string, number][]) => ({ rateLimits: rows.map(([kind, percentUsed]) => ({ kind, percentUsed })), changed: ['rateLimits'], context: {} }) as any

test('row 1 has the power, four mode and auto buttons on every surface and no show buttons', async ($, on) => {
  await modeBand($, on, {})
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    for (const label of ['on', 'economy', 'balanced', 'strict', 'quality', 'auto']) {
      expect(await ui.find({ type: 'Button', text: label })).toBeDefined()
    }
    expect(await ui.find({ type: 'Button', text: 'stats' })).toBeUndefined()
    expect(await ui.find({ text: /show/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /7d|denials|opus \?/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('pressing strict writes mode and manualMode to config.json and keeps unknown fields', async ($, on) => {
  const written = await modeBand($, on, { [CONFIG_FILE]: '{"bareDispatch":"deny","custom":1}' })
  const ui = await mount($)
  expect(written[CONFIG_FILE]).toBeUndefined()
  await ui.press({ key: 'strict' })
  const saved = JSON.parse(written[CONFIG_FILE])
  expect(saved.mode).toBe('strict')
  expect(saved.manualMode).toBe('strict')
  expect(saved.isOn).toBe(true)
  expect(saved.bareDispatch).toBe('deny')
  expect(saved.custom).toBe(1)
  await ui.unmount()
})

test('a config.json that is not a JSON object is never overwritten by a press', async ($, on) => {
  const written = await modeBand($, on, { [CONFIG_FILE]: '{not json' })
  const ui = await mount($)
  await ui.press({ key: 'strict' })
  expect(written[CONFIG_FILE]).toBeUndefined()
  await ui.unmount()
})

test('power off renders off', async ($, on) => {
  await modeBand($, on, { [CONFIG_FILE]: '{"isOn":false}' })
  const ui = await mount($)
  expect(await ui.find({ type: 'Button', text: 'off' })).toBeDefined()
  await ui.unmount()
})

test('row 2 is the limits alone, the ledger alone, both, and skips an unknown five_hour', async ($, on) => {
  await modeBand($, on, {})
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }) as any)
  on('session.measure', async (_$: any, e: any) => ({ changed: e.changed }))
  const row = async () => {
    const ui = await mount($)
    const text = (await ui.find({ type: 'Text', text: /week|model-routing|5h/ }))?.text
    await ui.unmount()
    return text
  }
  expect(await row()).toBeUndefined()

  await $.session.measure(limits(['seven_day', 41]))
  expect(await row()).toBe('week 41%')

  await $.session.measure(limits(['five_hour', 12.4], ['seven_day', 41]))
  expect(await row()).toBe('5h 12% - week 41%')

  await $.session.measure(limits(['seven_day', 50]))
  expect(await row()).toBe('5h 12% - week 50%')

  const s = $.turn.step({ turnId: 't', index: 0, messageCount: 1, model: 'claude-sonnet-5-5', agentId: 'a1' })
  for await (const _ of s) { /* drain */ }
  expect(await row()).toMatch(/^model-routing: 1 opus .* - 5h 12% - week 50%$/)

  await $.session.end({ reason: 'clear', sessionId: 's', resume: undefined } as any)
  expect(await row()).toBe('5h 12% - week 50%')
})
