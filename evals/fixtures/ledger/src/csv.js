function encodeField(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsvRow(fields) {
  return fields.map(encodeField).join(",");
}
