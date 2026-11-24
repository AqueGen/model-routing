#!/usr/bin/env node
// PreToolUse hook on Agent|Task: with bareDispatch "deny" in config.json, refuses
// a bare general-purpose or Explore dispatch that would inherit a pricier
// session model. Deny rather than an `updatedInput` rewrite: auto mode can deny
// a rewritten call and then run the retry unchanged, a deny works in every mode.
import { readFileSync } from "node:fs";
import { bareDispatchAdvice, bareDispatchText } from "./lib/bare-dispatch.mjs";
import { loadConfig } from "./lib/config.mjs";
import { lastModelIn } from "./lib/transcript.mjs";

try {
  const event = JSON.parse(readFileSync(0, "utf-8"));
  const config = loadConfig();
  if (config.bareDispatch === "deny") {
    const session = event.transcript_path ? lastModelIn(event.transcript_path, 262144) : null;
    const advice = bareDispatchAdvice({
      input: event.tool_input,
      session,
      env: (process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? "").trim(),
      envForce: ["1", "true", "yes", "on"].includes((process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE ?? "").trim().toLowerCase()),
      config,
    });
    if (advice) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: bareDispatchText(advice) },
      }));
    }
  }
} catch {
  // Never fail the hook: a broken advisor must not break tool use.
}
process.exit(0);
