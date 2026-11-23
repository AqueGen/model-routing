import { roundMoney } from "./money.js";

export function discountAmount(subtotal, discount) {
  if (!discount) return 0;
  if (discount.type === "percent") {
    return roundMoney((subtotal * discount.value) / 100);
  }
  if (discount.type === "fixed") {
    return Math.min(roundMoney(discount.value), subtotal);
  }
  throw new Error(`unknown discount type: ${discount.type}`);
}
