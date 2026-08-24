#!/usr/bin/env node
// Dispatch counter: logs every Agent-tool dispatch (PostToolUse hook) and
// prints kept-off-strongest stats for a status line.
//
//   node dispatch-counter.mjs          <- hook mode: read event JSON on stdin, append
//   node dispatch-counter.mjs stats    <- print "routed-down: N today · M 7d"
//   node dispatch-counter.mjs report   <- per-agent dispatch breakdown
//   node dispatch-counter.mjs tokens   <- real token volume per model from subagent transcripts
//
// Window flags (stats/report/tokens): --days N sizes the window (default 7),
// --ago M shifts it back M days (--days 7 --ago 7 = the week before last
// week's end); --session <family> scopes to sessions whose model matches
// (e.g. "fable" when a fallback ladder mixes tiers into one window).
// Dispatch history is retained 30 days; tokens reach as far back as
// Claude Code keeps transcripts (cleanupPeriodDays).
//
// "Routed down" = the dispatch's effective model (explicit model param, else
// the agent's frontmatter pin) ranks below the recorded session model. Entries
// missing either side fall back to a cheap-agent/cheap-tier heuristic. Counts
// dispatches, not tokens - honest bookkeeping, no dollar fiction.
// Each entry also records the session's effort level and which source it came
// from - CLAUDE_CODE_EFFORT_LEVEL, else the settings cascade, else the model's
// documented default - so the report can show the second knob: dispatches on
// agent types with no known pin inherit it, pinned agents do not.
// Log lives in <config>/model-routing/dispatches.jsonl and self-prunes to 30d.

import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;

// Stamped on every report so a pasted screenshot answers "which version wrote
// this" without a second round trip - the question that costs the most time
// when someone reports a report that looks wrong. Read from the manifest next
// to this script rather than CLAUDE_PLUGIN_ROOT, which the hook sets but a
// direct `node hooks/dispatch-counter.mjs report` does not. Unreadable manifest
// degrades to an unlabelled header; a version stamp must never break a report.
const PLUGIN_VERSION = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, "..", ".claude-plugin", "plugin.json"), "utf-8")).version ?? null;
  } catch {
    return null;
  }
})();
const versionSuffix = PLUGIN_VERSION ? ` - model-routing ${PLUGIN_VERSION}` : "";

// Window flags: --days N (size, default 7) and --ago M (shift back M days).
// Bad values fall back to the default rather than erroring - a stats tool
// must never be harder to run than the thing it measures.
function windowFromArgs(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    const v = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const days = flag("--days") ?? 7;
  const ago = flag("--ago") ?? 0;
  const end = Date.now() - ago * DAY_MS;
  return { start: end - days * DAY_MS, end, days, ago };
}

// --session <family> scopes a report to sessions whose model matches the
// substring (e.g. "fable", "opus") - useful when a fallbackModel ladder or
// manual /model switches mix session tiers inside one window and you only
// want the situation that matches your default. Case-insensitive.
function sessionFilterFromArgs(argv) {
  const i = argv.indexOf("--session");
  return i >= 0 && argv[i + 1] ? String(argv[i + 1]).toLowerCase() : null;
}
// Frontmatter pins of the bundled agents, model and effort together. A bare
// dispatch (no model param) still runs on the pinned model, so classification
// must resolve through this table or bare implementer dispatches (pin=sonnet
// since 0.6.0) get miscounted as session-tier work; the effort column is the
// second cost knob, which moves cost as hard as tier does. One table rather
// than two because they are two columns of one fact - the agent's frontmatter -
// and asking "is this agent pinned" through separate tables let them disagree.
// Keep in sync with agents/*.md; one sync test guards both columns.
const AGENT_PINS = {
  "model-routing:scout": { model: "sonnet", effort: "low" },
  "model-routing:surveyor": { model: "haiku", effort: "low" },
  "model-routing:test-runner": { model: "haiku", effort: "low" },
  "model-routing:e2e-runner": { model: "sonnet", effort: "medium" },
  "model-routing:verifier": { model: "haiku", effort: "low" },
  "model-routing:implementer": { model: "sonnet", effort: "medium" },
  "model-routing:reviewer": { model: "opus", effort: "high" },
};
const pinnedModel = (agent) => AGENT_PINS[agent]?.model ?? null;
const pinnedEffort = (agent) => AGENT_PINS[agent]?.effort ?? null;
// Unpinned agent types that are inherently cheap dispatch targets.
const CHEAP_AGENTS = new Set(["Explore"]);

function configDir() {
  return process.env.CLAUDE_CONFIG_DIR?.trim()
    ? resolve(process.env.CLAUDE_CONFIG_DIR)
    : join(homedir(), ".claude");
}

function dataFile() {
  const dir = join(configDir(), "model-routing");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "dispatches.jsonl");
}

// The session's reasoning effort, and where it came from. Transcripts record no
// effort at all, so it is reconstructed from the sources Claude Code documents,
// in the precedence Claude Code itself applies:
//   1. CLAUDE_CODE_EFFORT_LEVEL - overrides settings for the session, and is the
//      only place `max` is accepted. `auto` means "use the model default".
//   2. the settings cascade, local > project > user. Settings accept only
//      low/medium/high/xhigh; `max` and `ultracode` are session-only there and
//      are rejected in a settings file.
//   3. the model default, which is what an unset key actually means - `high`
//      wherever effort is supported, `xhigh` on Opus 4.7. Recording it beats
//      omitting the most common configuration of all.
// A `/effort` change or a `--effort` flag inside a running session is invisible
// to all three, and an agent may carry its own effort pin this script cannot
// see; the report states both limits rather than implying precision it lacks.
// Reads one key and never emits anything else from these files, which routinely
// hold secrets.
const SETTINGS_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);
const ENV_EFFORTS = new Set([...SETTINGS_EFFORTS, "max"]);

// Which levels each model offers, transcribed from the Claude Code docs (Model
// configuration, "Adjust effort level") rather than inferred from version
// numbers: that table is an explicit enumeration and it states "Models not
// listed here do not support effort". Being rankable by TIER_PATTERNS is
// therefore NOT the test - claude-3-5-sonnet ranks fine and has no effort knob
// at all, and Haiku 4.5 is absent from the table entirely. Add a row when the
// docs add a model; assert nothing for one that is not listed.
// Deliberately a SECOND table rather than columns added to TIER_PATTERNS: tier
// is a property of the family (every opus ranks 3) while effort support is a
// property of the version, so one ordered list would have to repeat the tier
// across every version row and add a family fallback carrying no efforts. A
// consistency test pins the two together instead - every model named here must
// be rankable there.
const EFFORT_SUPPORT = [
  // mythos-5 rides with fable-5 here for the same reason it does in PRICES and
  // TIER_PATTERNS: same generation, same knobs. Leaving it out of this one table
  // was the only way the three could disagree, and it did.
  [/fable-5|mythos-5|opus-5|sonnet-5|opus-4-8|opus-4-7/, ["low", "medium", "high", "xhigh", "max"]],
  [/opus-4-6|sonnet-4-6/, ["low", "medium", "high", "max"]],
];
const EFFORT_LADDER = ["low", "medium", "high", "xhigh", "max"];
const effortLevelsFor = (m) => (m ? EFFORT_SUPPORT.find(([re]) => re.test(m))?.[1] ?? null : null);

// "The API default is high" - on every model that supports effort, with no
// exception. Opus 4.7 and 4.8 RECOMMEND starting at xhigh for coding and
// agentic work, and this table used to record that recommendation as if it were
// the default, which mislabelled every unset 4.7 session as xhigh when it ran
// high. A recommendation is what you should pass; a default is what runs when
// you pass nothing, and only the second one can be inferred from an empty
// config. No support, no default - an unlisted or unrecognized session model
// never receives a fabricated level.
function defaultEffortFor(sessionModel) {
  return effortLevelsFor(sessionModel) ? "high" : null;
}

// "If you set a level the active model does not support, Claude Code falls back
// to the highest supported level at or below the one you set. For example,
// xhigh runs as high on Opus 4.6." So a configured level is not necessarily the
// level that applies, and the clamp closes the gap this hook CAN see. Others it
// cannot: an organization effort cap, and the model-default hold that Fable 5,
// Opus 4.8 and Opus 4.7 apply on first run "even if you previously set a
// different level", overriding a persisted setting until an explicit choice is
// made. The report names both rather than claiming more than it knows.
// No session model means the
// clamp cannot be computed, so nothing is recorded: a configured `high` on a
// session whose transcript could not be read might have been a Haiku 4.5
// session, where the level does not exist at all. That matches how the rest of
// this report treats an unknown session - excluded, never guessed.
function clampEffort(level, sessionModel) {
  const levels = effortLevelsFor(sessionModel);
  if (!levels) return null;
  if (levels.includes(level)) return level;
  for (let i = EFFORT_LADDER.indexOf(level) - 1; i >= 0; i--) {
    if (levels.includes(EFFORT_LADDER[i])) return EFFORT_LADDER[i];
  }
  return null;
}

function sessionEffort(cwd, sessionModel) {
  const fromDefault = () => {
    const def = defaultEffortFor(sessionModel);
    return def ? { effort: def, effortFrom: "default" } : null;
  };
  const asRan = (level, from) => {
    const ran = clampEffort(level, sessionModel);
    return ran ? { effort: ran, effortFrom: from } : null;
  };
  const env = process.env.CLAUDE_CODE_EFFORT_LEVEL?.trim();
  if (env) {
    if (env === "auto") return fromDefault();
    // An unrecognized override is still an override: settings were bypassed,
    // and by what is unknown, so assert nothing rather than reporting the
    // level the session did NOT run on.
    return ENV_EFFORTS.has(env) ? asRan(env, "env") : null;
  }
  for (const f of [
    join(cwd, ".claude", "settings.local.json"),
    join(cwd, ".claude", "settings.json"),
    join(configDir(), "settings.json"),
  ]) {
    let parsed;
    // An unreadable or malformed file is ignored wholesale by the harness too,
    // so deferring to the next rung matches what actually happens.
    try { parsed = JSON.parse(readFileSync(f, "utf-8")); } catch { continue; }
    if (!parsed || typeof parsed !== "object" || !Object.hasOwn(parsed, "effortLevel")) continue;
    // A file that DEFINES the key ends the walk whether or not the value is
    // usable. Falling through on a bad value would log the next rung's level,
    // which is not the level this session ran on - a wrong data point is worse
    // than a missing one.
    const v = parsed.effortLevel;
    return typeof v === "string" && SETTINGS_EFFORTS.has(v) ? asRan(v, "settings") : null;
  }
  return fromDefault();
}

function readEntries(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Tier ladder shared by dispatch judging and the tokens report. Returns null
// for models it does not recognize (a future model family) - callers must
// treat null as "unknown", never as a rank, or new models silently corrupt
// the routed-down math. Extend TIER_PATTERNS when a new family ships.
const TIER_PATTERNS = [[/fable|mythos/, 4], [/opus/, 3], [/sonnet/, 2], [/haiku/, 1]];
const tierOf = (m) => {
  if (!m) return null;
  for (const [re, tier] of TIER_PATTERNS) if (re.test(m)) return tier;
  return null;
};
const shortModel = (m) => m ? m.replace(/^claude-/, "").replace(/-\d{8}$/, "") : m;

// USD per million BASE INPUT and OUTPUT tokens, transcribed from the Anthropic
// pricing page, captured on the date below. Enumerated per model rather than
// per family for the same reason EFFORT_SUPPORT is: families span price changes
// (Opus 4.1 bills at three times Opus 4.5) and a loose pattern would quietly
// misprice a retired model. A model absent from this table is reported as
// unpriced volume, never as zero.
const PRICES_ASOF = "2026-08-11";
const SONNET5_STANDARD_FROM = Date.parse("2026-09-01T00:00:00Z");
const PRICES = [
  // Retired families first: a looser pattern below must not claim them.
  [/opus-4-1-|opus-4-20/, () => [15, 75]],
  // Pre-4.x ids put the generation first (claude-3-5-haiku-...), so both orders
  // are matched; the row above needs the same trick for claude-opus-4-20250514.
  [/3-5-haiku|haiku-3-5/, () => [0.8, 4]],
  [/fable-5|mythos-5/, () => [10, 50]],
  [/opus-5|opus-4-8|opus-4-7|opus-4-6|opus-4-5/, () => [5, 25]],
  // The one model on the page whose price changes on a date rather than with a
  // new id: introductory $2/$10 through 2026-08-31, standard $3/$15 after.
  [/sonnet-5/, (at) => (at < SONNET5_STANDARD_FROM ? [2, 10] : [3, 15])],
  [/sonnet-4-6|sonnet-4-5|sonnet-4-20/, () => [3, 15]],
  [/haiku-4-5/, () => [1, 5]],
];
// Prompt-caching multipliers, quoted from the same page: a 5-minute cache write
// costs 1.25x base input, a 1-hour write 2x, and a cache read 0.1x. Transcripts
// break cache writes down by TTL, so no averaging is needed.
const CACHE_WRITE_5M = 1.25, CACHE_WRITE_1H = 2, CACHE_READ = 0.1;

// Billable input volume: everything the model read, however it was cached.
// Output is counted separately because it prices an order of magnitude higher.
const volOf = (v) => v.in + v.cr + v.cw5 + v.cw1h;

// Dollars for one model's token counts, or null when the model is not on the
// price table. `at` is the instant the rates are taken from - the price of a
// window, not of today, since one model's rate changes on a date inside the
// horizon these reports can cover.
function costOf(model, v, at) {
  const row = model ? PRICES.find(([re]) => re.test(model)) : null;
  if (!row) return null;
  const [inRate, outRate] = row[1](at);
  const perTok = inRate / 1e6;
  return (v.in * perTok)
    + (v.cw5 * perTok * CACHE_WRITE_5M)
    + (v.cw1h * perTok * CACHE_WRITE_1H)
    + (v.cr * perTok * CACHE_READ)
    + (v.out * outRate / 1e6);
}

// Bounded fd reads, NOT readFileSync - these run inside the PostToolUse
// hook and session transcripts can be hundreds of MB. The optional vendor
// prefix accepts Bedrock/Vertex ids (us.anthropic.claude-...) while
// capturing from "claude-" so tierOf/shortModel see the same shape.
const MODEL_RE = /"model":"(?:[a-z0-9-]+\.)*(claude-[a-z0-9.-]+)"/g;
function readSlice(file, bytes, fromEnd) {
  let fd;
  try {
    fd = openSync(file, "r");
    const size = fstatSync(fd).size;
    const len = Math.min(bytes, size);
    if (!len) return "";
    const buf = Buffer.alloc(len);
    const n = readSync(fd, buf, 0, len, fromEnd ? size - len : 0);
    return buf.toString("utf-8", 0, n);
  } catch { return ""; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

function firstModelIn(file, bytes) {
  // Session-START model: the head of the session jsonl. Used by the tokens
  // report, which says so in its footer - a /model switch or fallback later
  // in the session is attributed to the start model.
  const m = readSlice(file, bytes, false).match(/"model":"(?:[a-z0-9-]+\.)*(claude-[a-z0-9.-]+)"/);
  return m?.[1] ?? null;
}

// Session model for the tokens report. The head names the model the session
// STARTED on, but a long session can push the first assistant message past the
// head window (measured here: 6 of 60 transcripts, all multi-MB), and
// returning null there dropped those sessions out of the routed-down math as
// "session unknown" - and they are the biggest ones, so the loss was
// concentrated exactly where it mattered. Fall back to the tail, accepting the
// lower precision: a late-window model beats no model.
const sessionModelOf = (file) => firstModelIn(file, 262144) ?? lastModelIn(file, 262144);

function lastModelIn(file, bytes) {
  // Model in effect NOW: the last model named in the transcript tail. The
  // dispatch hook uses this so /model switches, opusplan's plan->execute
  // handoff, and quota fallbacks judge each dispatch against the model the
  // session was actually on at dispatch time, not at session start.
  let last = null;
  for (const m of readSlice(file, bytes, true).matchAll(MODEL_RE)) last = m[1];
  return last;
}

// The model a dispatch actually ran on, in harness priority order: the
// CLAUDE_CODE_SUBAGENT_MODEL env override (recorded by the hook as e.env),
// else the explicit model param, else the agent's frontmatter pin, else
// unknown (session-model inheritance).
const effectiveModel = (e) => e.env ?? e.model ?? pinnedModel(e.agent) ?? null;

// A pinned agent has a FLOOR as well as a ceiling. The pin states how much
// reasoning the role needs - reviewer on opus because a missed bug costs more
// than the review - so a dispatch below it is not a cheaper way to do the job,
// it is a different and worse job, while still counting as "cheaper than the
// session" in every other figure here. The floor is min(pin, session) rather
// than the pin itself, because the pins-are-ceilings rule REQUIRES capping at
// the session model: reviewer on a sonnet session correctly runs sonnet, and
// that must not be flagged. Unpinned agent types have no floor at all.
function belowPin(e) {
  // CLAUDE_CODE_SUBAGENT_MODEL forces every subagent at once, so it is a
  // deliberate machine-wide setting rather than a judgement made per dispatch.
  // Flagging it would fill this section with rows whose only remedy is unsetting
  // the variable, which the env= rows already say plainly.
  if (e.env) return false;
  const tp = tierOf(pinnedModel(e.agent));
  const te = tierOf(effectiveModel(e));
  const ts = tierOf(e.session);
  // An unknown tier on ANY of the three sides means no verdict, the same rule
  // verdictOf applies to its own pair. Assuming an unrecognized session could
  // afford the pin would claim a below-pin dispatch that the report then files
  // under "not tier-comparable", leaving the headline asserting a section that
  // does not render.
  if (tp == null || te == null || ts == null) return false;
  return te < Math.min(tp, ts);
}

// The documented fallback for entries the tier comparison cannot judge: cheap =
// a known cheap agent, or sonnet tier or below. Ranked via tierOf so dashed full
// ids ("claude-sonnet-5...") classify the same as short names.
//
// It used to open with a tier comparison of its own, which was dead code: its
// only caller reaches it precisely when that comparison is impossible, so the
// branch could never be entered. Two copies of the same rule, one unreachable,
// is how the two drift apart unnoticed.
function isCheapByHeuristic(e) {
  return CHEAP_AGENTS.has(e.agent) || (tierOf(effectiveModel(e)) ?? 99) <= 2;
}

if (process.argv[2] === "stats" || process.argv[2] === "report") {
  const win = windowFromArgs(process.argv);
  const sf = sessionFilterFromArgs(process.argv);
  const winLabel = (win.ago ? `${win.days}d ending ${win.ago}d ago` : `${win.days}d`)
    + (sf ? `, ${sf} sessions` : "");
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const entries = readEntries(dataFile())
    .filter((e) => e.ts >= win.start && e.ts < win.end)
    .filter((e) => !sf || (e.session && shortModel(e.session).toLowerCase().includes(sf)));
  if (!entries.length) {
    // Say WHY there is nothing rather than printing nothing - an empty
    // report is indistinguishable from a broken node/shell run.
    process.stdout.write(process.argv[2] === "stats"
      ? `routed-down: no data (${winLabel})`
      // The version belongs here most of all: an empty report is the one people
      // screenshot, and "which version" is the first thing it has to answer.
      : `No dispatches logged in the window (${winLabel})${versionSuffix}.\nLog: ${dataFile()} - history kept 30 days.\nEntries appear after the first Agent dispatch once the plugin's PostToolUse hook is active (plugin enabled + session restarted).`);
    process.exit(0);
  }
  // Per-entry verdict: down / at / up / unknown. "up" = the effective model
  // ranks ABOVE the session tier: a pin above the session model that nobody
  // capped with model=<session> - the miss the pins-are-ceilings rule warns
  // about, made visible instead of lumped in with deliberate at-tier work.
  const verdictOf = (e) => {
    const eff = effectiveModel(e);
    if (eff && tierOf(eff) == null) return "unknown";
    if (eff && e.session) {
      const tm = tierOf(eff), ts = tierOf(e.session);
      // A recorded session on an unrecognized family is just as
      // non-comparable as an unrecognized agent model - exclude it rather
      // than letting the heuristic guess a verdict for half the pair.
      if (tm != null && ts == null) return "unknown";
      if (tm != null && ts != null) return tm < ts ? "down" : tm > ts ? "up" : "at";
    }
    // No session recorded at all (pre-0.5.3 entries): the documented
    // cheap-tier heuristic.
    return isCheapByHeuristic(e) ? "down" : "at";
  };
  const down = entries.filter((e) => verdictOf(e) === "down");
  const upCount = entries.filter((e) => verdictOf(e) === "up").length;
  const unknownCount = entries.filter((e) => verdictOf(e) === "unknown").length;
  // "today" only makes sense for a window that includes today.
  const todayPart = win.ago ? "" : `${down.filter((e) => e.ts >= dayStart).length} today · `;
  if (process.argv[2] === "stats") {
    process.stdout.write(`routed-down: ${todayPart}${down.length} ${winLabel}`);
    process.exit(0);
  }
  // report: per-agent breakdown over the window. Classification happens per
  // ENTRY (session included) while aggregating, never re-derived from the
  // row key - a key can aggregate dispatches from sessions on different
  // tiers, and a key-level re-judgement contradicted the headline (a bare
  // pin=sonnet implementer from a sonnet session is NOT routed down).
  const byAgent = new Map(); // key -> { n, down, up, unknown, underPin }
  for (const e of entries) {
    // Below-pin dispatches carry the pin in the key as well as the model, for two
    // reasons. The row then reads as the comparison it is rather than as an
    // ordinary cheap dispatch - and, load-bearing for the grouping below, the
    // suffix PARTITIONS the keys: it is appended exactly when belowPin is true,
    // so one key can never mix below-pin dispatches with correct ones. Move this
    // into the row text instead and rows start mis-bucketing silently.
    const under = belowPin(e);
    const key = e.env ? `${e.agent} (env=${e.env})`
      : e.model ? `${e.agent} (model=${e.model}${under ? `, pin=${pinnedModel(e.agent)}` : ""})`
      : pinnedModel(e.agent) ? `${e.agent} (pin=${pinnedModel(e.agent)})`
      : e.agent;
    const s = byAgent.get(key) ?? { n: 0, down: 0, up: 0, unknown: 0, underPin: 0 };
    s.n++;
    if (under) s.underPin++;
    const v = verdictOf(e);
    if (v === "unknown") s.unknown++;
    else if (v === "down") s.down++;
    else if (v === "up") s.up++;
    byAgent.set(key, s);
  }
  const underPinCount = [...byAgent.values()].reduce((a, s) => a + s.underPin, 0);
  const rows = [...byAgent.entries()].sort((a, b) => b[1].n - a[1].n);
  // Session-model breakdown: which main model the dispatch was routed FROM.
  // Entries older than 0.5.3 lack the field and are grouped as unrecorded.
  const bySession = new Map();
  for (const e of entries) {
    const key = e.session ? shortModel(e.session) : "(session not recorded)";
    const s = bySession.get(key) ?? { n: 0, cmp: 0, down: 0 };
    s.n++;
    const v = verdictOf(e);
    // Same comparable-only denominator as the headline - a session row
    // must not quietly disagree with it.
    if (v !== "unknown") s.cmp++;
    if (v === "down") s.down++;
    bySession.set(key, s);
  }
  const sessionRows = [...bySession.entries()].sort((a, b) => b[1].n - a[1].n);
  // Tier leaks: bare dispatches of an agent type carrying no pin THIS PLUGIN
  // knows about (general-purpose, custom types), made from a strong session
  // (> sonnet). Such a dispatch inherits the session model - unless the agent
  // pins its own in frontmatter, which the dispatch log cannot see and which is
  // common: an agent from another plugin can pin sonnet and still land here
  // looking exactly like an inherited opus dispatch. So this section counts
  // dispatches that COULD have inherited, and says so; the measured answer is
  // in `tokens`, which reads the model each subagent actually ran on. Bundled
  // agents are frontmatter-pinned and never leak; Explore is inherently cheap.
  // Threshold is the research rework line: when a
  // routed-down tier would need rework >~20% of the time the price edge
  // is gone - here inverted, >20% of cheap-capable dispatches leaking UP
  // is the same signal that the tier assignment is not holding.
  const BUNDLED = new Set([...Object.keys(AGENT_PINS), ...CHEAP_AGENTS]);
  const unpinned = entries.filter((e) => !BUNDLED.has(e.agent));
  // The question "did this inherit a STRONG session model" is only answerable
  // where the session model is both recorded and rankable. An entry without one
  // was previously kept in the denominator and could only ever come out clean:
  // `?? 0` ranked an unrecognized family as the cheapest tier there is, so a bare
  // dispatch on a future top-tier model counted as a non-leak and diluted the
  // rate. Unknown now leaves the fraction entirely and is declared on its own
  // line - the same rule the routed-down math and the below-pin flag already use.
  const capable = unpinned.filter((e) => e.session && tierOf(e.session) != null);
  const unrankable = unpinned.length - capable.length;
  // An env override means the dispatch did NOT inherit the session model,
  // no matter that the call itself was bare - not a leak.
  const leaks = capable.filter((e) => !e.env && !e.model && tierOf(e.session) > 2);
  const LEAK_WARN = 0.20;
  const leakLines = [];
  if (capable.length) {
    const rate = leaks.length / capable.length;
    leakLines.push("", `Tier leaks: ${leaks.length} of ${capable.length} dispatches on agent types with no pin this plugin knows (${Math.round(rate * 100)}%) went out bare on a strong session - each inherited that session model unless its own frontmatter pinned one.`);
    if (rate > LEAK_WARN) leakLines.push(`  ! above the 20% rework threshold - pass an explicit model= on general-purpose/custom dispatches (sonnet default). Check "Inherited the session model bare" in \`tokens\` first: it reports the volume that actually ran at the session tier, and a foreign agent pinning its own model shows up here but not there.`);
  }
  if (unrankable) {
    leakLines.push(
      ...(capable.length ? [] : ["", "Tier leaks: not measurable in this window."]),
      `  ${unrankable} unpinned dispatch(es) left out: no session model recorded, or one on a family TIER_PATTERNS cannot rank. Whether they inherited something strong is not knowable, so they are not counted either way.`
    );
  }
  // Effort, the knob the tier columns cannot show. A dispatch on an agent type
  // with no known pin inherits the session level, so cheap-tier work can still
  // think at the session's expense - the failure mode a tier-only report calls a
  // success. Counted only over entries that recorded an effort: pre-0.15 logs
  // have none, and neither does a session on a model the docs list as having no
  // effort support at all.
  const effortLines = [];
  const withEffort = entries.filter((e) => e.effort);
  if (withEffort.length) {
    const inherited = withEffort.filter((e) => !pinnedEffort(e.agent));
    const byLevel = [...inherited.reduce((m, e) => m.set(e.effort, (m.get(e.effort) ?? 0) + 1), new Map())]
      .sort((a, b) => b[1] - a[1])
      .map(([lvl, n]) => `${n} at ${lvl}`)
      .join(", ");
    // Scoped to `inherited`, not to `withEffort`: the sentence below reads as a
    // subset of the count in the line above it, and a pinned agent on the model
    // default would otherwise print "8 of these" under a total of 2.
    const inferred = inherited.filter((e) => e.effortFrom === "default").length;
    effortLines.push(
      "",
      `Effort: ${inherited.length} of ${withEffort.length} dispatches ran on an agent type carrying no pin this plugin knows about, and so inherited the session level${byLevel ? ` (${byLevel})` : ""}.`,
      `  The bundled agents pin theirs in frontmatter, so routing a mechanical errand through a role agent buys a cheaper effort as well as a cheaper tier. An agent from anywhere else may pin its own effort, which is invisible here and counted as inherited.`,
      ...(inferred ? [`  ${inferred} of these levels are the documented model default rather than an observed setting.`] : []),
      `  Source order is CLAUDE_CODE_EFFORT_LEVEL, then settings effortLevel, then the model default. Four states can override that and none are visible here: a /effort or --effort choice inside a running session, ultracode, an organization effort cap, and the model-default hold Fable 5 / Opus 4.8 / Opus 4.7 apply on first run over a previously set level.`,
    );
  }
  // Grouped sections instead of per-row v/- markers: the reader should not
  // need a legend to see what ran cheap and what ran at the session tier.
  const groups = { down: [], top: [], up: [], underPin: [], unknown: [] };
  for (const [agent, s] of rows) {
    const judged = s.n - s.unknown;
    const at = judged - s.down - s.up;
    // Mixed rows (same key dispatched from sessions on different tiers) go
    // to the majority side, annotated so a row never silently contradicts
    // the headline count.
    // Both forms count out of `judged`, never `s.n`: the headline excluded the
    // unknown entries, so a row saying "1 of 3" under it described a population
    // the reader could not reconcile with anything on screen.
    const mixed = s.up > 0
      ? (s.up < judged ? ` [${s.down} down / ${at} at / ${s.up} above]` : "")
      : (s.down > 0 && s.down < judged ? ` [${s.down} of ${judged} down]` : "");
    const row = `${String(s.n).padStart(4)}  ${agent}${mixed}`;
    if (s.unknown === s.n) groups.unknown.push(row);
    // Checked before the cheaper/at-tier split: these ARE cheaper than the
    // session, which is exactly why they need their own section instead of
    // sitting in the win column. They can never reach the `up` branch either:
    // belowPin requires te < min(tp, ts) <= ts, so every such entry is "down"
    // and s.up is necessarily 0 for the key.
    else if (s.underPin === s.n) groups.underPin.push(row);
    else if (s.up >= s.down && s.up > at) groups.up.push(row);
    else if (s.down >= at) groups.down.push(row);
    else groups.top.push(row);
  }
  const comparable = entries.length - unknownCount;
  const pct = comparable ? Math.round((down.length / comparable) * 100) : 0;
  const section = (title, rows2) => rows2.length ? ["", title, ...rows2] : [];
  const lines = [
    `Model routing report - ${winLabel}${versionSuffix}`,
    "",
    `${down.length} of ${comparable}${unknownCount ? " comparable" : ""} dispatches (${pct}%) ran on a cheaper model than the session${unknownCount ? ` - ${unknownCount} not tier-comparable excluded` : ""}${todayPart ? ` (${todayPart.replace(" · ", "")})` : ""}.`,
    ...(upCount ? [`${upCount} ran ABOVE the session tier - a pin above the session model, uncapped; pins are ceilings only when the dispatch passes model=<session>.`] : []),
    ...(underPinCount ? [`${underPinCount} of the cheaper ones went BELOW their agent's own pin, which is not a saving - the pin is the tier the role needs, and nothing about the session required going under it.`] : []),
    ...section("Ran cheaper (routed down):", groups.down),
    ...section("Ran at the session tier (deliberate top-tier work or inheritance):", groups.top),
    ...section("Ran ABOVE the session tier (uncapped pin - pass model=<session> to enforce the ceiling):", groups.up),
    ...section("Ran BELOW the agent's pin (counted cheaper above, but the role was undercut - drop the model= override, or use an agent whose pin matches the work):", groups.underPin),
    ...section("Not tier-comparable (unrecognized model or unknown session family - extend TIER_PATTERNS):", groups.unknown),
    "",
    "By session model:",
    ...sessionRows.map(([m, s]) => `  ${m}: ${s.down} of ${s.cmp} routed down (${s.cmp ? Math.round((s.down / s.cmp) * 100) : 0}%)${s.n > s.cmp ? ` - ${s.n - s.cmp} not comparable` : ""}`),
    ...leakLines,
    ...effortLines,
    "",
    `Log: ${dataFile()} - history kept 30 days.`,
  ];
  process.stdout.write(lines.join("\n"));
  process.exit(0);
}

if (process.argv[2] === "tokens") {
  // Real token volume per model from subagent transcripts, and how much of
  // it ran BELOW each subagent's own session model - sessions vary (fable
  // one day, opus another), so "routed down" is judged against the parent
  // session's model, not a fixed top tier. Windowing is by transcript
  // last-write time (mtime) - a good proxy, not per-turn accounting.
  const { readdirSync, statSync } = await import("node:fs");
  const win = windowFromArgs(process.argv);
  const sf = sessionFilterFromArgs(process.argv);
  const winLabel = (win.ago ? `${win.days}d ending ${win.ago}d ago` : `${win.days}d`)
    + (sf ? `, ${sf} sessions` : "");
  const projRoot = join(configDir(), "projects");
  const sessionModelCache = new Map();
  const perModel = new Map(); // model -> {agents, in, out, cr, cw5, cw1h, down}
  const perSession = new Map(); // session model -> {agents, vol, downVol}
  // agent type -> {agents, vol, models: Map(model -> vol), belowPinVol, bareVol}
  const perAgent = new Map();
  let metaless = 0; // agent transcripts whose sidecar named no type
  let unknownAgents = 0, unknownVol = 0; // models tierOf cannot rank
  // Cost accounting. The rate epoch is the END of the window, not "now", so a
  // historical window is priced at the rates that applied to it - one model on
  // the price table changes rate on a date that falls inside the horizon these
  // windows can reach.
  const priceAt = win.end;
  let costRan = 0, costInherited = 0, unpricedVol = 0, unpricedSessionVol = 0;
  let mainCost = 0, mainUnpricedVol = 0;
  // Main-session volume is the DENOMINATOR, not routable work: the session model
  // is fixed for the turn, so no routing decision can move it. Reported because a
  // routed-down percentage over subagents alone reads as "almost everything was
  // optimized" when subagents may be a small share of what was actually spent.
  const mainPerModel = new Map(); // model -> volume
  let mainSessions = 0;
  // Totals that ignore --session, so a scoped headline is never shown alone.
  let allDownVol = 0, allCmpVol = 0;
  // Transcripts that could not be read at all. Reported rather than swallowed:
  // main-session transcripts run to hundreds of MB, and readFileSync as a string
  // throws past V8's ~512MB limit. Dropping one silently would understate the
  // denominator, which biases the routed-down share UPWARD - the exact direction
  // of error this release exists to remove.
  let unreadable = 0;
  const readFileVols = (p, mtimeInWindow) => {
    // Per-line attribution: usage accumulates onto the model named on that line,
    // so a mid-run fallback splits the transcript across both models instead of
    // crediting everything to the last one seen. Lines carrying their own
    // timestamp are windowed individually - a resumed transcript has a fresh
    // mtime but old lines; lines without one fall back to the file mtime, which
    // the caller has already checked.
    const fileVols = new Map(); // model -> { in, out, cr, cw5, cw1h }
    let text;
    try { text = readFileSync(p, "utf-8"); } catch { unreadable++; return fileVols; }
    for (const line of text.split("\n")) {
      if (!line.includes('"usage"')) continue;
      try {
        const obj = JSON.parse(line);
        const m = obj.message ?? {};
        const u = m.usage; if (!u) continue;
        if (!m.model || m.model.startsWith("<")) continue;
        const lts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
        if (Number.isFinite(lts)) {
          if (lts < win.start || lts >= win.end) continue;
        } else if (!mtimeInWindow) continue;
        const v = fileVols.get(m.model) ?? { in: 0, out: 0, cr: 0, cw5: 0, cw1h: 0 };
        v.in += u.input_tokens ?? 0; v.out += u.output_tokens ?? 0;
        v.cr += u.cache_read_input_tokens ?? 0;
        // Cache writes are split by TTL because they are priced differently
        // (1.25x base input at 5 minutes, 2x at an hour). Whatever the breakdown
        // does not account for - a line carrying only the flat total, or a TTL
        // bucket added upstream that this code has never heard of - is charged
        // at the cheaper 5-minute rate. Taking the remainder rather than
        // choosing between the two shapes is what stops an unknown bucket from
        // disappearing out of both the volume and the cost.
        const cc = u.cache_creation;
        const e5 = cc?.ephemeral_5m_input_tokens ?? 0;
        const e1h = cc?.ephemeral_1h_input_tokens ?? 0;
        v.cw1h += e1h;
        v.cw5 += e5 + Math.max(0, (u.cache_creation_input_tokens ?? 0) - e5 - e1h);
        fileVols.set(m.model, v);
      } catch {}
    }
    return fileVols;
  };
  // Which AGENT ran a transcript. The usage lines name only the model, so
  // grouping volume by model answers "sonnet processed 325M" and never "which
  // role spent it" - and the two warnings in the dispatch report (volume below
  // an agent's pin, volume that inherited the session model bare) stay counts
  // with no magnitude beside them. Claude Code writes agent-<id>.meta.json
  // beside every agent-<id>.jsonl carrying `agentType` and, when the dispatch
  // passed one, `model`. That file is not a documented interface, so every
  // field is optional here: a sidecar that is missing, unreadable, or names no
  // type drops its transcript out of the per-agent section ONLY, and is
  // counted on its own line. Every total elsewhere in this report is computed
  // from the transcripts alone and is unaffected either way.
  const readMeta = (p) => {
    try {
      const m = JSON.parse(readFileSync(p.replace(/\.jsonl$/, ".meta.json"), "utf-8"));
      return m && typeof m.agentType === "string" && m.agentType ? m : null;
    } catch { return null; }
  };
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      // Depth 6 reaches Workflow-spawned agents too:
      // projects/<proj>/<session>/subagents/workflows/<wf-id>/agent-*.jsonl
      if (e.isDirectory()) { if (depth < 6) walk(p, depth + 1); continue; }
      if (!e.name.endsWith(".jsonl")) continue;
      // Two populations, deliberately kept apart: an agent- prefixed transcript
      // is subagent work (routable, the plugin's subject) and a bare
      // <session-id>.jsonl directly inside a project dir is the main session
      // (not routable, the denominator).
      //
      // The main-session test is POSITIVE - exactly depth 1, i.e.
      // projects/<proj>/<session-id>.jsonl - not "any .jsonl outside
      // subagents/". The walk descends to depth 6, so a negative test would
      // enrol any sidecar the harness writes beside a transcript (a journal, a
      // scratch file) as a whole session and inflate the very denominator the
      // routing share is measured against. A wrong denominator is worse than
      // none, because it gets quoted as fact.
      const isAgent = e.name.startsWith("agent-");
      const isMainSession = !isAgent && depth === 1;
      if (!isAgent && !isMainSession) continue;
      let st; try { st = statSync(p); } catch { continue; }
      // mtime below the window start = nothing inside can be newer; safe
      // early skip. The UPPER bound is deliberately NOT applied per file: a
      // resumed transcript carries a fresh mtime but may hold lines from a
      // historical --ago window - timestamped lines decide individually,
      // and lines without a timestamp count only when the mtime itself
      // falls inside the window.
      if (st.mtimeMs < win.start) continue;
      const mtimeInWindow = st.mtimeMs < win.end;
      const fileVols = readFileVols(p, mtimeInWindow);
      if (!fileVols.size) continue;
      if (isMainSession) {
        // Scoped by the same --session filter as the agents, so the denominator
        // always describes the same population as the headline above it.
        if (!sessionModelCache.has(p)) sessionModelCache.set(p, sessionModelOf(p));
        const sessionModel = sessionModelCache.get(p);
        if (sf && !(sessionModel && shortModel(sessionModel).toLowerCase().includes(sf))) continue;
        mainSessions++;
        for (const [model, v] of fileVols) {
          mainPerModel.set(model, (mainPerModel.get(model) ?? 0) + volOf(v));
          const c = costOf(model, v, priceAt);
          if (c == null) mainUnpricedVol += volOf(v); else mainCost += c;
        }
        continue;
      }
      // The parent session transcript is <session-id>.jsonl, sibling of the
      // first "subagents" dir on the path - one level up for plain Agent
      // dispatches, further up for Workflow agents nested in workflows/<wf>/.
      const anchored = p.match(/^(.*?)[\\/]subagents[\\/]/);
      const sessionJsonl = anchored ? anchored[1] + ".jsonl" : null;
      if (sessionJsonl && !sessionModelCache.has(sessionJsonl)) {
        sessionModelCache.set(sessionJsonl, sessionModelOf(sessionJsonl));
      }
      const sessionModel = sessionJsonl ? sessionModelCache.get(sessionJsonl) : null;
      const tsess = tierOf(sessionModel);
      // Accumulated BEFORE the filter returns: --session narrows to the sessions
      // where routing has the most room, so the scoped share is printed next to
      // the whole-window one rather than on its own.
      for (const [model, v] of fileVols) {
        const tm = tierOf(model);
        if (tm == null || tsess == null) continue;
        const vol = volOf(v);
        allCmpVol += vol;
        if (tm < tsess) allDownVol += vol;
      }
      if (sf && !(sessionModel && shortModel(sessionModel).toLowerCase().includes(sf))) continue;
      const sessKey = sessionModel ? shortModel(sessionModel) : "(session unknown)";
      // One transcript is one agent. This counter belongs OUTSIDE the per-model
      // loop below: a single agent whose volume splits across two models (a
      // mid-run fallback) was being counted once per model, so a report could
      // claim more agents than transcripts existed. The per-model rows are a
      // different question - "how many agents touched this model" - and there
      // counting once per file-and-model pair is the right answer.
      const ss = perSession.get(sessKey) ?? { agents: 0, vol: 0, cmpVol: 0, downVol: 0 };
      ss.agents++;
      perSession.set(sessKey, ss);
      const meta = readMeta(p);
      if (!meta) metaless++;
      // One transcript is one agent, counted here for the same reason ss.agents
      // is counted outside the per-model loop: a mid-run fallback splits the
      // volume across two models but is still a single dispatch.
      const pa = meta
        ? perAgent.get(meta.agentType) ?? { agents: 0, vol: 0, models: new Map(), belowPinVol: 0, bareVol: 0 }
        : null;
      if (pa) { pa.agents++; perAgent.set(meta.agentType, pa); }
      for (const [model, v] of fileVols) {
        const vol = volOf(v);
        // Cost as it ran, and what the same token counts would have cost had the
        // dispatch inherited the session model instead - the counterfactual the
        // charts in the README already frame as an upper bound. Both sides are
        // skipped together when either model is unpriced, so the difference is
        // never a comparison against a missing half. Which side was missing is
        // tracked separately: the two need different sentences, and reporting
        // both as "ran on an unpriced model" was false for the session-side case,
        // where the tokens ran on a perfectly priceable model.
        const ran = costOf(model, v, priceAt);
        const inherited = costOf(sessionModel, v, priceAt);
        if (ran == null) unpricedVol += vol;
        else if (inherited == null) unpricedSessionVol += vol;
        else { costRan += ran; costInherited += inherited; }
        const tm = tierOf(model);
        // Unknown tier on EITHER side = not comparable: excluded from the
        // routed-down denominator, reported on its own line - an exotic
        // agent model or a future-family session must not drag the share.
        if (tm == null || tsess == null) { unknownAgents++; unknownVol += vol; }
        const down = tm != null && tsess != null && tm < tsess;
        const s = perModel.get(model) ?? { agents: 0, in: 0, out: 0, cr: 0, cw5: 0, cw1h: 0, downVol: 0 };
        s.agents++; s.in += v.in; s.out += v.out; s.cr += v.cr; s.cw5 += v.cw5; s.cw1h += v.cw1h;
        if (down) s.downVol += vol;
        perModel.set(model, s);
        ss.vol += vol;
        // Per-session rows use the same comparable-only denominator as the
        // headline; non-comparable volume is shown, never percented.
        if (tm != null && tsess != null) ss.cmpVol += vol;
        if (down) ss.downVol += vol;
        if (!pa) continue;
        pa.vol += vol;
        pa.models.set(model, (pa.models.get(model) ?? 0) + vol);
        // Both verdicts are re-derived here from the model the transcript
        // actually ran on, not from the model the dispatch asked for. That is
        // the one thing this side of the report has and the dispatch log does
        // not: an override the harness declined, a fallback mid-run, or
        // CLAUDE_CODE_SUBAGENT_MODEL forcing every subagent at once all land in
        // the usage lines, while the dispatch log can only record the request.
        if (belowPin({ agent: meta.agentType, model, session: sessionModel })) pa.belowPinVol += vol;
        // Bare inheritance: an agent with no pin this plugin knows about, no
        // model= on the dispatch, that ran ON its session's model above the
        // sonnet line - the accidental-inheritance case the dispatch report
        // counts. The "ran on the session model" clause is what keeps a
        // machine-wide CLAUDE_CODE_SUBAGENT_MODEL out: that dispatch is bare in
        // the sidecar too, but it did not inherit anything.
        else if (!pinnedModel(meta.agentType) && meta.model == null && tm != null && tm === tsess && tsess > 2) pa.bareVol += vol;
      }
    }
  };
  walk(projRoot, 0);
  const fmtN = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(n);
  // Two decimals up to $1000, none above it: cents matter on a day's work and
  // are noise on a quarter's.
  // Sign outside the dollar mark, and magnitude judged on the absolute value:
  // the difference goes negative whenever subagents deliberately ran ABOVE the
  // session tier, which is a documented move, not an error state.
  const fmtUsd = (n) => (n < 0 ? "-$" : "$") + (Math.abs(n) >= 1000 ? Math.round(Math.abs(n)).toLocaleString("en-US") : Math.abs(n).toFixed(2));
  // One list of [label, amount], so the width is derived from the labels that
  // are actually printed. A separate width table would only be right while
  // somebody kept the two copies in step - the same failure as a hand-counted
  // constant, one indirection further away.
  const costRows = [
    // The three subagent rows only mean something when some subagent volume was
    // priceable; the main-session row stands on its own.
    ...(costRan ? [
      ["as it ran", costRan],
      ["had every subagent inherited its session model", costInherited],
      ["difference", costInherited - costRan],
    ] : []),
    ...(mainCost ? [["main sessions, same rates (not routable)", mainCost]] : []),
  ];
  const costW = Math.max(0, ...costRows.map(([l]) => l.length)) + 2;
  const mainRows = [...mainPerModel.entries()].sort((a, b) => b[1] - a[1]);
  const mainVolTotal = mainRows.reduce((a, [, v]) => a + v, 0);
  if (!perModel.size) {
    // Main-session volume still prints when it exists: "no dispatches yet" is a
    // real answer, and it is more useful next to what the session itself spent.
    // Deliberately "no subagent volume counted", not "nothing was delegated":
    // agent transcripts can exist and still contribute nothing to this window
    // (a resumed transcript whose lines are older than an --ago window, or one
    // carrying only synthetic model names).
    const mainNote = mainVolTotal
      ? `\n\nMain sessions in this window: ${fmtN(mainVolTotal)} across ${mainSessions} sessions, with no subagent volume counted against them.`
      : "";
    process.stdout.write(`No subagent transcripts found under ${projRoot} (${winLabel})${versionSuffix}.\nToken stats read Claude Code agent-*.jsonl transcript files; they appear after subagent dispatches. If your config lives elsewhere, set CLAUDE_CONFIG_DIR.${mainNote}`);
    process.exit(0);
  }
  const rows = [...perModel.entries()].map(([m, s]) => ({ m, vol: volOf(s), ...s }))
    .sort((a, b) => b.vol - a.vol);
  const total = rows.reduce((a, r) => a + r.vol, 0) || 1;
  const downTotal = rows.reduce((a, r) => a + r.downVol, 0);
  // Unknown-tier volume is excluded from the routed-down denominator - one
  // unrecognized model must not drag the percentage down (it is reported on
  // its own line instead).
  const comparableVol = Math.max(1, total - unknownVol);
  const bar = (v) => "#".repeat(Math.max(1, Math.round((v / total) * 24)));
  const sessionRows = [...perSession.entries()].sort((a, b) => b[1].vol - a[1].vol);
  // Rows are capped so a machine with dozens of agent types prints a report and
  // not a directory listing. What the cap leaves out is stated in words rather
  // than dropped: a truncated list that looks complete is how a "By agent"
  // section starts getting quoted as "nothing else spent anything".
  const AGENT_ROWS = 8;
  // Volume and its share as ONE padded field: padding the number alone leaves
  // the column ragged as soon as a share crosses from one digit to two.
  const volPct = (v) => `${fmtN(v)} (${Math.round((v / total) * 100)}%)`.padStart(13);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const agentRows = [...perAgent.entries()].sort((a, b) => b[1].vol - a[1].vol);
  const agentShown = agentRows.slice(0, AGENT_ROWS);
  const agentRest = agentRows.slice(AGENT_ROWS);
  const agentW = Math.max(0, ...agentShown.map(([a]) => a.length));
  // Volume the per-agent section could actually see. The two shares below are
  // taken against IT, not against the report total: a window where half the
  // sidecars are missing would otherwise print a below-pin share diluted by
  // volume that was never examined for a pin in the first place.
  const agentVol = agentRows.reduce((a, [, s]) => a + s.vol, 0);
  const belowPinVol = agentRows.reduce((a, [, s]) => a + s.belowPinVol, 0);
  const bareVol = agentRows.reduce((a, [, s]) => a + s.bareVol, 0);
  // Named worst-first, because the remedy differs per agent and an aggregate
  // ("40.1M below pin") tells you the size of a problem without telling you
  // whose it is.
  const worst = (pick) => agentRows.filter(([, s]) => pick(s) > 0).sort((a, b) => pick(b[1]) - pick(a[1]))
    .slice(0, 3).map(([a, s]) => `${a} ${fmtN(pick(s))}`).join(", ");
  const out = [
    `Subagent token volume - ${winLabel} (input + cache)${versionSuffix}:`,
    "",
    `${fmtN(downTotal)} of ${fmtN(total - unknownVol)} ${unknownVol ? "comparable " : ""}tokens (${Math.round((downTotal / comparableVol) * 100)}%) processed on a cheaper model than their session - judged per session (fable/opus days both count fairly).`,
    // A --session filter selects the sessions with the most room to route down,
    // so the scoped figure is never the only one on screen.
    ...(sf && allCmpVol ? [`Across ALL sessions, unfiltered: ${Math.round((allDownVol / allCmpVol) * 100)}% of ${fmtN(allCmpVol)} comparable tokens - the filter above scopes to sessions where routing has the most room.`] : []),
    "",
    ...rows.map((r) => `${shortModel(r.m).padEnd(16)} ${bar(r.vol).padEnd(25)} ${fmtN(r.vol).padStart(7)} (${Math.round((r.vol / total) * 100)}%)  ${r.agents} agents, out ${fmtN(r.out)}`),
    "",
    "By session model:",
    ...sessionRows.map(([m, s]) => `  ${m}: ${fmtN(s.vol)} across ${s.agents} agents - ${s.cmpVol ? `${Math.round((s.downVol / s.cmpVol) * 100)}% below session tier` : "not tier-comparable"}${s.cmpVol && s.vol > s.cmpVol ? ` (${fmtN(s.vol - s.cmpVol)} not comparable)` : ""}`),
    ...(agentRows.length ? [
      "",
      "By agent - which role processed the volume:",
      ...agentShown.map(([a, s]) => {
        const models = [...s.models.entries()].sort((x, y) => y[1] - x[1]).map(([m]) => shortModel(m)).join(", ");
        return `  ${volPct(s.vol)}  ${a.padEnd(agentW)}  ${plural(s.agents, "agent")} on ${models}`;
      }),
      ...(agentRest.length ? [`  ${volPct(agentRest.reduce((a, [, s]) => a + s.vol, 0))}  ${plural(agentRest.length, "more agent type")}, not listed`] : []),
      // Printed only when there IS volume to report: "0 below pin" reads as a
      // score, and this section is not one.
      ...(belowPinVol ? [`  Below the agent's own pin: ${fmtN(belowPinVol)} (${Math.round((belowPinVol / Math.max(1, agentVol)) * 100)}% of the volume seen here) - ${worst((s) => s.belowPinVol)}. Not a saving: the pin is the tier the role needs, so this is the same job done worse, and it counts as "routed down" in every other figure above.`] : []),
      ...(bareVol ? [`  Inherited the session model bare: ${fmtN(bareVol)} (${Math.round((bareVol / Math.max(1, agentVol)) * 100)}%) - ${worst((s) => s.bareVol)}. Unpinned agent types with no model= on the dispatch; pass one (sonnet default) or give the type a pin.`] : []),
      ...(metaless ? [`  ${plural(metaless, "transcript")} had no readable agent-<id>.meta.json sidecar and are absent from this section only - every total elsewhere in this report still counts them.`] : []),
    ] : []),
    ...(unknownAgents ? ["", `${unknownAgents} agents not tier-comparable (${fmtN(unknownVol)}), excluded from routed-down math - either the agent ran an unrecognized model family (extend TIER_PATTERNS in dispatch-counter.mjs) or no model could be read from the parent session transcript, which happens when the transcript is gone or names no model anywhere.`] : []),
    ...(unreadable ? ["", `${unreadable} transcript(s) could not be read (too large to load as one string, or unreadable) - the totals below understate by whatever they held.`] : []),
    ...(mainVolTotal ? [
      "",
      `Main sessions (not routable): ${fmtN(mainVolTotal)} across ${mainSessions} sessions.`,
      `Subagents are ${Math.round((total / (total + mainVolTotal)) * 100)}% of the ${fmtN(total + mainVolTotal)} total - routing governs that slice, and the session model is fixed for the turn, so the rest is not addressable by any routing decision.`,
      ...mainRows.map(([m, v]) => `  ${shortModel(m).padEnd(16)} ${fmtN(v).padStart(7)} (${Math.round((v / mainVolTotal) * 100)}%)`),
    ] : []),
    ...(costRan || mainCost || unpricedVol || unpricedSessionVol || mainUnpricedVol ? [
      "",
      `At API list prices (rates as of ${PRICES_ASOF}), this is what the volume above would have cost on the Claude API:`,
      ...costRows.map(([label, n]) => `  ${label.padEnd(costW)}${fmtUsd(n).padStart(12)}`),
      ...(unpricedVol || mainUnpricedVol ? [`  ${fmtN(unpricedVol + mainUnpricedVol)} tokens ran on a model absent from the price table and could not be priced${costRows.length ? ", so they are excluded from every figure above" : ""}.`] : []),
      // Kept separate from the line above because the cause is different and the
      // reader can act on it differently: nothing is wrong with the model that
      // ran, only with what we know about the session it would have inherited.
      ...(unpricedSessionVol ? [`  ${fmtN(unpricedSessionVol)} tokens ran on a priced model but under a session model that could not be priced, so pricing them "as it ran" without the inherited side would leave the difference below a comparison against a missing half${costRows.length ? " - they are excluded from every figure above too" : ""}.`] : []),
      // The counterfactual caveats belong to the counterfactual: in a window
      // with no priceable subagent volume there is no difference row for them
      // to qualify, and printing them anyway would describe a figure that is
      // not on screen.
      ...(costRan ? [
        "This is a counterfactual, not a bill: on a subscription you pay none of it, and the difference is the same upper bound the volume chart is - it assumes every subagent would otherwise have inherited the session model, which pinned agents from other plugins would not.",
        "The difference is conservative for a documented reason. Models from Opus 4.7, Sonnet 5 and Fable 5 onward use a tokenizer producing about 30% more tokens for the same text than Sonnet 4.6 and earlier, so re-pricing a cheap model's token count at an expensive model's rate understates the inherited side, and with it the difference. It does not touch what actually ran.",
      ] : []),
      "Two more modifiers understate every figure here. Cache writes whose transcript line names no TTL are charged at the cheapest write rate. And nothing in a usage line reveals whether fast mode (which doubles Opus 5 and Opus 4.8 rates) or US-only inference (1.1x on everything from 4.6) was in effect, so neither is applied.",
      "Rates are first-party Claude API list prices - Bedrock and Google Cloud bill separately and are not modelled. They are transcribed from the Anthropic pricing page on the date above and will drift; a window straddling a price change is priced wholly at the rates in effect at its end. Re-check PRICES in dispatch-counter.mjs before quoting a figure.",
    ] : []),
    "",
    "Volume = tokens the subagent processed; cache reads are billed at the subagent's model rate, which is where routing saves.",
    "Session model is read from the head of each session transcript - the model it started on - so a mid-session /model switch or fallback attributes later subagents to the start model (the dispatch report does not have this limit). In a session long enough that its head names no model at all, the tail is read instead and that session is attributed to its LAST model, which is the opposite bias for those sessions.",
  ];
  process.stdout.write(out.join("\n"));
  process.exit(0);
}

// Hook mode: PostToolUse event JSON on stdin.
let raw = "";
try {
  raw = readFileSync(0, "utf-8");
} catch {
  process.exit(0); // no stdin (manual run) - not an error worth breaking a session over
}
try {
  const event = JSON.parse(raw);
  if (event.tool_name !== "Agent" && event.tool_name !== "Task") process.exit(0);
  const input = event.tool_input ?? {};
  // Which main model this dispatch was routed FROM - the last model named in
  // the session transcript, i.e. the one in effect at dispatch time (survives
  // /model switches, opusplan handoffs, and quota fallbacks). Resolved before
  // the entry because the effort default depends on it.
  const session = event.transcript_path ? lastModelIn(event.transcript_path, 262144) : null;
  const effort = sessionEffort(event.cwd ?? process.cwd(), session);
  const entry = {
    ts: Date.now(),
    agent: input.subagent_type ?? "general-purpose",
    model: input.model ?? null,
    // CLAUDE_CODE_SUBAGENT_MODEL outranks both the model param and the
    // frontmatter pin - when set, it is the model every subagent actually
    // ran on, so record it rather than guessing from pins.
    ...(process.env.CLAUDE_CODE_SUBAGENT_MODEL ? { env: process.env.CLAUDE_CODE_SUBAGENT_MODEL } : {}),
    session,
    // The session's effort level plus its source, so the report can separate an
    // observed setting from the documented default it fell back to. Omitted
    // entirely when neither could be established.
    ...(effort ?? {}),
  };
  const file = dataFile();
  appendFileSync(file, JSON.stringify(entry) + "\n");
  // Self-prune once the log ages: rewrite without entries past retention
  // (30d - long enough for --ago comparisons, still trivially small). The
  // negated >= form also fires when the head entry's ts is missing or NaN,
  // so a junk head line can never block pruning forever.
  const entries = readEntries(file);
  const cutoff = Date.now() - RETENTION_MS;
  if (entries.length && !(entries[0].ts >= cutoff)) {
    writeFileSync(file, entries.filter((e) => e.ts >= cutoff).map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
} catch {
  // Never fail the hook: a broken counter must not break tool use.
}
process.exit(0);
