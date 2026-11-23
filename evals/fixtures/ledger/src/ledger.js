import { balanceDue } from "./payments.js";
import { sumMoney } from "./money.js";

export class Ledger {
  #invoices = new Map();

  add(invoice) {
    if (this.#invoices.has(invoice.id)) throw new Error(`duplicate invoice: ${invoice.id}`);
    this.#invoices.set(invoice.id, invoice);
  }

  replace(invoice) {
    if (!this.#invoices.has(invoice.id)) throw new Error(`unknown invoice: ${invoice.id}`);
    this.#invoices.set(invoice.id, invoice);
  }

  get(id) {
    return this.#invoices.get(id);
  }

  list() {
    return [...this.#invoices.values()];
  }

  outstanding() {
    return sumMoney(this.list().map(balanceDue));
  }
}
