import { roundMoney, sumMoney } from "./money.js";
import { computeTotals } from "./totals.js";

export function recordPayment(invoice, amount) {
  if (!(amount > 0)) throw new Error("payment must be positive");
  return { ...invoice, payments: [...invoice.payments, roundMoney(amount)] };
}

export function amountPaid(invoice) {
  return sumMoney(invoice.payments);
}

export function balanceDue(invoice) {
  return roundMoney(computeTotals(invoice).total - amountPaid(invoice));
}
