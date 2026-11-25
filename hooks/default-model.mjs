#!/usr/bin/env node
// PreToolUse hook on Agent|Task: applies the routing mode from config.json (see
// lib/guard.mjs) and refuses a dispatch the mode forbids. Deny rather than an
// `updatedInput` rewrite: auto mode can deny a rewritten call and then run the
// retry unchanged, a deny works in every mode.
import { readFileSync } from "node:fs";
import { loadConfig } from "./lib/config.mjs";
import { guardDecision } from "./lib/guard.mjs";
import { lastModelIn } from "./lib/transcript.mjs";

try {
  const event = JSON.parse(readFileSync(0, "utf-8"));
  const config = loadConfig();
  if (config.isOn) {
    const session = event.transcript_path ? lastModelIn(event.transcript_path, 262144) : null;
    const reason = guardDecision({
      input: event.tool_input,
      session,
      env: (process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? "").trim(),
      envForce: ["1", "true", "yes", "on"].includes((process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE ?? "").trim().toLowerCase()),
      config,
    });
    if (reason) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
      }));
    }
  }
} catch {
  // Never fail the hook: a broken advisor must not break tool use.
}
process.exit(0);
