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

function run(args, configDir, stdin, extraEnv) {
  return execFileSync(process.execPath, [SCRIPT, ...args].filter(Boolean), {
    // CLAUDE_CODE_SUBAGENT_MODEL is blanked by default so a developer's own
    // override cannot leak into the hermetic tests; set via extraEnv to test.
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_SUBAGENT_MODEL: "", ...(extraEnv ?? {}) },
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
    // Unknown-tier entries are excluded from the denominator - one exotic
    // model must not drag the routed-down share down.
    assert.match(out, /1 of 2 comparable dispatches \(50%\) ran on a cheaper model/);
    assert.match(out, /1 not tier-comparable excluded/);
    // Unknown-model rows land in their own section - honest unknown,
    // not silently counted as routed down or at-tier.
    assert.match(out, /Not tier-comparable[\s\S]*general-purpose \(model=zephyr-1\)/);
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

test("uncapped pins surface in the above-tier section, not as at-tier work", () => {
  const cfg = freshConfigDir();
  // Bare reviewer (pin=opus) from a SONNET session: the pin is above the
  // session and nobody passed model=sonnet - the ceilings rule was missed.
  writeLog(cfg, [{ ts: Date.now(), agent: "model-routing:reviewer", session: "claude-sonnet-5" }]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /0 of 1 dispatches \(0%\)/);
    assert.match(out, /1 ran ABOVE the session tier/);
    assert.match(out, /Ran ABOVE the session tier[\s\S]*reviewer \(pin=opus\)/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("hook records the LAST model in the transcript, not the first", () => {
  const cfg = freshConfigDir();
  const sess = join(cfg, "switched-session.jsonl");
  // opusplan shape: planning on opus, execution switched to sonnet - the
  // dispatch must be judged against sonnet, the model in effect NOW.
  writeFileSync(sess, '{"model":"claude-opus-4-8"}\n{"model":"claude-sonnet-5"}\n');
  try {
    run([], cfg, JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "x" }, transcript_path: sess }));
    const log = readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log[0].session, "claude-sonnet-5");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("tokens attributes usage per line-model and windows by line timestamp", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), '{"model":"claude-fable-5"}\n');
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  // One transcript, three usage lines: sonnet now, opus now (mid-run
  // fallback), sonnet 31 days ago (resumed old transcript - fresh mtime,
  // stale line). The stale line must not leak into the 7d window.
  writeFileSync(join(dir, "agent-a.jsonl"), [
    JSON.stringify({ timestamp: now, message: { model: "claude-sonnet-5", usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
    JSON.stringify({ timestamp: now, message: { model: "claude-opus-4-8", usage: { input_tokens: 2000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
    JSON.stringify({ timestamp: stale, message: { model: "claude-sonnet-5", usage: { input_tokens: 999999, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
  ].join("\n") + "\n");
  try {
    const out = run(["tokens"], cfg);
    // Both models get their own row (no last-model-wins), stale volume absent.
    assert.match(out, /sonnet-5 [\s\S#]* 1k /);
    assert.match(out, /opus-4-8 [\s\S#]* 2k /);
    assert.ok(!out.includes("1000k") && !out.includes("1.0M"));
    // Both tiers sit below the fable session: 3000 of 3000 routed down.
    assert.match(out, /fable-5: [\s\S]*100% below session tier/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("unknown SESSION family is excluded, not guessed by the heuristic", () => {
  const cfg = freshConfigDir();
  writeLog(cfg, [
    // Future session family: the sonnet pin is known but the pair is not
    // comparable - must be excluded, not counted routed-down via heuristic.
    { ts: Date.now(), agent: "model-routing:scout", session: "claude-zephyr-9" },
  ]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /0 of 0 comparable dispatches \(0%\)/);
    assert.match(out, /1 not tier-comparable excluded/);
    assert.match(out, /Not tier-comparable[\s\S]*scout \(pin=sonnet\)/);
    // The by-session row must not disagree with the headline: the zephyr
    // entry is excluded from its denominator too, and flagged.
    assert.match(out, /zephyr-9: 0 of 0 routed down \(0%\) - 1 not comparable/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("tokens excludes volume whose session tier is unknown", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), '{"model":"claude-zephyr-9"}\n');
  writeFileSync(join(dir, "agent-a.jsonl"), usageLine("claude-haiku-4-5", 1000) + "\n");
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /1 agents not tier-comparable/);
    assert.match(out, /\(0%\) processed on a cheaper model/);
    // Session row: no fake "0% below session tier" over incomparable volume.
    assert.match(out, /zephyr-9: [\s\S]* - not tier-comparable/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("--ago windows see timestamped lines inside resumed transcripts", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), '{"model":"claude-opus-4-8"}\n');
  const DAY = 24 * 60 * 60 * 1000;
  const old = new Date(Date.now() - 10 * DAY).toISOString();
  // The file is written NOW (fresh mtime), but its line belongs to the
  // window 7-14 days back - a resumed transcript must not vanish from
  // historical windows just because it was touched today.
  writeFileSync(join(dir, "agent-a.jsonl"),
    JSON.stringify({ timestamp: old, message: { model: "claude-sonnet-5", usage: { input_tokens: 1234, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + "\n");
  try {
    const out = run(["tokens", "--days", "7", "--ago", "7"], cfg);
    assert.match(out, /sonnet-5/);
    assert.match(out, /1 agents/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("CLAUDE_CODE_SUBAGENT_MODEL override is recorded and outranks the pin", () => {
  const cfg = freshConfigDir();
  const event = JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "model-routing:reviewer" } });
  try {
    run([], cfg, event, { CLAUDE_CODE_SUBAGENT_MODEL: "sonnet" });
    const log = readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log[0].env, "sonnet");
  } finally { rmSync(cfg, { recursive: true, force: true }); }
  // In the report the env override wins over the opus pin: from an opus
  // session this reviewer dispatch actually ran sonnet = routed down.
  const cfg2 = freshConfigDir();
  writeLog(cfg2, [{ ts: Date.now(), agent: "model-routing:reviewer", model: null, env: "sonnet", session: "claude-opus-4-8" }]);
  try {
    const out = run(["report"], cfg2);
    assert.match(out, /1 of 1 dispatches \(100%\)/);
    assert.match(out, /Ran cheaper[\s\S]*reviewer \(env=sonnet\)/);
  } finally { rmSync(cfg2, { recursive: true, force: true }); }
  // A bare general-purpose dispatch under an env override did NOT inherit
  // the session model - it must not count as a tier leak.
  const cfg3 = freshConfigDir();
  writeLog(cfg3, [{ ts: Date.now(), agent: "general-purpose", model: null, env: "sonnet", session: "claude-opus-4-8" }]);
  try {
    assert.match(run(["report"], cfg3), /Tier leaks: 0 of 1 unpinned dispatches/);
  } finally { rmSync(cfg3, { recursive: true, force: true }); }
});

test("--session scopes the report to matching session models", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    { ts: now, agent: "model-routing:scout", session: "claude-fable-5" },
    { ts: now, agent: "model-routing:scout", session: "claude-opus-4-8" },
    { ts: now, agent: "model-routing:scout" }, // no session - excluded by filter
  ]);
  try {
    const out = run(["report", "--session", "fable"], cfg);
    assert.match(out, /1 of 1 dispatches \(100%\)/);
    assert.match(out, /7d, fable sessions/);
    assert.ok(!out.includes("opus-4-8"));
    // Unfiltered still sees all three.
    assert.match(run(["report"], cfg), /of 3 dispatches/);
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
    assert.match(out, /1 agents not tier-comparable/);
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
    // --session filter drops the whole session's agents.
    assert.match(run(["tokens", "--session", "fable"], cfg), /No subagent transcripts found[\s\S]*fable sessions/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});
