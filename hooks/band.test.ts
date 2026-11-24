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
