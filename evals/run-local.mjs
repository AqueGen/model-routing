#!/usr/bin/env node
// Local stand-in for `claude plugin eval`, which is early access and gated for
// this account. It reads the SAME case layout the real harness reads
// (evals/<case>/prompt.md + graders/*.md), runs each case with and without the
// plugin, and scores the regex graders. When the gate opens, delete this file
// and run `claude plugin eval model-routing --ablation with-without` instead.
//
// Only the subset of the format this suite actually uses is supported: regex
// graders over `trace` and `last_message`. Anything else is reported as skipped
// rather than silently scored.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(EVALS_DIR, "..");
const FIXTURES_DIR = join(EVALS_DIR, "fixtures");

const args = parseArgs(process.argv.slice(2));
const cases = discoverCases().filter((c) => !args.case || c.name.includes(args.case));
if (cases.length === 0) {
  console.error("No eval cases found.");
  process.exit(1);
}

const arms = args.arm === "both" ? ["with", "without"] : [args.arm];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const resultsDir = join(EVALS_DIR, "results", stamp);
mkdirSync(resultsDir, { recursive: true });

const report = { model: args.model, runs: args.runs, arms, cases: [] };

for (const kase of cases) {
  const runs = args.runs ?? kase.frontmatter.runs ?? 3;
  const timeoutMs = (kase.frontmatter.timeout_seconds ?? 300) * 1000;
  const armResults = {};

  for (const arm of arms) {
    armResults[arm] = [];
    for (let i = 0; i < runs; i++) {
      process.stderr.write(`${kase.name} [${arm}] run ${i + 1}/${runs} ... `);
      const run = await runOnce(kase, arm, timeoutMs);
      writeFileSync(join(resultsDir, `${kase.name}.${arm}.${i + 1}.jsonl`), run.trace, "utf-8");
      if (run.exitCode !== 0) {
        writeFileSync(join(resultsDir, `${kase.name}.${arm}.${i + 1}.stderr.txt`), run.stderr, "utf-8");
        process.stderr.write(`exit ${run.exitCode}: ${run.stderr.trim().split("\n").pop() ?? ""}\n`);
      }
      const scores = kase.graders.map((g) => ({ grader: g.name, ...grade(g, run) }));
      armResults[arm].push({
        exitCode: run.exitCode,
        costUsd: run.costUsd,
        durationMs: run.durationMs,
        turns: run.turns,
        modelUsage: run.modelUsage,
        scores,
      });
      const passed = scores.filter((s) => s.pass).length;
      process.stderr.write(`${passed}/${scores.length}\n`);
    }
  }

  report.cases.push({ name: kase.name, arms: armResults });
  printCase(kase, armResults);
}

writeFileSync(join(resultsDir, "aggregate.json"), JSON.stringify(report, null, 2), "utf-8");
console.log(`\nTraces and aggregate.json: ${resultsDir}`);

// --- running -------------------------------------------------------------

// The real harness gets its workspace from case.yaml `context.scaffold_script`,
// which needs a run to verify. Until then a case names its fixture directory
// under evals/fixtures; a fixture too large to commit ships as `<name>.gen.mjs`
// next to it and is generated on first use.
function fixtureFor(kase) {
  const name = args.fixture ?? kase.frontmatter.fixture ?? "mini-app";
  const dir = join(FIXTURES_DIR, name);
  if (isDir(dir)) return dir;

  const generator = join(FIXTURES_DIR, `${name}.gen.mjs`);
  if (!isFile(generator)) throw new Error(`No fixture "${name}" and no ${name}.gen.mjs to build one`);
  execFileSync(process.execPath, [generator], { stdio: "inherit" });
  if (!isDir(dir)) throw new Error(`${name}.gen.mjs ran but produced no ${dir}`);
  return dir;
}

// One turn measures the cost of delegating and none of the return: the context
// a subagent kept out of the main session only pays off when a later turn would
// have re-read it. A case with follow-ups runs them in the same session so that
// re-reading actually happens.
async function runOnce(kase, arm, timeoutMs) {
  const workspace = mkdtempSync(join(tmpdir(), "model-routing-eval-"));
  cpSync(fixtureFor(kase), workspace, { recursive: true });

  const turns = [];
  for (const [index, prompt] of [kase.prompt, ...kase.followups].entries()) {
    turns.push(await runTurn(prompt, arm, workspace, timeoutMs, index > 0));
  }

  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch {
    // A file left open by the child is not worth failing a run over.
  }

  return {
    trace: turns.map((t) => t.trace).join("\n"),
    stderr: turns.map((t) => t.stderr).join("\n"),
    exitCode: turns.find((t) => t.exitCode !== 0)?.exitCode ?? 0,
    lastMessage: turns.map((t) => t.lastMessage).join("\n\n"),
    costUsd: sum(turns.map((t) => t.costUsd)),
    durationMs: sum(turns.map((t) => t.durationMs)),
    turns: sum(turns.map((t) => t.turns)),
    modelUsage: mergeModelUsage(turns.map((t) => t.modelUsage)),
  };
}

function sum(values) {
  return values.reduce((a, b) => a + (b ?? 0), 0);
}

function mergeModelUsage(all) {
  const merged = {};
  for (const usage of all) {
    for (const [model, u] of Object.entries(usage ?? {})) {
      const acc = (merged[model] ??= { costUSD: 0, inputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 0 });
      for (const key of Object.keys(acc)) acc[key] += u[key] ?? 0;
    }
  }
  return merged;
}

async function runTurn(prompt, arm, workspace, timeoutMs, isFollowup) {
  const argv = [
    "-p",
    prompt,
    ...(isFollowup ? ["--continue"] : []),
    "--output-format",
    "stream-json",
    "--verbose",
    "--strict-mcp-config",
    // Drop the user's own settings so the baseline arm is genuinely
    // plugin-free: enabledPlugins lives in ~/.claude/settings.json, and
    // model-routing is enabled there on this machine.
    "--setting-sources",
    "",
    "--permission-mode",
    "dontAsk",
    "--model",
    args.model,
  ];
  if (arm === "with") argv.push("--plugin-dir", PLUGIN_ROOT);

  // No `shell: true` - it concatenates argv, which mangles the prompt.
  const child = spawn(process.platform === "win32" ? "claude.exe" : "claude", argv, { cwd: workspace });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));

  const timer = setTimeout(() => child.kill(), timeoutMs);
  const exitCode = await new Promise((res) => child.on("close", res));
  clearTimeout(timer);

  const result = extractResult(stdout);
  return {
    trace: stdout,
    stderr,
    exitCode,
    lastMessage: typeof result?.result === "string" ? result.result : "",
    costUsd: result?.total_cost_usd ?? null,
    durationMs: result?.duration_ms ?? null,
    turns: result?.num_turns ?? null,
    modelUsage: result?.modelUsage ?? {},
  };
}

function extractResult(stdout) {
  for (const line of stdout.split("\n").reverse()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "result") return parsed;
    } catch {
      // Non-JSON noise on stdout is not a result line.
    }
  }
  return null;
}

// --- grading -------------------------------------------------------------

function grade(grader, run) {
  if (grader.type !== "regex") return { pass: false, skipped: `unsupported grader type: ${grader.type}` };
  const haystack = grader.target === "last_message" ? run.lastMessage : run.trace;
  const hit = new RegExp(grader.pattern, grader.flags ?? "").test(haystack);
  const wanted = grader.match ?? "contains";
  return { pass: wanted === "not_contains" ? !hit : hit };
}

function printCase(kase, armResults) {
  console.log(`\n${kase.name}`);
  for (const grader of kase.graders) {
    const cells = Object.entries(armResults).map(([arm, runs]) => {
      const passed = runs.filter((r) => r.scores.find((s) => s.grader === grader.name)?.pass).length;
      return `${arm} ${passed}/${runs.length}`;
    });
    const rates = Object.values(armResults).map(
      (runs) => runs.filter((r) => r.scores.find((s) => s.grader === grader.name)?.pass).length / runs.length,
    );
    const delta = rates.length === 2 ? ` | delta ${(rates[0] - rates[1]).toFixed(2)}` : "";
    console.log(`  ${grader.name}: ${cells.join(" | ")}${delta}`);
  }
  // A behavioural delta is only half the answer. Routing a question out of the
  // main session buys context back and pays for it in dollars and latency, so
  // print the price next to the score rather than letting the score stand alone.
  const price = Object.entries(armResults).map(([arm, runs]) => {
    const cost = mean(runs.map((r) => r.costUsd));
    const seconds = mean(runs.map((r) => r.durationMs)) / 1000;
    return `${arm} $${cost.toFixed(3)} / ${seconds.toFixed(0)}s`;
  });
  console.log(`  cost per run: ${price.join(" | ")}`);

  // The total hides the thing the plugin is actually for. Whether work left the
  // expensive tier only shows in the per-model split: a total that went up while
  // the top-tier line held flat is the plugin working, not the plugin costing.
  for (const [arm, runs] of Object.entries(armResults)) {
    const perModel = new Map();
    for (const run of runs) {
      for (const [model, usage] of Object.entries(run.modelUsage ?? {})) {
        const acc = perModel.get(model) ?? { cost: 0, read: 0, n: 0 };
        acc.cost += usage.costUSD ?? 0;
        acc.read += (usage.cacheReadInputTokens ?? 0) + (usage.inputTokens ?? 0);
        acc.n = runs.length;
        perModel.set(model, acc);
      }
    }
    const parts = [...perModel.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([model, a]) => `${model} $${(a.cost / a.n).toFixed(3)} / ${Math.round(a.read / a.n / 1000)}k in`);
    console.log(`  ${arm} by model: ${parts.join(" | ")}`);
  }
}

function mean(values) {
  const usable = values.filter((v) => typeof v === "number");
  if (usable.length === 0) return NaN;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

// --- case discovery ------------------------------------------------------

function discoverCases() {
  return readdirSync(EVALS_DIR)
    .filter((entry) => {
      const path = join(EVALS_DIR, entry);
      if (!isDir(path)) return false;
      return isFile(join(path, "prompt.md"));
    })
    .map((entry) => loadCase(join(EVALS_DIR, entry)));
}

function loadCase(dir) {
  const { frontmatter, body } = splitFrontmatter(readFileSync(join(dir, "prompt.md"), "utf-8"));
  const gradersDir = join(dir, "graders");
  const graders = isDir(gradersDir)
    ? readdirSync(gradersDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          name: f.replace(/\.md$/, ""),
          ...splitFrontmatter(readFileSync(join(gradersDir, f), "utf-8")).frontmatter,
        }))
    : [];
  // followup-1.md, followup-2.md ... are further turns of the same session.
  const followups = readdirSync(dir)
    .filter((f) => /^followup-\d+\.md$/.test(f))
    .sort()
    .map((f) => splitFrontmatter(readFileSync(join(dir, f), "utf-8")).body.trim());

  return {
    name: frontmatter.name ?? dir.split(/[\\/]/).pop(),
    frontmatter,
    prompt: body.trim(),
    followups,
    graders,
  };
}

// Enough YAML for this format: scalars, quoted scalars, and inline lists. A
// real parser would be a dependency for four keys.
function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    frontmatter[kv[1]] = parseScalar(kv[2]);
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => parseScalar(v))
      .filter((v) => v !== "");
  }
  if (/^'.*'$/.test(value) || /^".*"$/.test(value)) return value.slice(1, -1);
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseArgs(argv) {
  const out = { runs: null, model: "sonnet", arm: "both", case: null, fixture: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") out.runs = Number(argv[++i]);
    else if (argv[i] === "--model") out.model = argv[++i];
    else if (argv[i] === "--arm") out.arm = argv[++i];
    else if (argv[i] === "--case") out.case = argv[++i];
    else if (argv[i] === "--fixture") out.fixture = argv[++i];
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return out;
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
