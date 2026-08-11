// Smoke tests for update-check.mjs. Run: node --test hooks/
// Tests drive the script end-to-end: CLAUDE_PLUGIN_ROOT points at a temp
// plugin dir, CLAUDE_CONFIG_DIR at a temp cache dir, and the remote manifest
// is served by a throwaway local http server via MODEL_ROUTING_UPDATE_URL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "update-check.mjs");
const DAY_MS = 24 * 60 * 60 * 1000;

function makePluginRoot(version) {
  const root = mkdtempSync(join(tmpdir(), "mr-upd-root-"));
  mkdirSync(join(root, ".claude-plugin"));
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "model-routing", version }));
  return root;
}

function envFor(pluginRoot, configDir, updateUrl) {
  return {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_CONFIG_DIR: configDir,
    MODEL_ROUTING_UPDATE_URL: updateUrl,
  };
}

// Sync runner for tests with no live server. Server-backed tests MUST use
// runAsync: execFileSync blocks the parent's event loop, so the in-process
// http server would never answer and the child would silently time out.
function run(pluginRoot, configDir, updateUrl) {
  return execFileSync(process.execPath, [SCRIPT], { env: envFor(pluginRoot, configDir, updateUrl), encoding: "utf-8" });
}

const execFileAsync = promisify(execFile);
async function runAsync(pluginRoot, configDir, updateUrl) {
  const { stdout } = await execFileAsync(process.execPath, [SCRIPT], {
    env: envFor(pluginRoot, configDir, updateUrl),
    encoding: "utf-8",
  });
  return stdout;
}

function serveOnce(body) {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/plugin.json`, close: () => server.close() });
    });
  });
}

function readCache(configDir) {
  return JSON.parse(readFileSync(join(configDir, "model-routing", "update-check.json"), "utf-8"));
}

test("prints a notice and writes the cache when the remote is newer", async () => {
  const { url, close } = await serveOnce(JSON.stringify({ version: "9.9.9" }));
  try {
    const configDir = mkdtempSync(join(tmpdir(), "mr-upd-cfg-"));
    const out = await runAsync(makePluginRoot("1.0.0"), configDir, url);
    // The notice has to reach the USER, and systemMessage is the only output
    // field documented as doing that - plain stdout on SessionStart goes to
    // Claude's context, where reaching the person depends on the model relaying
    // it. Parsing here is the assertion: a bare string would throw.
    const notice = JSON.parse(out).systemMessage;
    assert.match(notice, /1\.0\.0 installed, 9\.9\.9 available/);
    // Both commands in full, catalog refresh first: nothing refreshes the catalog
    // on its own, so `plugin update` alone can reinstall the version already in a
    // stale one. The `claude plugin ` prefix is part of what must be asserted -
    // without it the assertion passes on a command nobody can paste.
    assert.match(
      notice,
      /claude plugin marketplace update model-routing && claude plugin update model-routing/
    );
    // README promises the release notes link, so the notice owes it.
    assert.match(notice, /https:\/\/github\.com\/AqueGen\/model-routing\/releases/);
    assert.equal(readCache(configDir).latest, "9.9.9");
  } finally {
    close();
  }
});

test("stays silent when up to date", async () => {
  const { url, close } = await serveOnce(JSON.stringify({ version: "1.0.0" }));
  try {
    const out = await runAsync(makePluginRoot("1.0.0"), mkdtempSync(join(tmpdir(), "mr-upd-cfg-")), url);
    assert.equal(out, "");
  } finally {
    close();
  }
});

test("uses a fresh cache without touching the network", async () => {
  // A live server that answers DIFFERENTLY from the cache is what makes this
  // test able to fail. A dead port cannot: the fetch would return null, the
  // cached latest would be restored, and the output would be identical whether
  // the freshness check ran or not - so the assertion held while the behaviour
  // it names was gone. The untouched checkedAt is the second half of the proof.
  const { url, close } = await serveOnce(JSON.stringify({ version: "9.9.9" }));
  try {
    const configDir = mkdtempSync(join(tmpdir(), "mr-upd-cfg-"));
    mkdirSync(join(configDir, "model-routing"), { recursive: true });
    const checkedAt = Date.now();
    writeFileSync(
      join(configDir, "model-routing", "update-check.json"),
      JSON.stringify({ checkedAt, latest: "2.0.0" })
    );
    const out = await runAsync(makePluginRoot("1.0.0"), configDir, url);
    assert.match(out, /1\.0\.0 installed, 2\.0\.0 available/);
    assert.doesNotMatch(out, /9\.9\.9/, "a fresh cache must not be refreshed from the network");
    assert.equal(readCache(configDir).checkedAt, checkedAt, "checkedAt must be left alone");
  } finally {
    close();
  }
});

test("a stale cache is refreshed from the network", async () => {
  const { url, close } = await serveOnce(JSON.stringify({ version: "9.9.9" }));
  try {
    const configDir = mkdtempSync(join(tmpdir(), "mr-upd-cfg-"));
    mkdirSync(join(configDir, "model-routing"), { recursive: true });
    writeFileSync(
      join(configDir, "model-routing", "update-check.json"),
      JSON.stringify({ checkedAt: Date.now() - 2 * DAY_MS, latest: "2.0.0" })
    );
    const out = await runAsync(makePluginRoot("1.0.0"), configDir, url);
    assert.match(out, /1\.0\.0 installed, 9\.9\.9 available/);
    assert.equal(readCache(configDir).latest, "9.9.9");
  } finally {
    close();
  }
});

test("network failure is silent but still stamps the cache", () => {
  const configDir = mkdtempSync(join(tmpdir(), "mr-upd-cfg-"));
  const before = Date.now();
  const out = run(makePluginRoot("1.0.0"), configDir, "http://127.0.0.1:1/plugin.json");
  assert.equal(out, "");
  const cache = readCache(configDir);
  assert.ok(cache.checkedAt >= before, "checkedAt must be stamped so offline machines are not probed every start");
  assert.equal(cache.latest, null);
});

test("network failure keeps the previously known latest", () => {
  const configDir = mkdtempSync(join(tmpdir(), "mr-upd-cfg-"));
  mkdirSync(join(configDir, "model-routing"), { recursive: true });
  writeFileSync(
    join(configDir, "model-routing", "update-check.json"),
    JSON.stringify({ checkedAt: Date.now() - 2 * DAY_MS, latest: "3.0.0" })
  );
  const out = run(makePluginRoot("1.0.0"), configDir, "http://127.0.0.1:1/plugin.json");
  assert.match(out, /3\.0\.0 available/);
  assert.equal(readCache(configDir).latest, "3.0.0");
});

test("malformed remote manifest is silent", async () => {
  const { url, close } = await serveOnce("not json at all");
  try {
    const out = await runAsync(makePluginRoot("1.0.0"), mkdtempSync(join(tmpdir(), "mr-upd-cfg-")), url);
    assert.equal(out, "");
  } finally {
    close();
  }
});

test("missing plugin manifest exits silently", () => {
  const root = mkdtempSync(join(tmpdir(), "mr-upd-root-"));
  const out = run(root, mkdtempSync(join(tmpdir(), "mr-upd-cfg-")), "http://127.0.0.1:1/plugin.json");
  assert.equal(out, "");
});
