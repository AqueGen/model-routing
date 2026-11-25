import { MODES, autoMode, defaultConfig, parseConfig } from './lib/config-core.mjs'
import { addSubagentStep, bandText, emptyLedger } from './lib/ledger.mjs'

const MINUTE = 60_000

let ledger = emptyLedger()
let sessionModel = null
let settings = null
let live = null
let timers = []
const stats = { claude5h: null, claudeWeek: null, codex5h: null, codexWeek: null }

async function configFile($) {
  const own = (await $.env.get('CLAUDE_CONFIG_DIR'))?.trim()
  const home = own ? null : (await $.env.get('USERPROFILE'))?.trim() || (await $.env.get('HOME'))?.trim()
  if (!own && !home) throw new Error('no config dir')
  const dir = own || `${home}/.claude`
  return `${dir.replaceAll('\\', '/').replace(/\/+$/, '')}/model-routing/config.json`
}

async function readSettings($) {
  try {
    const file = await configFile($)
    const config = (await $.fs.exists(file)) ? parseConfig(await $.fs.read(file)) : defaultConfig()
    return { config, configRead: true }
  } catch {
    return { config: defaultConfig(), configRead: false }
  }
}

// A failed read keeps what was known; nothing is written from a read.
async function readLive($) {
  try {
    const file = await configFile($)
    return (await $.fs.exists(file)) ? parseConfig(await $.fs.read(file)) : defaultConfig()
  } catch {
    return live ?? defaultConfig()
  }
}

// Merges into the raw file so fields this mod does not own survive. A file that
// exists but is not a JSON object is left alone.
async function saveConfig($, config) {
  const file = await configFile($)
  let raw = {}
  if (await $.fs.exists(file)) {
    try {
      raw = JSON.parse((await $.fs.read(file)).replace(/^﻿/, ''))
    } catch {
      return
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
  }
  await $.fs.write(file, JSON.stringify({ ...raw, ...config }, null, 2))
  live = config
}

async function applyAuto($) {
  const config = live ?? (live = await readLive($))
  const target = autoMode(config, stats.claudeWeek)
  if (config.isOn && target !== config.mode) await saveConfig($, { ...config, mode: target })
}

const refresh = ($) => { try { $.ui.invalidate('ui.render') } catch {} }

async function refreshConfig($) {
  live = await readLive($)
  refresh($)
}

async function refreshCodex($) {
  live ??= await readLive($)
  if (!live.showCodex) return
  try {
    const run = await $.process.run(['node', `${$.plugin.root}/hooks/codex-limits.mjs`])
    const limits = JSON.parse(run.stdout)
    stats.codex5h = limits?.fiveHour ?? null
    stats.codexWeek = limits?.week ?? null
  } catch {
    stats.codex5h = stats.codexWeek = null
  }
  refresh($)
}

const safely = (job) => () => { job().catch(() => {}) }
const stopTimers = () => { for (const t of timers) { try { t.cancel() } catch {} } timers = [] }
const every = ($, ms, job) => { try { timers.push($.clock.every(ms, safely(job))) } catch {} }
const pct = (v) => `${Math.round(v)}%`

function limitsText(config) {
  const parts = []
  if (config.showStats) {
    if (stats.claude5h != null) parts.push(`5h ${pct(stats.claude5h)}`)
    if (stats.claudeWeek != null) parts.push(`week ${pct(stats.claudeWeek)}`)
  }
  if (config.showCodex && stats.codex5h != null && stats.codexWeek != null) parts.push(`codex ${pct(stats.codex5h)}/${pct(stats.codexWeek)}`)
  return parts
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if (e.isInteractive === false) return result
    stopTimers()
    safely(() => refreshConfig($))()
    safely(() => refreshCodex($))()
    every($, MINUTE, () => refreshConfig($))
    every($, 10 * MINUTE, () => refreshCodex($))
    return result
  })

  on('session.measure', async ($, e, next) => {
    try {
      const limits = e.rateLimits ?? []
      if (limits.length) {
        const find = (kind) => limits.find((r) => r.kind === kind)?.percentUsed
        const five = find('five_hour')
        const week = find('seven_day')
        if (five != null) stats.claude5h = five
        if (week != null) stats.claudeWeek = week
        live = await readLive($)
        await applyAuto($)
        refresh($)
      }
    } catch {}
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && e.model) sessionModel = e.model
    const r = yield* next(e)
    if (e.agentId && r?.usage) {
      let parent = sessionModel
      if (!parent) { try { parent = await $.session.model() } catch {} }
      ledger = addSubagentStep(ledger, e.agentId, r.usage, parent, null)
      refresh($)
    }
    return r
  })

  on('session.end', async ($, e, next) => {
    ledger = emptyLedger()
    settings = null
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      sessionModel = null
      live = null
      stopTimers()
    }
    refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props?.hasSurvey) return next(e)
    settings ??= readSettings($)
    const ledgerText = bandText(ledger, await settings)
    live ??= await readLive($)
    const config = live
    const { Box, Button, Text } = $.ui.resolve(e)

    const toggle = (key, label, isOn, change) => Button({
      key,
      label,
      variant: isOn ? 'primary' : 'secondary',
      dimColor: !isOn,
      onPress: async () => {
        try {
          const fresh = await readLive($)
          await saveConfig($, change(fresh))
          await applyAuto($)
        } catch {}
        refresh($)
      },
    })
    const dim = (s) => Text({ dimColor: true, children: [s] })
    const limits = limitsText(config)
    const text = [ledgerText, ...limits].filter(Boolean).join(' - ')

    const controls = Box({
      children: [
        dim('routing '),
        toggle('power', config.isOn ? 'on' : 'off', config.isOn, (c) => ({ ...c, isOn: !c.isOn })),
        dim('  '),
        ...MODES.map((m) => toggle(m, m, config.isOn && config.mode === m, (c) => ({ ...c, mode: m, manualMode: m, isOn: true }))),
        dim('  '),
        toggle('auto', 'auto', config.autoSwitch, (c) => ({ ...c, autoSwitch: !c.autoSwitch, mode: c.manualMode })),
      ],
    })
    const theirs = await next(e)
    return Box({
      flexDirection: 'column',
      children: [controls, ...(text ? [Text({ children: [text] })] : []), ...(theirs ? [theirs] : [])],
    })
  })
}
