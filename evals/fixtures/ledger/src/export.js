import { toCsvRow } from "./csv.js";
import { formatMoney } from "./money.js";
import { amountPaid, balanceDue } from "./payments.js";
import { computeTotals } from "./totals.js";

export const CSV_HEADER = ["id", "customer", "subtotal", "discount", "tax", "total", "paid", "balance"];

export function exportLedgerCsv(ledger) {
  const rows = [toCsvRow(CSV_HEADER)];
  const invoices = ledger.list();
  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    const t = computeTotals(invoice);
    rows.push(
      toCsvRow([
        invoice.id,
        invoice.customer,
        formatMoney(t.subtotal),
        formatMoney(t.discount),
        formatMoney(t.tax),
        formatMoney(t.total),
        formatMoney(amountPaid(invoice)),
        formatMoney(balanceDue(invoice)),
      ]),
    );
  }
  return rows.join("\n") + "\n";
}
