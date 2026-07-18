// Smoke tests for dispatch-counter.mjs. Run: node --test hooks/
// Tests drive the CLI end-to-end with CLAUDE_CONFIG_DIR pointed at a temp
// dir, so no exports or refactors of the script are needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
    assert.match(out, /\(7d\)/);
    // The empty message reports the actual window, not a hardcoded "7 days".
    assert.match(run(["tokens", "--days", "2", "--ago", "3"], cfg), /\(2d ending 3d ago\)/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("PINNED_MODELS mirrors agents/*.md frontmatter", () => {
  // The exact drift class 0.7.1 fixes: a pin changed in frontmatter but not
  // in the stats table. Bidirectional deepEqual catches a stale pin, a new
  // agent missing from the table, and an orphaned table entry alike.
  const agentsDir = join(dirname(SCRIPT), "..", "agents");
  const fromFrontmatter = Object.fromEntries(
    readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => {
      const fm = readFileSync(join(agentsDir, f), "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
      return [`model-routing:${f.replace(/\.md$/, "")}`, fm.match(/^model:\s*(\S+)/m)?.[1] ?? null];
    }));
  const table = readFileSync(SCRIPT, "utf-8").match(/const PINNED_MODELS = \{([\s\S]*?)\};/)[1];
  const pinned = Object.fromEntries([...table.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pinned, fromFrontmatter);
});

test("hook mode accepts Task, samples the session model, defaults the agent", () => {
  const cfg = freshConfigDir();
  const sess = join(cfg, "fake-session.jsonl");
  const bedrock = join(cfg, "bedrock-session.jsonl");
  writeFileSync(sess, '{"model":"claude-opus-4-8"}\n');
  writeFileSync(bedrock, '{"model":"us.anthropic.claude-opus-4-8-v1"}\n');
  try {
    run([], cfg, JSON.stringify({ tool_name: "Task", tool_input: { subagent_type: "model-routing:scout" }, transcript_path: sess }));
    run([], cfg, JSON.stringify({ tool_name: "Agent" })); // no tool_input at all
    run([], cfg, JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "x" }, transcript_path: bedrock }));
    const log = readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log.length, 3);
    assert.equal(log[0].agent, "model-routing:scout");
    assert.equal(log[0].session, "claude-opus-4-8");
    assert.equal(log[1].agent, "general-purpose");
    // Vendor prefix (Bedrock/Vertex) is accepted, capture starts at claude-.
    assert.equal(log[2].session, "claude-opus-4-8-v1");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("hook prunes entries past 30d retention and keeps fresh ones", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  writeLog(cfg, [
    { ts: now - 31 * DAY, agent: "old" },
    { ts: now - 1000, agent: "recent" },
  ]);
  const event = JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "new" } });
  try {
    run([], cfg, event);
    const log = readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log.length, 2); // 31d-old pruned; recent + newly appended survive
    assert.ok(log.every((e) => e.ts >= now - 30 * DAY));
    run([], cfg, event); // fresh head: append only, nothing rewritten away
    assert.equal(readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8").trim().split("\n").length, 3);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("stats one-liner: today count, and --ago suppressing 'today'", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  writeLog(cfg, [
    { ts: now - 2 * DAY, agent: "model-routing:scout", session: "claude-opus-4-8" },
    { ts: now, agent: "model-routing:scout", session: "claude-opus-4-8" },
  ]);
  try {
    assert.equal(run(["stats"], cfg), "routed-down: 1 today · 2 7d");
    const past = run(["stats", "--days", "7", "--ago", "1"], cfg);
    assert.equal(past, "routed-down: 1 7d ending 1d ago");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("tier-leak section: threshold boundary and bundled-only absence", () => {
  const now = Date.now();
  const mk = (bare, explicit) => {
    const cfg = freshConfigDir();
    writeLog(cfg, [
      ...Array.from({ length: bare }, () => ({ ts: now, agent: "general-purpose", session: "claude-opus-4-8" })),
      ...Array.from({ length: explicit }, () => ({ ts: now, agent: "general-purpose", model: "sonnet", session: "claude-opus-4-8" })),
    ]);
    return cfg;
  };
  let cfg = mk(1, 4); // exactly 20%: strict > threshold means no warning line
  try {
    const out = run(["report"], cfg);
    assert.match(out, /Tier leaks: 1 of 5 unpinned dispatches inherited a strong session model bare \(20%\)/);
    assert.ok(!out.includes("rework threshold"));
  } finally { rmSync(cfg, { recursive: true, force: true }); }
  cfg = mk(2, 3); // 40%: above the threshold
  try {
    assert.match(run(["report"], cfg), /above the 20% rework threshold/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
  cfg = freshConfigDir(); // bundled-only log: no unpinned dispatches, no section
  writeLog(cfg, [{ ts: now, agent: "model-routing:scout", session: "claude-opus-4-8" }]);
  try {
    assert.ok(!run(["report"], cfg).includes("Tier leaks"));
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("by-session rows shorten model ids and bucket unrecorded sessions", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    { ts: now, agent: "general-purpose", model: "sonnet", session: "claude-opus-4-8-20260115" },
    { ts: now, agent: "general-purpose", model: "sonnet", session: null },
  ]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /opus-4-8: 1 of 1 routed down \(100%\)/); // date suffix stripped
    assert.match(out, /\(session not recorded\): 1 of 1 routed down/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("report sections agree with the headline for at-tier pinned dispatches", () => {
  const cfg = freshConfigDir();
  // Bare implementer from a SONNET session: pin=sonnet equals the session
  // tier - the row must sit with the headline (0%), not under "Ran cheaper".
  writeLog(cfg, [{ ts: Date.now(), agent: "model-routing:implementer", session: "claude-sonnet-5" }]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /0 of 1 dispatches \(0%\)/);
    assert.match(out, /Ran at the session tier[\s\S]*implementer \(pin=sonnet\)/);
    assert.ok(!out.includes("Ran cheaper"));
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("mixed rows are annotated instead of silently picking a side", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    { ts: now, agent: "model-routing:implementer", session: "claude-opus-4-8" },  // down
    { ts: now, agent: "model-routing:implementer", session: "claude-sonnet-5" },  // at tier
  ]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /1 of 2 dispatches \(50%\)/);
    assert.match(out, /implementer \(pin=sonnet\) \[1 of 2 down\]/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("legacy entries without a session fall back to the tier heuristic", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    { ts: now, agent: "model-routing:scout" },                          // pin=sonnet -> down
    { ts: now, agent: "general-purpose" },                              // nothing known -> not down
    { ts: now, agent: "general-purpose", model: "claude-haiku-4-5" },   // dashed id -> down
  ]);
  try {
    assert.match(run(["report"], cfg), /2 of 3 dispatches \(67%\)/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

const usageLine = (model, input, cacheRead = 0) =>
  JSON.stringify({ message: { model, usage: { input_tokens: input, output_tokens: 10, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 } } });

test("tokens happy path: volume rows, session breakdown, unknown-model note", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), '{"model":"claude-opus-4-8"}\n');
  writeFileSync(join(dir, "agent-a.jsonl"), usageLine("claude-haiku-4-5", 1000, 500) + "\n"); // routed down
  writeFileSync(join(dir, "agent-b.jsonl"), usageLine("claude-opus-4-8", 2000) + "\n");       // at tier
  writeFileSync(join(dir, "agent-c.jsonl"), usageLine("zephyr-9", 700) + "\n");               // unknown tier
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /haiku-4-5/);
    assert.match(out, /processed on a cheaper model than their session/);
    assert.match(out, /By session model:[\s\S]*opus-4-8: [\s\S]*below session tier/);
    assert.match(out, /1 agents on unrecognized models/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("tokens reaches Workflow-spawned agents nested under subagents/workflows/", () => {
  const cfg = freshConfigDir();
  const wfDir = join(cfg, "projects", "proj", "sess-1", "subagents", "workflows", "wf_abc123");
  mkdirSync(wfDir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), '{"model":"claude-opus-4-8"}\n');
  writeFileSync(join(wfDir, "agent-1.jsonl"), usageLine("claude-sonnet-5", 3000) + "\n");
  try {
    const out = run(["tokens"], cfg);
    // The workflow agent is found (deep walk) AND attributed to its parent
    // session (opus), so its sonnet volume counts as routed down.
    assert.match(out, /sonnet-5/);
    assert.match(out, /opus-4-8: [\s\S]*100% below session tier/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});
