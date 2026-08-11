#!/usr/bin/env node
// SessionStart hook: print a one-line notice when a newer plugin version has
// been published, so marketplace installs (which never auto-update) hear about
// it. Checks the network at most once per 24h via a timestamp cache; every
// failure path is silent - a version check must never break session start.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const MANIFEST_URL =
  process.env.MODEL_ROUTING_UPDATE_URL ??
  "https://raw.githubusercontent.com/AqueGen/model-routing/main/.claude-plugin/plugin.json";
const RELEASES_URL = "https://github.com/AqueGen/model-routing/releases";

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(latest, installed) {
  const a = parseVersion(latest);
  const b = parseVersion(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function fetchLatestVersion() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MANIFEST_URL, { signal: ctrl.signal });
    if (!res.ok) return null;
    const manifest = await res.json();
    return parseVersion(manifest.version) ? manifest.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let installed;
try {
  const manifestPath = join(process.env.CLAUDE_PLUGIN_ROOT ?? "", ".claude-plugin", "plugin.json");
  installed = JSON.parse(readFileSync(manifestPath, "utf-8")).version;
} catch {
  process.exit(0);
}

const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const cacheDir = join(configDir, "model-routing");
const cachePath = join(cacheDir, "update-check.json");

let cache = null;
try {
  cache = JSON.parse(readFileSync(cachePath, "utf-8"));
} catch {
  // no cache yet
}

const now = Date.now();
const stale = !cache || typeof cache.checkedAt !== "number" || now - cache.checkedAt >= CHECK_INTERVAL_MS;
if (stale) {
  const latest = await fetchLatestVersion();
  // Stamp checkedAt even on failure so an offline machine is not probed on
  // every session start; keep the previously known latest in that case.
  cache = { checkedAt: now, latest: latest ?? cache?.latest ?? null };
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache));
  } catch {
    // read-only home - notice still works off the in-memory cache
  }
}

if (cache && isNewer(cache.latest, installed)) {
  // systemMessage is the only hook output field documented as shown to the USER.
  // Plain stdout on SessionStart is added to Claude's context instead: the model
  // cannot update the plugin, and whether it relays the line is up to it - so a
  // plain-text notice reaches the person only by luck. Valid JSON on stdout is
  // parsed as hook output rather than injected as context.
  // Both commands are needed and in this order: nothing refreshes the
  // marketplace catalog on its own, so `plugin update` alone can reinstall the
  // version already in the stale catalog.
  console.log(
    JSON.stringify({
      systemMessage:
        `model-routing ${installed} installed, ${cache.latest} available. ` +
        `Update: claude plugin marketplace update model-routing && claude plugin update model-routing, then restart. ` +
        `Changes: ${RELEASES_URL}`,
    })
  );
}
