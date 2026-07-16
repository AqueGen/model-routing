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
    assert.equal(run(["stats"], cfg), "routed-down: no data");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("report counts routed-down by tier and never ranks unknown models", () => {
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
    assert.match(out, /1 of 3 dispatches 7d/);
    // Unknown-model row is marked "?" - honest unknown, not a false v/-.
    assert.match(out, /\?\s+general-purpose \(model=zephyr-1\)/);
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
