import { now } from "../util/clock.js";

const SESSION_TTL_MS = 15 * 60 * 1000;

export function isExpired(session) {
  return now() - session.issuedAt > SESSION_TTL_MS;
}

// The only place a session's lifetime is extended.
export function refreshSession(session) {
  if (!isExpired(session)) return session;
  return { ...session, issuedAt: now() };
}
