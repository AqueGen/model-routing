#!/usr/bin/env node
// Dispatch counter: logs every Agent-tool dispatch (PostToolUse hook) and
// prints kept-off-strongest stats for a status line.
//
//   node dispatch-counter.mjs          <- hook mode: read event JSON on stdin, append
//   node dispatch-counter.mjs stats    <- print "routed-down: N today · M 7d"
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

function isRoutedDown(e) {
  return CHEAP_AGENTS.has(e.agent) || CHEAP_MODELS.has(e.model);
}

if (process.argv[2] === "stats") {
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const entries = readEntries(dataFile()).filter((e) => now - e.ts < WEEK_MS);
  const down = entries.filter(isRoutedDown);
  const today = down.filter((e) => e.ts >= dayStart).length;
  process.stdout.write(`routed-down: ${today} today · ${down.length} 7d`);
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
