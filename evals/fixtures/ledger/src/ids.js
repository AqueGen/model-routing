export function nextInvoiceId(existingIds) {
  const numbers = existingIds.map((id) => Number(id.replace("INV-", ""))).filter(Number.isFinite);
  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  return `INV-${String(next).padStart(4, "0")}`;
}
