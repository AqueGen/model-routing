// Smoke tests for dispatch-counter.mjs. Run: node --test hooks/
// Tests drive the CLI end-to-end with CLAUDE_CONFIG_DIR pointed at a temp
// dir, so no exports or refactors of the script are needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "dispatch-counter.mjs");

function run(args, configDir, stdin) {
  return execFileSync(process.execPath, [SCRIPT, ...args].filter(Boolean), {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    input: stdin ?? "",
    encoding: "utf-8",
  });
}

function freshConfigDir() {
  return mkdtempSync(join(tmpdir(), "mr-test-"));
}

function writeLog(configDir, entries) {
  const dir = join(configDir, "model-routing");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "dispatches.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

test("report with no log explains itself instead of printing nothing", () => {
  const cfg = freshConfigDir();
  try {
    const out = run(["report"], cfg);
    assert.match(out, /No dispatches logged/);
    assert.match(out, /PostToolUse hook/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("stats with no log prints a no-data marker", () => {
  const cfg = freshConfigDir();
  try {
    assert.equal(run(["stats"], cfg), "routed-down: no data (7d)");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("report groups by tier and never ranks unknown models", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    // sonnet from an opus session: routed down.
    { ts: now, agent: "general-purpose", model: "sonnet", session: "claude-opus-4-8" },
    // opus from an opus session: at tier, not down.
    { ts: now, agent: "model-routing:implementer", model: "opus", session: "claude-opus-4-8" },
    // future model family: tier unknown - must NOT count as routed down.
    { ts: now, agent: "general-purpose", model: "zephyr-1", session: "claude-opus-4-8" },
  ]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /1 of 3 dispatches \(33%\) ran on a cheaper model/);
    // Unknown-model rows land in their own section - honest unknown,
    // not silently counted as routed down or at-tier.
    assert.match(out, /Unrecognized models[\s\S]*general-purpose \(model=zephyr-1\)/);
    assert.match(out, /Ran at the session tier[\s\S]*implementer \(model=opus\)/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("bare pinned agents classify by their frontmatter pin", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    // implementer pins sonnet: a bare dispatch from an opus session ran
    // sonnet, so it is routed down even without an explicit model param.
    { ts: now, agent: "model-routing:implementer", model: null, session: "claude-opus-4-8" },
    // reviewer pins opus: bare on an opus session stays at the session tier.
    { ts: now, agent: "model-routing:reviewer", model: null, session: "claude-opus-4-8" },
  ]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /1 of 2 dispatches \(50%\) ran on a cheaper model/);
    assert.match(out, /Ran cheaper[\s\S]*implementer \(pin=sonnet\)/);
    assert.match(out, /Ran at the session tier[\s\S]*reviewer \(pin=opus\)/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("--days and --ago window the report", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  writeLog(cfg, [
    { ts: now - 3 * DAY, agent: "model-routing:scout", model: "sonnet", session: "claude-opus-4-8" },
    { ts: now - 1000, agent: "model-routing:scout", model: "sonnet", session: "claude-opus-4-8" },
  ]);
  try {
    assert.match(run(["report", "--days", "1"], cfg), /1 of 1 dispatches/);
    // Window [now-4d, now-2d) catches only the 3-day-old entry.
    const past = run(["report", "--days", "2", "--ago", "2"], cfg);
    assert.match(past, /1 of 1 dispatches/);
    assert.match(past, /2d ending 2d ago/);
    // Bad values fall back to the 7d default instead of erroring.
    assert.match(run(["report", "--days", "banana"], cfg), /2 of 2 dispatches/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("hook mode appends an Agent dispatch entry and ignores other tools", () => {
  const cfg = freshConfigDir();
  const event = (tool) => JSON.stringify({ tool_name: tool, tool_input: { subagent_type: "model-routing:scout" } });
  try {
    run([], cfg, event("Agent"));
    run([], cfg, event("Bash")); // must be ignored
    const log = readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8").trim().split("\n");
    assert.equal(log.length, 1);
    assert.equal(JSON.parse(log[0]).agent, "model-routing:scout");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("tokens with no transcripts explains where it looked", () => {
  const cfg = freshConfigDir();
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /No subagent transcripts found/);
    assert.match(out, /CLAUDE_CONFIG_DIR/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});
