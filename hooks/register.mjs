import { DEFAULT_CONFIG, parseConfig } from './lib/config-core.mjs'
import { addSubagentStep, bandText, emptyLedger } from './lib/ledger.mjs'

let ledger = emptyLedger()
let sessionModel = null
let settings = null

async function readSettings($) {
  try {
    const own = (await $.env.get('CLAUDE_CONFIG_DIR'))?.trim()
    const home = own ? null : (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
    if (!own && !home) throw new Error('no config dir')
    const file = `${own || `${home}/.claude`}/model-routing/config.json`
    const config = (await $.fs.exists(file)) ? parseConfig(await $.fs.read(file)) : { ...DEFAULT_CONFIG, exempt: [] }
    return { config, configRead: true }
  } catch {
    return { config: DEFAULT_CONFIG, configRead: false }
  }
}

export function register(on) {
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && e.model) sessionModel = e.model
    const r = yield* next(e)
    if (e.agentId && r?.usage) {
      let parent = sessionModel
      if (!parent) { try { parent = await $.session.model() } catch {} }
      ledger = addSubagentStep(ledger, e.agentId, r.usage, parent, null)
      try { $.ui.invalidate('ui.render') } catch {}
    }
    return r
  })

  on('session.end', async ($, e, next) => {
    ledger = emptyLedger()
    sessionModel = null
    settings = null
    try { $.ui.invalidate('ui.render') } catch {}
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    settings ??= readSettings($)
    const text = bandText(ledger, await settings)
    if (e.props?.hasSurvey || !text) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    return Box({ flexDirection: 'column', children: [Text({ children: [text] }), ...(theirs ? [theirs] : [])] })
  })
}
