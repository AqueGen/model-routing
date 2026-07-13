#!/usr/bin/env node
// Dispatch counter: logs every Agent-tool dispatch (PostToolUse hook) and
// prints kept-off-strongest stats for a status line.
//
//   node dispatch-counter.mjs          <- hook mode: read event JSON on stdin, append
//   node dispatch-counter.mjs stats    <- print "routed-down: N today · M 7d"
//   node dispatch-counter.mjs report   <- per-agent 7d dispatch breakdown
//   node dispatch-counter.mjs tokens   <- real token volume per model from subagent transcripts (7d)
//
// "Kept off the strongest model" = dispatches to the plugin's sub-strongest
// agents or any Agent call with an explicit haiku/sonnet model param. Counts
// dispatches, not tokens - honest bookkeeping, no dollar fiction.
// Log lives in <config>/model-routing/dispatches.jsonl and self-prunes to 7d.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Bundled agents pinned below the typical strongest session model. implementer
// and reviewer pin opus and are deliberately absent - dispatching to them does
// not keep work off the strongest tier when the session runs opus.
const CHEAP_AGENTS = new Set([
  "model-routing:scout",
  "model-routing:test-runner",
  "model-routing:e2e-runner",
  "model-routing:verifier",
  "Explore",
]);
const CHEAP_MODELS = new Set(["haiku", "sonnet"]);

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

// Tier ladder shared by dispatch judging and the tokens report.
const tierOf = (m) => !m ? 0 : /fable|mythos/.test(m) ? 4 : /opus/.test(m) ? 3 : /sonnet/.test(m) ? 2 : /haiku/.test(m) ? 1 : 0;
const shortModel = (m) => m ? m.replace(/^claude-/, "").replace(/-\d{8}$/, "") : m;

function firstModelIn(file, bytes) {
  // Cheap sample: first chunk of the main-session jsonl names the session
  // model; mid-session /model switches are rare enough to ignore.
  try {
    const head = readFileSync(file, { encoding: "utf-8", flag: "r" }).slice(0, bytes);
    return head.match(/"model":"(claude-[a-z0-9.-]+)"/)?.[1] ?? null;
  } catch { return null; }
}

function isRoutedDown(e) {
  // With the session model recorded (0.5.3+ entries), judge by tier: an
  // explicit model below the session tier is routed down even for agents
  // outside the static cheap list (e.g. implementer on sonnet in a fable
  // session). Entries without both fields fall back to the heuristic.
  if (e.model && e.session) return tierOf(e.model) < tierOf(e.session);
  return CHEAP_AGENTS.has(e.agent) || CHEAP_MODELS.has(e.model);
}

if (process.argv[2] === "stats" || process.argv[2] === "report") {
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const entries = readEntries(dataFile()).filter((e) => now - e.ts < WEEK_MS);
  const down = entries.filter(isRoutedDown);
  const today = down.filter((e) => e.ts >= dayStart).length;
  if (process.argv[2] === "stats") {
    process.stdout.write(`routed-down: ${today} today · ${down.length} 7d`);
    process.exit(0);
  }
  // report: per-agent breakdown over 7d, routed-down agents marked with a check.
  const byAgent = new Map();
  for (const e of entries) {
    const key = e.model ? `${e.agent} (model=${e.model})` : e.agent;
    byAgent.set(key, (byAgent.get(key) ?? 0) + 1);
  }
  const rows = [...byAgent.entries()].sort((a, b) => b[1] - a[1]);
  // Session-model breakdown: which main model the dispatch was routed FROM.
  // Entries older than 0.5.3 lack the field and are grouped as unrecorded.
  const bySession = new Map();
  for (const e of entries) {
    const key = e.session ? shortModel(e.session) : "(session not recorded)";
    const s = bySession.get(key) ?? { n: 0, down: 0 };
    s.n++; if (isRoutedDown(e)) s.down++;
    bySession.set(key, s);
  }
  const sessionRows = [...bySession.entries()].sort((a, b) => b[1].n - a[1].n);
  const lines = [
    `routed-down: ${today} today · ${down.length} of ${entries.length} dispatches 7d`,
    "",
    ...rows.map(([agent, n]) => {
      const probe = { agent: agent.split(" (model=")[0], model: agent.match(/model=(\w+)/)?.[1] ?? null };
      return `${String(n).padStart(4)}  ${isRoutedDown(probe) ? "v" : "-"} ${agent}`;
    }),
    "",
    "By session model (dispatches routed FROM, 7d):",
    ...sessionRows.map(([m, s]) => `${String(s.n).padStart(4)}  ${m} - ${s.down} routed down`),
    "",
    "v = kept off the strongest model. Log: <config>/model-routing/dispatches.jsonl (7d window)",
  ];
  process.stdout.write(lines.join("\n"));
  process.exit(0);
}

if (process.argv[2] === "tokens") {
  // Real token volume per model from subagent transcripts (7d window), and
  // how much of it ran BELOW each subagent's own session model - sessions
  // vary (fable one day, opus another), so "routed down" is judged against
  // the parent session's model, not a fixed top tier.
  const { readdirSync, statSync } = await import("node:fs");
  const projRoot = (() => {
    const cfg = process.env.CLAUDE_CONFIG_DIR?.trim()
      ? resolve(process.env.CLAUDE_CONFIG_DIR)
      : join(homedir(), ".claude");
    return join(cfg, "projects");
  })();
  const cutoff = Date.now() - WEEK_MS;
  const sessionModelCache = new Map();
  const perModel = new Map(); // model -> {agents, in, out, cr, cw, down}
  const perSession = new Map(); // session model -> {agents, vol, downVol}
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (depth < 3) walk(p, depth + 1); continue; }
      if (!e.name.startsWith("agent-") || !e.name.endsWith(".jsonl")) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (st.mtimeMs < cutoff) continue;
      let model = null, inT = 0, outT = 0, cr = 0, cw = 0;
      for (const line of readFileSync(p, "utf-8").split("\n")) {
        if (!line.includes('"usage"')) continue;
        try {
          const m = (JSON.parse(line)).message ?? {};
          const u = m.usage; if (!u) continue;
          if (m.model) model = m.model;
          inT += u.input_tokens ?? 0; outT += u.output_tokens ?? 0;
          cr += u.cache_read_input_tokens ?? 0; cw += u.cache_creation_input_tokens ?? 0;
        } catch {}
      }
      if (!model || model.startsWith("<")) continue;
      // subagents dir sits under <session-id>/subagents - the sibling
      // <session-id>.jsonl is the parent session.
      const sessionJsonl = dir.replace(/[\\/]subagents$/, "") + ".jsonl";
      if (!sessionModelCache.has(sessionJsonl)) {
        sessionModelCache.set(sessionJsonl, firstModelIn(sessionJsonl, 262144));
      }
      const sessionModel = sessionModelCache.get(sessionJsonl);
      const down = tierOf(model) < tierOf(sessionModel);
      const s = perModel.get(model) ?? { agents: 0, in: 0, out: 0, cr: 0, cw: 0, downVol: 0, downAgents: 0 };
      s.agents++; s.in += inT; s.out += outT; s.cr += cr; s.cw += cw;
      if (down) { s.downVol += inT + cr + cw; s.downAgents++; }
      perModel.set(model, s);
      const sessKey = sessionModel ? shortModel(sessionModel) : "(session unknown)";
      const ss = perSession.get(sessKey) ?? { agents: 0, vol: 0, downVol: 0 };
      ss.agents++; ss.vol += inT + cr + cw;
      if (down) ss.downVol += inT + cr + cw;
      perSession.set(sessKey, ss);
    }
  };
  walk(projRoot, 0);
  const fmtN = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(n);
  const rows = [...perModel.entries()].map(([m, s]) => ({ m, vol: s.in + s.cr + s.cw, ...s }))
    .sort((a, b) => b.vol - a.vol);
  const total = rows.reduce((a, r) => a + r.vol, 0) || 1;
  const downTotal = rows.reduce((a, r) => a + r.downVol, 0);
  const bar = (v) => "#".repeat(Math.max(1, Math.round((v / total) * 24)));
  const sessionRows = [...perSession.entries()].sort((a, b) => b[1].vol - a[1].vol);
  const out = [
    "Subagent token volume by model, 7d (input + cache):",
    "",
    ...rows.map((r) => `${shortModel(r.m).padEnd(16)} ${bar(r.vol).padEnd(25)} ${fmtN(r.vol).padStart(7)} (${Math.round((r.vol / total) * 100)}%)  ${r.agents} agents, out ${fmtN(r.out)}`),
    "",
    "By session model (volume routed FROM, 7d):",
    ...sessionRows.map(([m, s]) => `${m.padEnd(16)} ${fmtN(s.vol).padStart(7)} across ${s.agents} agents - ${s.vol ? Math.round((s.downVol / s.vol) * 100) : 0}% below session tier`),
    "",
    `Below own session model: ${fmtN(downTotal)} of ${fmtN(total)} (${Math.round((downTotal / total) * 100)}%) - judged per session (fable/opus days both count fairly).`,
    "Volume = tokens the subagent processed; cache reads are billed at the subagent's model rate, which is where routing saves.",
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
    // Which main model this dispatch was routed FROM - sampled from the head
    // of the session transcript the hook event points at.
    session: event.transcript_path ? firstModelIn(event.transcript_path, 262144) : null,
  };
  const file = dataFile();
  appendFileSync(file, JSON.stringify(entry) + "\n");
  // Self-prune once the log ages: rewrite without >7d entries.
  const entries = readEntries(file);
  const cutoff = Date.now() - WEEK_MS;
  if (entries.length && entries[0].ts < cutoff) {
    writeFileSync(file, entries.filter((e) => e.ts >= cutoff).map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
} catch {
  // Never fail the hook: a broken counter must not break tool use.
}
process.exit(0);
