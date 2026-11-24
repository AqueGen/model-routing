import { addSubagentTurn, bandText, emptyLedger } from './lib/ledger.mjs'

let ledger = emptyLedger()
let sessionModel = null

export function register(on) {
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && e.model) sessionModel = e.model
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId && e.usage && sessionModel) {
      ledger = addSubagentTurn(ledger, sessionModel, e.usage)
      try { $.ui.invalidate('ui.render') } catch {}    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props?.hasSurvey) return next(e)
    const text = bandText(ledger, sessionModel)
    const { Box, Text } = $.ui.resolve(e)
    return Box({ children: [Text({ children: [text] })] })
  })
}
