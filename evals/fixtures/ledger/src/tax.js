import { roundMoney } from "./money.js";

export function taxFor(base, rate) {
  if (rate < 0) throw new Error("tax rate must not be negative");
  return roundMoney(base * rate);
}
