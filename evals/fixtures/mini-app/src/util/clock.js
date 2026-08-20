let offsetMs = 0;

export function now() {
  return Date.now() + offsetMs;
}

export function setOffset(ms) {
  offsetMs = ms;
}
