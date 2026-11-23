import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defaultModelFor } from "./default-model.mjs";

const script = fileURLToPath(new URL("./default-model.mjs", import.meta.url));
const run = (event) => execFileSync(process.execPath, [script], { input: JSON.stringify(event) }).toString();

test("bare general-purpose gets sonnet, other fields kept", () => {
  assert.deepEqual(defaultModelFor({ subagent_type: "general-purpose", prompt: "p", description: "d" }), {
    subagent_type: "general-purpose", prompt: "p", description: "d", model: "sonnet",
  });
});

test("missing subagent_type is general-purpose", () => {
  assert.equal(defaultModelFor({ prompt: "p" }).model, "sonnet");
});

test("bare Explore gets haiku", () => {
  assert.equal(defaultModelFor({ subagent_type: "Explore", prompt: "p" }).model, "haiku");
});

test("an explicit model is never touched", () => {
  assert.equal(defaultModelFor({ subagent_type: "general-purpose", model: "opus" }), null);
});

test("pinned and other agent types are left alone", () => {
  for (const t of ["model-routing:implementer", "fork", "Plan", "pre-push-reviewer"]) {
    assert.equal(defaultModelFor({ subagent_type: t, prompt: "p" }), null);
  }
});

test("hook prints updatedInput only when it changes something", () => {
  const out = JSON.parse(run({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", prompt: "p" } }));
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(out.hookSpecificOutput.updatedInput.model, "sonnet");
  assert.equal(run({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", model: "opus" } }), "");
});

test("hook ignores malformed input", () => {
  assert.equal(execFileSync(process.execPath, [script], { input: "not json" }).toString(), "");
});
