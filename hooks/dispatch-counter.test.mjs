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

function run(args, configDir, stdin, extraEnv, cwd) {
  return execFileSync(process.execPath, [SCRIPT, ...args].filter(Boolean), {
    // CLAUDE_CODE_SUBAGENT_MODEL and CLAUDE_CODE_EFFORT_LEVEL are blanked by
    // default so a developer's own overrides cannot leak into the hermetic
    // tests; set either via extraEnv to test it.
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_SUBAGENT_MODEL: "", CLAUDE_CODE_EFFORT_LEVEL: "", ...(extraEnv ?? {}) },
    // Default the working directory to the temp config dir, never the directory
    // the suite happens to run from: the hook reads <cwd>/.claude/settings*.json
    // for the session effort, so an ambient cwd would let a real settings file
    // two levels up decide a test outcome. Tests that need a specific project
    // cascade pass their own cwd.
    cwd: cwd ?? configDir,
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

test("AGENT_PINS mirrors agents/*.md frontmatter, both columns", () => {
  // The exact drift class 0.7.1 fixes: a pin changed in frontmatter but not
  // in the stats table. Bidirectional deepEqual catches a stale pin, a new
  // agent missing from the table, and an orphaned table entry alike - and it
  // now covers effort as well as model, because both live in one table.
  const agentsDir = join(dirname(SCRIPT), "..", "agents");
  const fromFrontmatter = Object.fromEntries(
    readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => {
      const fm = readFileSync(join(agentsDir, f), "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
      return [`model-routing:${f.replace(/\.md$/, "")}`, {
        model: fm.match(/^model:\s*(\S+)/m)?.[1] ?? null,
        effort: fm.match(/^effort:\s*(\S+)/m)?.[1] ?? null,
      }];
    }));
  const table = readFileSync(SCRIPT, "utf-8").match(/const AGENT_PINS = \{([\s\S]*?)^\};/m)[1];
  const pinned = Object.fromEntries(
    [...table.matchAll(/"([^"]+)":\s*\{\s*model:\s*"([^"]+)",\s*effort:\s*"([^"]+)"\s*\}/g)]
      .map((m) => [m[1], { model: m[2], effort: m[3] }]));
  assert.deepEqual(pinned, fromFrontmatter);
});

test("agent frontmatter stays plain-YAML-safe in unquoted values", () => {
  // The 0.10.0 near-miss: an unquoted description containing ": " fails
  // YAML parsing and silently unregisters the agent; " #" starts a comment.
  const agentsDir = join(dirname(SCRIPT), "..", "agents");
  for (const f of readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
    const fm = readFileSync(join(agentsDir, f), "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
    for (const line of fm.split(/\r?\n/)) {
      const m = line.match(/^([\w-]+):\s+(.*)$/);
      if (!m || /^["']/.test(m[2])) continue;
      assert.ok(!m[2].includes(": "), `${f} ${m[1]}: unquoted ": " breaks YAML plain scalars`);
      assert.ok(!m[2].includes(" #"), `${f} ${m[1]}: unquoted " #" starts a YAML comment`);
    }
  }
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

test("tokens reports main-session volume as the denominator", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  // The main transcript carries real usage here, not just a model marker.
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), usageLine("claude-fable-5", 9000) + "\n");
  writeFileSync(join(dir, "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n");
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /Main sessions \(not routable\): 9k across 1 sessions/);
    // 1000 subagent of 10000 total: the routed-down headline covers a tenth of
    // what was actually spent, which is the whole point of printing this.
    assert.match(out, /Subagents are 10% of the 10k total/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("--session prints the unfiltered share next to the scoped one", () => {
  const cfg = freshConfigDir();
  const fableDir = join(cfg, "projects", "proj", "sess-fable", "subagents");
  const opusDir = join(cfg, "projects", "proj", "sess-opus", "subagents");
  mkdirSync(fableDir, { recursive: true });
  mkdirSync(opusDir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-fable.jsonl"), '{"model":"claude-fable-5"}\n');
  writeFileSync(join(cfg, "projects", "proj", "sess-opus.jsonl"), '{"model":"claude-opus-4-8"}\n');
  writeFileSync(join(fableDir, "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n"); // routed down
  writeFileSync(join(opusDir, "agent-b.jsonl"), usageLine("claude-opus-4-8", 3000) + "\n");  // at tier
  try {
    const out = run(["tokens", "--session", "fable"], cfg);
    assert.match(out, /100%\) processed on a cheaper model/);
    // The flattering slice never appears alone: 1000 of 4000 unfiltered.
    assert.match(out, /Across ALL sessions, unfiltered: 25% of 4k comparable tokens/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("a non-agent .jsonl under subagents/ counts as neither population", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), usageLine("claude-fable-5", 5000) + "\n");
  writeFileSync(join(dir, "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n");
  // Under subagents/ but not agent-*: must not be mistaken for a main session,
  // or a stray sidecar would inflate the denominator it is measured against.
  writeFileSync(join(dir, "scratch.jsonl"), usageLine("claude-opus-5", 999999) + "\n");
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /Main sessions \(not routable\): 5k across 1 sessions/);
    assert.doesNotMatch(out, /opus-5/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("a sidecar .jsonl beside subagents/ is not counted as a main session", () => {
  const cfg = freshConfigDir();
  const sess = join(cfg, "projects", "proj", "sess-1");
  mkdirSync(join(sess, "subagents"), { recursive: true });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), usageLine("claude-fable-5", 5000) + "\n");
  writeFileSync(join(sess, "subagents", "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n");
  // Sibling of subagents/, inside the session dir - a journal or scratch file.
  // Only the transcript one level up is a session; anything deeper is not.
  writeFileSync(join(sess, "journal.jsonl"), usageLine("claude-opus-5", 999999) + "\n");
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /Main sessions \(not routable\): 5k across 1 sessions/);
    assert.doesNotMatch(out, /opus-5/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("--session scopes the main-session denominator too", () => {
  const cfg = freshConfigDir();
  const fableDir = join(cfg, "projects", "proj", "sess-fable", "subagents");
  const opusDir = join(cfg, "projects", "proj", "sess-opus", "subagents");
  mkdirSync(fableDir, { recursive: true });
  mkdirSync(opusDir, { recursive: true });
  // Both main transcripts carry usage, so the filter - not an empty read - is
  // what decides which one reaches the denominator.
  writeFileSync(join(cfg, "projects", "proj", "sess-fable.jsonl"), usageLine("claude-fable-5", 4000) + "\n");
  writeFileSync(join(cfg, "projects", "proj", "sess-opus.jsonl"), usageLine("claude-opus-4-8", 8000) + "\n");
  writeFileSync(join(fableDir, "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n");
  writeFileSync(join(opusDir, "agent-b.jsonl"), usageLine("claude-opus-4-8", 3000) + "\n");
  try {
    const out = run(["tokens", "--session", "fable"], cfg);
    // Only the fable session's 4k, never the opus session's 8k.
    assert.match(out, /Main sessions \(not routable\): 4k across 1 sessions/);
    assert.match(out, /Subagents are 20% of the 5k total/);
    assert.doesNotMatch(out, /opus-4-8\s+8k/);
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

// Effort has three sources with a precedence between them, so these tests pin
// every rung: a temp CLAUDE_CONFIG_DIR for the user file, a temp cwd for the two
// project files, and an explicit env var for the override. Nothing here may read
// the directory the suite happens to run from - run() defaults cwd to the temp
// config dir for exactly that reason.
function freshCwd() {
  return mkdtempSync(join(tmpdir(), "mr-cwd-"));
}

function logEntries(cfg) {
  return readFileSync(join(cfg, "model-routing", "dispatches.jsonl"), "utf-8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// One dispatch through the hook, returning the logged entry. `settings` maps a
// rung to its JSON: "user" -> <cfg>/settings.json, "project" ->
// <cwd>/.claude/settings.json, "local" -> <cwd>/.claude/settings.local.json; a
// string value is written verbatim so a rung can hold unparseable content.
// sessionModel defaults to a supported model so the precedence cases exercise
// the real clamp path - with no model the clamp cannot run and every one of them
// would assert against an early return instead. Pass null to test that.
function dispatchWithSettings({ settings = {}, env, sessionModel = "claude-opus-5" }) {
  const cfg = freshConfigDir();
  const cwd = freshCwd();
  const write = (p, v) => writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v));
  try {
    if (settings.user !== undefined) write(join(cfg, "settings.json"), settings.user);
    if (settings.project !== undefined || settings.local !== undefined) mkdirSync(join(cwd, ".claude"), { recursive: true });
    if (settings.project !== undefined) write(join(cwd, ".claude", "settings.json"), settings.project);
    if (settings.local !== undefined) write(join(cwd, ".claude", "settings.local.json"), settings.local);
    const event = { tool_name: "Agent", tool_input: { subagent_type: "x" }, cwd };
    if (sessionModel) {
      const sess = join(cfg, "sess.jsonl");
      writeFileSync(sess, JSON.stringify({ message: { model: sessionModel } }) + "\n");
      event.transcript_path = sess;
    }
    run([], cfg, JSON.stringify(event), env);
    return logEntries(cfg)[0];
  } finally {
    rmSync(cfg, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("hook records the session effort from the user settings file", () => {
  const e = dispatchWithSettings({ settings: { user: { effortLevel: "high" } } });
  assert.equal(e.effort, "high");
  assert.equal(e.effortFrom, "settings");
});

test("the project settings file outranks the user one for effort", () => {
  // The middle rung: without a test here, dropping or misordering it passes.
  const e = dispatchWithSettings({ settings: { user: { effortLevel: "high" }, project: { effortLevel: "medium" } } });
  assert.equal(e.effort, "medium");
});

test("the local settings file outranks the project one for effort", () => {
  const e = dispatchWithSettings({ settings: { project: { effortLevel: "medium" }, local: { effortLevel: "low" } } });
  assert.equal(e.effort, "low");
});

test("CLAUDE_CODE_EFFORT_LEVEL overrides every settings rung", () => {
  // The env var wins in Claude Code, so reporting the settings value would name
  // an effort the session did not run on.
  const e = dispatchWithSettings({
    settings: { user: { effortLevel: "high" }, local: { effortLevel: "high" } },
    env: { CLAUDE_CODE_EFFORT_LEVEL: "low" },
  });
  assert.equal(e.effort, "low");
  assert.equal(e.effortFrom, "env");
});

test("max is accepted from the env var but rejected from a settings file", () => {
  // Settings reject max as session-only; the env var accepts it.
  const fromEnv = dispatchWithSettings({ env: { CLAUDE_CODE_EFFORT_LEVEL: "max" } });
  assert.equal(fromEnv.effort, "max");
  const fromSettings = dispatchWithSettings({ settings: { user: { effortLevel: "max" } } });
  assert.equal("effort" in fromSettings, false);
});

test("ultracode is accepted from no source", () => {
  // It is a Claude Code setting, not a model effort level: the persisted key
  // and the env var both reject it, so it must never appear as a level.
  assert.equal("effort" in dispatchWithSettings({ env: { CLAUDE_CODE_EFFORT_LEVEL: "ultracode" } }), false);
  assert.equal("effort" in dispatchWithSettings({ settings: { user: { effortLevel: "ultracode" } } }), false);
});

test("a model the docs list as having no effort support gets no level", () => {
  // The support table is an enumeration, not a version threshold: Haiku 4.5 is
  // absent from it, and claude-3-5-sonnet ranks fine under TIER_PATTERNS while
  // predating adaptive reasoning entirely. Neither may be handed a default, and
  // neither may be handed a configured level as though it had run.
  const haiku = dispatchWithSettings({ sessionModel: "claude-haiku-4-5" });
  assert.equal("effort" in haiku, false);
  const old = dispatchWithSettings({ sessionModel: "claude-3-5-sonnet-20241022", settings: { user: { effortLevel: "high" } } });
  assert.equal("effort" in old, false);
});

test("a level the model does not support is recorded as the level that ran", () => {
  // "xhigh runs as high on Opus 4.6" - so logging xhigh there would name an
  // effort the session never used.
  const clamped = dispatchWithSettings({ settings: { user: { effortLevel: "xhigh" } }, sessionModel: "claude-opus-4-6" });
  assert.equal(clamped.effort, "high");
  assert.equal(clamped.effortFrom, "settings");
  // Control: the same level on a model that does support it is untouched.
  const kept = dispatchWithSettings({ settings: { user: { effortLevel: "xhigh" } }, sessionModel: "claude-opus-5" });
  assert.equal(kept.effort, "xhigh");
});

test("CLAUDE_CODE_EFFORT_LEVEL=auto records the model default, not the settings value", () => {
  const e = dispatchWithSettings({
    settings: { user: { effortLevel: "low" } },
    env: { CLAUDE_CODE_EFFORT_LEVEL: "auto" },
    sessionModel: "claude-opus-5",
  });
  assert.equal(e.effort, "high");
  assert.equal(e.effortFrom, "default");
});

test("an unset effortLevel records the documented model default", () => {
  // The most common configuration of all: nothing set anywhere. Omitting it
  // left the report blank for most users.
  const opus5 = dispatchWithSettings({ sessionModel: "claude-opus-5" });
  assert.equal(opus5.effort, "high");
  assert.equal(opus5.effortFrom, "default");
  // Opus 4.7 is the documented exception.
  const opus47 = dispatchWithSettings({ sessionModel: "claude-opus-4-7" });
  assert.equal(opus47.effort, "xhigh");
});

test("no default is invented for a model absent from the support table", () => {
  // Named for the gate that actually fires: effort SUPPORT, not rankability.
  // An unknown family fails both tests, which is why the claude-3-5-sonnet case
  // above is the one that discriminates between them.
  const e = dispatchWithSettings({ sessionModel: "claude-zephyr-1" });
  assert.equal("effort" in e, false);
});

test("every model in the effort table is rankable by the tier table", () => {
  // The two model tables answer different questions at different granularity -
  // tier by family, effort support by version - so they stay separate, but they
  // must not disagree about which models exist. A model with effort support and
  // no tier would be excluded from the routed-down math while still reporting an
  // effort, which is the drift this pins.
  const src = readFileSync(SCRIPT, "utf-8");
  const rows = src.match(/const EFFORT_SUPPORT = \[([\s\S]*?)^\];/m)[1];
  const families = [...rows.matchAll(/\/([^/]+)\//g)].flatMap((m) => m[1].split("|"));
  assert.ok(families.length >= 6, `expected the documented model list, parsed ${families.length}`);
  // Every level named in a support row must exist on the ladder clampEffort
  // walks: a stray one would pass `levels.includes` and then fall out of the
  // downward walk silently, since indexOf returns -1 for it.
  const ladder = new Set([...src.match(/const EFFORT_LADDER = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const level of [...rows.matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
    assert.ok(ladder.has(level), `${level} is in EFFORT_SUPPORT but not on EFFORT_LADDER`);
  }
  // [\s\S] rather than . so reformatting either table across lines fails this
  // test on its subject, not on its own parsing.
  const tiers = src.match(/const TIER_PATTERNS = \[([\s\S]*?)\];/)[1];
  for (const family of families) {
    const ranked = [...tiers.matchAll(/\/([^/]+)\//g)]
      .some((m) => m[1].split("|").some((p) => new RegExp(p).test(`claude-${family}`)));
    assert.ok(ranked, `${family} has effort support but no tier in TIER_PATTERNS`);
  }
});

test("an effort value outside the ladder is ignored rather than logged", () => {
  // A typo or a future level must not become a fabricated data point.
  const e = dispatchWithSettings({ settings: { user: { effortLevel: "turbo" } } });
  assert.equal("effort" in e, false);
});

test("a bad value stops the walk instead of falling through to the next rung", () => {
  // Falling through would log the user-level "high" for a session whose local
  // file tried to set something else: a wrong data point replacing a missing
  // one. The harness would not have read past that rung either.
  const e = dispatchWithSettings({
    settings: { user: { effortLevel: "high" }, local: { effortLevel: "turbo" } },
    sessionModel: "claude-opus-5",
  });
  assert.equal("effort" in e, false);
});

test("a malformed settings file defers to the next rung", () => {
  // A file the harness cannot parse is ignored wholesale, so the next rung
  // decides - unlike a parseable file carrying a bad value.
  const e = dispatchWithSettings({ settings: { user: { effortLevel: "medium" }, local: "{ not json" } });
  assert.equal(e.effort, "medium");
});

test("nothing is recorded when the session model could not be read", () => {
  // The clamp needs the model: the same configured level means different things
  // on different models, and on Haiku 4.5 it means nothing at all. So an
  // unreadable session model records no effort rather than the configured value,
  // matching how the rest of the report excludes an unknown session.
  const fromSettings = dispatchWithSettings({ settings: { user: { effortLevel: "high" } }, sessionModel: null });
  assert.equal("effort" in fromSettings, false);
  const fromEnv = dispatchWithSettings({ env: { CLAUDE_CODE_EFFORT_LEVEL: "max" }, sessionModel: null });
  assert.equal("effort" in fromEnv, false);
});

test("report separates inherited effort from pinned, and flags inferred levels", () => {
  const cfg = freshConfigDir();
  const now = Date.now();
  writeLog(cfg, [
    { ts: now, agent: "general-purpose", model: "sonnet", session: "claude-opus-5", effort: "high", effortFrom: "settings" },
    { ts: now, agent: "general-purpose", model: "haiku", session: "claude-opus-5", effort: "high", effortFrom: "default" },
    // Frontmatter-pinned: carries its own effort, so it never inherits. Two of
    // them, both on the model default, so a count scoped to the whole
    // population instead of the inherited subset would print 3 of these under a
    // total of 2 - the fixture has to be able to tell those apart.
    { ts: now, agent: "model-routing:scout", session: "claude-opus-5", effort: "high", effortFrom: "default" },
    { ts: now, agent: "model-routing:reviewer", session: "claude-opus-5", effort: "high", effortFrom: "default" },
  ]);
  try {
    const out = run(["report"], cfg);
    assert.match(out, /Effort: 2 of 4 dispatches ran on an agent type carrying no pin this plugin knows about/);
    assert.match(out, /\(2 at high\)/);
    // An inferred default must never read as an observed setting, and the count
    // must be the inherited subset - 1 here, not the 3 in the whole population.
    assert.match(out, /1 of these levels are the documented model default rather than an observed setting/);
    // The source order and the invisible-change limit are stated, not implied.
    assert.match(out, /CLAUDE_CODE_EFFORT_LEVEL, then settings effortLevel, then the model default/);
    assert.match(out, /an agent from anywhere else may pin its own effort/i);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("report omits the effort section when no entry recorded one", () => {
  const cfg = freshConfigDir();
  writeLog(cfg, [{ ts: Date.now(), agent: "general-purpose", model: "sonnet", session: "claude-opus-5" }]);
  try {
    assert.doesNotMatch(run(["report"], cfg), /^Effort:/m);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("tokens falls back to the transcript tail when the head names no model", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  // A head larger than the 256KB read window that names no model: the first
  // assistant message lands past it, exactly as in real multi-MB sessions,
  // which used to drop the whole session out of the routed-down math.
  const pad = JSON.stringify({ type: "user", filler: "x".repeat(300000) });
  writeFileSync(join(cfg, "projects", "proj", "sess-1.jsonl"), pad + "\n" + usageLine("claude-opus-5", 5000) + "\n");
  writeFileSync(join(dir, "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n");
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /opus-5: 1k across 1 agents - 100% below session tier/);
    assert.doesNotMatch(out, /session unknown/);
    // The footer must admit the tail case: for these sessions the attribution
    // is the LAST model, the opposite bias from the start-model promise.
    assert.match(out, /the tail is read instead and that session is attributed to its LAST model/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});

test("the not-comparable note names the unreadable-session cause, not just the tier table", () => {
  const cfg = freshConfigDir();
  const dir = join(cfg, "projects", "proj", "sess-1", "subagents");
  mkdirSync(dir, { recursive: true });
  // No parent sess-1.jsonl at all: the session model cannot be read, which
  // extending TIER_PATTERNS would never have fixed.
  writeFileSync(join(dir, "agent-a.jsonl"), usageLine("claude-sonnet-5", 1000) + "\n");
  try {
    const out = run(["tokens"], cfg);
    assert.match(out, /no model could be read from the parent session transcript/);
  } finally { rmSync(cfg, { recursive: true, force: true }); }
});
