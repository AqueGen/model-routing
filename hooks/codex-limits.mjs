#!/usr/bin/env node
// Codex usage windows from the newest Codex session logs: prints {"fiveHour":N,"week":N} or "null".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const jsonlFiles = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) out.push(p);
    }
  };
  walk(dir);
  return out;
};

const usedPct = (w, nowSec) =>
  w && Number.isFinite(Number(w.used_percent)) ? (Number(w.resets_at) <= nowSec ? 0 : Number(w.used_percent)) : null;

// Never throws: a missing dir, no rate_limits line or a malformed line gives null.
export function readCodexLimits(sessionsDir, nowSec = Date.now() / 1000) {
  try {
    const newest = jsonlFiles(sessionsDir)
      .map((p) => ({ p, t: statSync(p).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 5);
    for (const { p } of newest) {
      const lines = readFileSync(p, "utf-8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"rate_limits":{')) continue;
        try {
          const limits = JSON.parse(lines[i]).payload.rate_limits;
          const fiveHour = usedPct(limits.primary, nowSec);
          const week = usedPct(limits.secondary, nowSec);
          if (fiveHour != null && week != null) return { fiveHour, week };
        } catch {}
      }
    }
  } catch {}
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(JSON.stringify(readCodexLimits(join(homedir(), ".codex", "sessions"))));
}
