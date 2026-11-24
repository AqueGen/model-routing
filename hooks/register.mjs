import { addSubagentStep, bandText, emptyLedger } from './lib/ledger.mjs'

let ledger = emptyLedger()
let sessionModel = null

export function register(on) {
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && e.model) sessionModel = e.model
    const r = yield* next(e)
    if (e.agentId && r?.usage) {
      let parent = sessionModel
      if (!parent) { try { parent = await $.session.model() } catch {} }
      ledger = addSubagentStep(ledger, e.agentId, r.usage, parent)
      try { $.ui.invalidate('ui.render') } catch {}
    }
    return r
  })

  on('session.end', async ($, e, next) => {
    ledger = emptyLedger()
    sessionModel = null
    try { $.ui.invalidate('ui.render') } catch {}
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = bandText(ledger)
    if (e.props?.hasSurvey || !text) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    return Box({ flexDirection: 'column', children: [Text({ children: [text] }), ...(theirs ? [theirs] : [])] })
  })
}
