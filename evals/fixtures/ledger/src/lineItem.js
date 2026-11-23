import { roundMoney } from "./money.js";

export function createLineItem({ sku, description = "", unitPrice, quantity, taxable = true }) {
  if (!sku) throw new Error("sku is required");
  if (!(unitPrice >= 0)) throw new Error("unitPrice must be a non-negative number");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
  return { sku, description, unitPrice, quantity, taxable };
}

export function lineTotal(item) {
  return roundMoney(item.unitPrice * item.quantity);
}
