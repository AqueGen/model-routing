import { createLineItem } from "./lineItem.js";

export function createInvoice({ id, customer, lineItems = [], discount = null, taxRate = 0 }) {
  if (!id) throw new Error("id is required");
  if (!customer) throw new Error("customer is required");
  return {
    id,
    customer,
    lineItems: lineItems.map(createLineItem),
    discount,
    taxRate,
    payments: [],
  };
}

export function addLineItem(invoice, item) {
  return { ...invoice, lineItems: [...invoice.lineItems, createLineItem(item)] };
}
