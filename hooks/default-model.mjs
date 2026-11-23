import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULTS = { "general-purpose": "sonnet", Explore: "haiku" };

export function defaultModelFor(toolInput) {
  if (!toolInput || toolInput.model) return null;
  const model = DEFAULTS[toolInput.subagent_type ?? "general-purpose"];
  return model ? { ...toolInput, model } : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let event;
  try {
    event = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const updatedInput = defaultModelFor(event?.tool_input);
  if (updatedInput) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput } }));
  }
}
