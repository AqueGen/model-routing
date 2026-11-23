import { lineTotal } from "./lineItem.js";
import { discountAmount } from "./discount.js";
import { roundMoney, sumMoney } from "./money.js";
import { taxFor } from "./tax.js";

export function computeTotals(invoice) {
  let subtotal = 0;
  let taxableSubtotal = 0;
  for (let i = 0; i < invoice.lineItems.length; i++) {
    const item = invoice.lineItems[i];
    const total = lineTotal(item);
    subtotal += total;
    if (item.taxable) taxableSubtotal += total;
  }
  subtotal = roundMoney(subtotal);
  const discount = discountAmount(subtotal, invoice.discount);
  const tax = taxFor(taxableSubtotal, invoice.taxRate);
  return { subtotal, discount, tax, total: sumMoney([subtotal, -discount, tax]) };
}
