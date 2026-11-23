import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Ledger } from "./ledger.js";

export async function saveSnapshot(ledger, path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(ledger.list(), null, 2), "utf-8");
}

export async function loadSnapshot(path) {
  const invoices = JSON.parse(await readFile(path, "utf-8"));
  const ledger = new Ledger();
  for (const invoice of invoices) ledger.add(invoice);
  return ledger;
}
