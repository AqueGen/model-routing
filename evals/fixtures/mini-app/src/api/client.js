import { refreshSession } from "../auth/session.js";

export async function request(session, path) {
  const live = refreshSession(session);
  const response = await fetch(`https://example.invalid${path}`, {
    headers: { authorization: `Bearer ${live.token}` },
  });
  return { session: live, body: await response.json() };
}
