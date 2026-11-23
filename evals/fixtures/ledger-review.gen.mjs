#!/usr/bin/env node
// Generates the `ledger-review` fixture: the `ledger` fixture plus changes.diff,
// a patch carrying four seeded defects and two harmless edits. The tree itself
// stays unpatched, so the reviewer reads the diff and the code around it.

import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "ledger-review");

rmSync(OUT, { recursive: true, force: true });
cpSync(join(DIR, "ledger"), OUT, { recursive: true });
cpSync(join(DIR, "ledger-review.changes.diff"), join(OUT, "changes.diff"));
