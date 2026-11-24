import { closeSync, fstatSync, openSync, readSync } from "node:fs";

// Bounded fd reads, NOT readFileSync - these run inside the PostToolUse
// hook and session transcripts can be hundreds of MB. The optional vendor
// prefix accepts Bedrock/Vertex ids (us.anthropic.claude-...) while
// capturing from "claude-" so tierOf/shortModel see the same shape.
export const MODEL_RE = /"model":"(?:[a-z0-9-]+\.)*(claude-[a-z0-9.-]+)"/g;
export function readSlice(file, bytes, fromEnd) {
  let fd;
  try {
    fd = openSync(file, "r");
    const size = fstatSync(fd).size;
    const len = Math.min(bytes, size);
    if (!len) return "";
    const buf = Buffer.alloc(len);
    const n = readSync(fd, buf, 0, len, fromEnd ? size - len : 0);
    return buf.toString("utf-8", 0, n);
  } catch { return ""; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

export function firstModelIn(file, bytes) {
  // Session-START model: the head of the session jsonl. The tokens report uses
  // it only as a LAST resort, when neither the dispatching assistant message
  // nor the timeline around the agent's first timestamp could name a model -
  // a /model switch later in the session is invisible to it.
  const m = readSlice(file, bytes, false).match(/"model":"(?:[a-z0-9-]+\.)*(claude-[a-z0-9.-]+)"/);
  return m?.[1] ?? null;
}

export function lastModelIn(file, bytes) {
  // Model in effect NOW: the last model named in the transcript tail. The
  // dispatch hook uses this so /model switches, opusplan's plan->execute
  // handoff, and quota fallbacks judge each dispatch against the model the
  // session was actually on at dispatch time, not at session start.
  let last = null;
  for (const m of readSlice(file, bytes, true).matchAll(MODEL_RE)) last = m[1];
  return last;
}
