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
// Log lives in <config>/model-routing/dispatches.jsonl and self-prunes to 30d.

import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;

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
// Frontmatter pins of the bundled agents. A bare dispatch (no model param)
// still runs on the pinned model, so classification must resolve through
// this table or bare implementer dispatches (pin=sonnet since 0.6.0) get
// miscounted as session-tier work. Keep in sync with agents/*.md.
const PINNED_MODELS = {
  "model-routing:scout": "sonnet",
  "model-routing:test-runner": "haiku",
  "model-routing:e2e-runner": "sonnet",
  "model-routing:verifier": "haiku",
  "model-routing:implementer": "sonnet",
  "model-routing:reviewer": "opus",
};
// Unpinned agent types that are inherently cheap dispatch targets.
const CHEAP_AGENTS = new Set(["Explore"]);

function dataFile() {
  const cfg = process.env.CLAUDE_CONFIG_DIR?.trim()
    ? resolve(process.env.CLAUDE_CONFIG_DIR)
    : join(homedir(), ".claude");
  const dir = join(cfg, "model-routing");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "dispatches.jsonl");
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
const effectiveModel = (e) => e.env ?? e.model ?? PINNED_MODELS[e.agent] ?? null;

function isRoutedDown(e) {
  // With the session model recorded (0.5.3+ entries), judge by tier: an
  // effective model (explicit param or frontmatter pin) below the session
  // tier is routed down - so a bare implementer dispatch from an opus
  // session counts, because its pin ran it on sonnet. Unknown tiers (null)
  // and entries without both fields fall back to the heuristic instead of
  // comparing against a made-up rank.
  const model = effectiveModel(e);
  if (model && e.session) {
    const tm = tierOf(model), ts = tierOf(e.session);
    if (tm != null && ts != null) return tm < ts;
  }
  // Heuristic: cheap = sonnet tier or below, ranked via tierOf so dashed
  // full ids ("claude-sonnet-5...") classify the same as short names.
  return CHEAP_AGENTS.has(e.agent) || (tierOf(model) ?? 99) <= 2;
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
      : `No dispatches logged in the window (${winLabel}).\nLog: ${dataFile()} - history kept 30 days.\nEntries appear after the first Agent dispatch once the plugin's PostToolUse hook is active (plugin enabled + session restarted).`);
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
    return isRoutedDown(e) ? "down" : "at";
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
  const byAgent = new Map(); // key -> { n, down, up, unknown }
  for (const e of entries) {
    const key = e.env ? `${e.agent} (env=${e.env})`
      : e.model ? `${e.agent} (model=${e.model})`
      : PINNED_MODELS[e.agent] ? `${e.agent} (pin=${PINNED_MODELS[e.agent]})`
      : e.agent;
    const s = byAgent.get(key) ?? { n: 0, down: 0, up: 0, unknown: 0 };
    s.n++;
    const v = verdictOf(e);
    if (v === "unknown") s.unknown++;
    else if (v === "down") s.down++;
    else if (v === "up") s.up++;
    byAgent.set(key, s);
  }
  const rows = [...byAgent.entries()].sort((a, b) => b[1].n - a[1].n);
  // Session-model breakdown: which main model the dispatch was routed FROM.
  // Entries older than 0.5.3 lack the field and are grouped as unrecorded.
  const bySession = new Map();
  for (const e of entries) {
    const key = e.session ? shortModel(e.session) : "(session not recorded)";
    const s = bySession.get(key) ?? { n: 0, down: 0 };
    s.n++; if (verdictOf(e) === "down") s.down++;
    bySession.set(key, s);
  }
  const sessionRows = [...bySession.entries()].sort((a, b) => b[1].n - a[1].n);
  // Tier leaks: unpinned dispatches of a non-bundled agent (general-purpose,
  // custom types) that ran bare on a strong session (> sonnet) and so
  // silently inherited the expensive model. These are the accidental-
  // inheritance cost the 0.5.4 rule targets - work that could have been
  // cheaper. Bundled agents are frontmatter-pinned and never leak; Explore
  // is inherently cheap. Threshold is the research rework line: when a
  // routed-down tier would need rework >~20% of the time the price edge
  // is gone - here inverted, >20% of cheap-capable dispatches leaking UP
  // is the same signal that the tier assignment is not holding.
  const BUNDLED = new Set([...Object.keys(PINNED_MODELS), ...CHEAP_AGENTS]);
  const capable = entries.filter((e) => !BUNDLED.has(e.agent));
  const leaks = capable.filter((e) => !e.model && e.session && (tierOf(e.session) ?? 0) > 2);
  const LEAK_WARN = 0.20;
  const leakLines = [];
  if (capable.length) {
    const rate = leaks.length / capable.length;
    leakLines.push("", `Tier leaks: ${leaks.length} of ${capable.length} unpinned dispatches inherited a strong session model bare (${Math.round(rate * 100)}%).`);
    if (rate > LEAK_WARN) leakLines.push(`  ! above the 20% rework threshold - pass an explicit model= on general-purpose/custom dispatches (sonnet default).`);
  }
  // Grouped sections instead of per-row v/- markers: the reader should not
  // need a legend to see what ran cheap and what ran at the session tier.
  const groups = { down: [], top: [], up: [], unknown: [] };
  for (const [agent, s] of rows) {
    const judged = s.n - s.unknown;
    const at = judged - s.down - s.up;
    // Mixed rows (same key dispatched from sessions on different tiers) go
    // to the majority side, annotated so a row never silently contradicts
    // the headline count.
    const mixed = s.up > 0
      ? (s.up < judged ? ` [${s.down} down / ${at} at / ${s.up} above]` : "")
      : (s.down > 0 && s.down < judged ? ` [${s.down} of ${s.n} down]` : "");
    const row = `${String(s.n).padStart(4)}  ${agent}${mixed}`;
    if (s.unknown === s.n) groups.unknown.push(row);
    else if (s.up >= s.down && s.up > at) groups.up.push(row);
    else if (s.down >= at) groups.down.push(row);
    else groups.top.push(row);
  }
  const comparable = entries.length - unknownCount;
  const pct = comparable ? Math.round((down.length / comparable) * 100) : 0;
  const section = (title, rows2) => rows2.length ? ["", title, ...rows2] : [];
  const lines = [
    `Model routing report - ${winLabel}`,
    "",
    `${down.length} of ${comparable}${unknownCount ? " comparable" : ""} dispatches (${pct}%) ran on a cheaper model than the session${unknownCount ? ` - ${unknownCount} not tier-comparable excluded` : ""}${todayPart ? ` (${todayPart.replace(" · ", "")})` : ""}.`,
    ...(upCount ? [`${upCount} ran ABOVE the session tier - a pin above the session model, uncapped; pins are ceilings only when the dispatch passes model=<session>.`] : []),
    ...section("Ran cheaper (routed down):", groups.down),
    ...section("Ran at the session tier (deliberate top-tier work or inheritance):", groups.top),
    ...section("Ran ABOVE the session tier (uncapped pin - pass model=<session> to enforce the ceiling):", groups.up),
    ...section("Not tier-comparable (unrecognized model or unknown session family - extend TIER_PATTERNS):", groups.unknown),
    "",
    "By session model:",
    ...sessionRows.map(([m, s]) => `  ${m}: ${s.down} of ${s.n} routed down (${Math.round((s.down / s.n) * 100)}%)`),
    ...leakLines,
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
  const projRoot = (() => {
    const cfg = process.env.CLAUDE_CONFIG_DIR?.trim()
      ? resolve(process.env.CLAUDE_CONFIG_DIR)
      : join(homedir(), ".claude");
    return join(cfg, "projects");
  })();
  const sessionModelCache = new Map();
  const perModel = new Map(); // model -> {agents, in, out, cr, cw, down}
  const perSession = new Map(); // session model -> {agents, vol, downVol}
  let unknownAgents = 0, unknownVol = 0; // models tierOf cannot rank
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      // Depth 6 reaches Workflow-spawned agents too:
      // projects/<proj>/<session>/subagents/workflows/<wf-id>/agent-*.jsonl
      if (e.isDirectory()) { if (depth < 6) walk(p, depth + 1); continue; }
      if (!e.name.startsWith("agent-") || !e.name.endsWith(".jsonl")) continue;
      let st; try { st = statSync(p); } catch { continue; }
      // mtime below the window start = nothing inside can be newer; safe
      // early skip. The UPPER bound is deliberately NOT applied per file: a
      // resumed transcript carries a fresh mtime but may hold lines from a
      // historical --ago window - timestamped lines decide individually,
      // and lines without a timestamp count only when the mtime itself
      // falls inside the window.
      if (st.mtimeMs < win.start) continue;
      const mtimeInWindow = st.mtimeMs < win.end;
      // Per-line attribution: usage accumulates onto the model named on that
      // line, so a mid-run fallback splits the transcript across both models
      // instead of crediting everything to the last one seen. Lines carrying
      // their own timestamp are windowed individually - a resumed transcript
      // has a fresh mtime but old lines; lines without one fall back to the
      // file mtime, which already passed the window check above.
      const fileVols = new Map(); // model -> { in, out, cr, cw }
      for (const line of readFileSync(p, "utf-8").split("\n")) {
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
          const v = fileVols.get(m.model) ?? { in: 0, out: 0, cr: 0, cw: 0 };
          v.in += u.input_tokens ?? 0; v.out += u.output_tokens ?? 0;
          v.cr += u.cache_read_input_tokens ?? 0; v.cw += u.cache_creation_input_tokens ?? 0;
          fileVols.set(m.model, v);
        } catch {}
      }
      if (!fileVols.size) continue;
      // The parent session transcript is <session-id>.jsonl, sibling of the
      // first "subagents" dir on the path - one level up for plain Agent
      // dispatches, further up for Workflow agents nested in workflows/<wf>/.
      const anchored = p.match(/^(.*?)[\\/]subagents[\\/]/);
      const sessionJsonl = anchored ? anchored[1] + ".jsonl" : null;
      if (sessionJsonl && !sessionModelCache.has(sessionJsonl)) {
        sessionModelCache.set(sessionJsonl, firstModelIn(sessionJsonl, 262144));
      }
      const sessionModel = sessionJsonl ? sessionModelCache.get(sessionJsonl) : null;
      if (sf && !(sessionModel && shortModel(sessionModel).toLowerCase().includes(sf))) continue;
      const tsess = tierOf(sessionModel);
      const sessKey = sessionModel ? shortModel(sessionModel) : "(session unknown)";
      for (const [model, v] of fileVols) {
        const vol = v.in + v.cr + v.cw;
        const tm = tierOf(model);
        // Unknown tier on EITHER side = not comparable: excluded from the
        // routed-down denominator, reported on its own line - an exotic
        // agent model or a future-family session must not drag the share.
        if (tm == null || tsess == null) { unknownAgents++; unknownVol += vol; }
        const down = tm != null && tsess != null && tm < tsess;
        const s = perModel.get(model) ?? { agents: 0, in: 0, out: 0, cr: 0, cw: 0, downVol: 0, downAgents: 0 };
        s.agents++; s.in += v.in; s.out += v.out; s.cr += v.cr; s.cw += v.cw;
        if (down) { s.downVol += vol; s.downAgents++; }
        perModel.set(model, s);
        const ss = perSession.get(sessKey) ?? { agents: 0, vol: 0, downVol: 0 };
        ss.agents++; ss.vol += vol;
        if (down) ss.downVol += vol;
        perSession.set(sessKey, ss);
      }
    }
  };
  walk(projRoot, 0);
  if (!perModel.size) {
    process.stdout.write(`No subagent transcripts found under ${projRoot} (${winLabel}).\nToken stats read Claude Code agent-*.jsonl transcript files; they appear after subagent dispatches. If your config lives elsewhere, set CLAUDE_CONFIG_DIR.`);
    process.exit(0);
  }
  const fmtN = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(n);
  const rows = [...perModel.entries()].map(([m, s]) => ({ m, vol: s.in + s.cr + s.cw, ...s }))
    .sort((a, b) => b.vol - a.vol);
  const total = rows.reduce((a, r) => a + r.vol, 0) || 1;
  const downTotal = rows.reduce((a, r) => a + r.downVol, 0);
  // Unknown-tier volume is excluded from the routed-down denominator - one
  // unrecognized model must not drag the percentage down (it is reported on
  // its own line instead).
  const comparableVol = Math.max(1, total - unknownVol);
  const bar = (v) => "#".repeat(Math.max(1, Math.round((v / total) * 24)));
  const sessionRows = [...perSession.entries()].sort((a, b) => b[1].vol - a[1].vol);
  const out = [
    `Subagent token volume - ${winLabel} (input + cache):`,
    "",
    `${fmtN(downTotal)} of ${fmtN(total - unknownVol)} ${unknownVol ? "comparable " : ""}tokens (${Math.round((downTotal / comparableVol) * 100)}%) processed on a cheaper model than their session - judged per session (fable/opus days both count fairly).`,
    "",
    ...rows.map((r) => `${shortModel(r.m).padEnd(16)} ${bar(r.vol).padEnd(25)} ${fmtN(r.vol).padStart(7)} (${Math.round((r.vol / total) * 100)}%)  ${r.agents} agents, out ${fmtN(r.out)}`),
    "",
    "By session model:",
    ...sessionRows.map(([m, s]) => `  ${m}: ${fmtN(s.vol)} across ${s.agents} agents - ${s.vol ? Math.round((s.downVol / s.vol) * 100) : 0}% below session tier`),
    ...(unknownAgents ? ["", `${unknownAgents} agents not tier-comparable (${fmtN(unknownVol)}) - unrecognized agent model or unknown session tier, excluded from routed-down math; extend TIER_PATTERNS in dispatch-counter.mjs.`] : []),
    "",
    "Volume = tokens the subagent processed; cache reads are billed at the subagent's model rate, which is where routing saves.",
    "Session model is sampled at session START - a mid-session /model switch or fallback attributes later subagents to the start model (the dispatch report does not have this limit).",
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
  const entry = {
    ts: Date.now(),
    agent: input.subagent_type ?? "general-purpose",
    model: input.model ?? null,
    // CLAUDE_CODE_SUBAGENT_MODEL outranks both the model param and the
    // frontmatter pin - when set, it is the model every subagent actually
    // ran on, so record it rather than guessing from pins.
    ...(process.env.CLAUDE_CODE_SUBAGENT_MODEL ? { env: process.env.CLAUDE_CODE_SUBAGENT_MODEL } : {}),
    // Which main model this dispatch was routed FROM - the last model named
    // in the session transcript, i.e. the one in effect at dispatch time
    // (survives /model switches, opusplan handoffs, and quota fallbacks).
    session: event.transcript_path ? lastModelIn(event.transcript_path, 262144) : null,
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
