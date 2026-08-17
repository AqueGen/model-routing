import { request } from "./client.js";

const MAX_ATTEMPTS = 3;

export async function requestWithRetry(session, path) {
  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await request(session, path);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
