#!/usr/bin/env node
// Generates the `order-service` fixture: a pipeline whose shape can only be
// learned by reading it. Committed as a generator rather than as files because
// the fixture runs to a few hundred kilobytes and every user of this plugin
// would otherwise install it.
//
// Two properties matter, and both are deliberate.
//
// The question is broad - trace the flow end to end - because a narrow one is
// answered by a single grep, and a grep costs the same whether or not it happens
// in the expensive session. Delegation can only pay where the reading is wide.
//
// The stage modules are fat. Tracing a chain of small files is cheap no matter
// how many files there are, so each hop has to cost something to read: the
// handoff sits at the bottom of a few hundred lines of plausible logic, and the
// helpers name other stages so that grepping for a stage name is noisy.
//
// Deterministic: same output every run, no randomness, no network.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "order-service");

const STAGES = [
  ["intake", "acceptOrder", "validation", "the raw payload from the till"],
  ["validation", "validateOrder", "pricing", "line items against the catalog"],
  ["pricing", "priceOrder", "discount", "unit prices before discounts"],
  ["discount", "applyDiscounts", "tax", "campaign and loyalty reductions"],
  ["tax", "applyTax", "deposit", "VAT groups per line"],
  ["deposit", "addDeposits", "payment", "returnable packaging charges"],
  ["payment", "capturePayment", "tips", "the authorized amount"],
  ["tips", "splitTips", "fiscal", "gratuity across the shift"],
  ["fiscal", "signReceipt", "receipt", "the signature from the TSE"],
  ["receipt", "renderReceipt", "export", "the printable document"],
  ["export", "exportOrder", "archive", "the audit record"],
  ["archive", "archiveOrder", null, "the closed order"],
];

const HELPERS = ["normalize", "guard", "metrics", "errors", "mapping", "retry"];

rmSync(OUT, { recursive: true, force: true });

for (const [stage, fn, next, subject] of STAGES) {
  const dir = join(OUT, "src", stage);
  mkdirSync(dir, { recursive: true });
  const nextStage = STAGES.find((s) => s[0] === next);
  writeFileSync(join(dir, "index.js"), stageSource(stage, fn, subject, nextStage), "utf-8");
  for (const helper of HELPERS) writeFileSync(join(dir, `${helper}.js`), helperSource(helper, stage), "utf-8");
}

writeFileSync(
  join(OUT, "README.md"),
  `# order-service

Fixture for the routing evals. A generated pipeline: every stage lives in its own
directory and hands off to exactly one other stage, and no file anywhere states
the order of the stages. Working it out means reading them.
`,
  "utf-8",
);

const files = STAGES.length * (HELPERS.length + 1) + 1;
console.log(`Generated ${files} modules in ${OUT}`);

function cap(word) {
  return word[0].toUpperCase() + word.slice(1);
}

// Most helpers export `<helper><Stage>`; retry is the one that does not.
function helperExport(helper, S) {
  return helper === "retry" ? `withRetry${S}` : `${helper}${S}`;
}

// Every other stage name, so that grepping for one stage hits many files and
// the chain still has to be read rather than pattern-matched.
function otherStages(stage) {
  return STAGES.map((s) => s[0]).filter((s) => s !== stage);
}

function stageSource(stage, fn, subject, nextStage) {
  const S = cap(stage);
  const imports = [
    // The retry helper exports `withRetry<Stage>`, not `retry<Stage>` - importing
    // it by the pattern name left every stage module unlinkable, which made the
    // fixture unrunnable while still reading correctly.
    ...HELPERS.map((h) => `import { ${helperExport(h, S)} } from "./${h}.js";`),
    nextStage ? `import { ${nextStage[1]} } from "../${nextStage[0]}/index.js";` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${imports}

// This module owns ${subject}. Everything below it is stage-local: the handoff
// to the next stage is the last thing in the file.

const ${stage.toUpperCase()}_LIMITS = {
  maxLines: 500,
  maxQuantityPerLine: 999,
  maxTotalMinor: 100_000_00,
  maxRetries: 3,
  softTimeoutMs: 2_500,
};

const ${stage.toUpperCase()}_FEATURES = ${JSON.stringify(
    Object.fromEntries(otherStages(stage).map((other, i) => [`${other}Aware`, i % 3 === 0])),
    null,
    2,
  )};

${block(stage, "rules")}

${block(stage, "totals")}

${block(stage, "audit")}

${block(stage, "context")}

${block(stage, "diff")}

${block(stage, "batching")}

${block(stage, "policy")}

${block(stage, "serialize")}

export async function ${fn}(order, context) {
  const checked = guard${S}(order, context);
  const shaped = normalize${S}(checked);
  const violations = collect${S}Violations(shaped, context);
  if (violations.length > 0) throw errors${S}(new Error(violations.join("; ")), shaped);

  const totals = compute${S}Totals(shaped);
  const enriched = { ...shaped, totals, audit: build${S}Audit(shaped, context) };
  metrics${S}(enriched, context);

  const batches = split${S}Batches(enriched);
  const settled = batches.map((batch) => apply${S}Policy(batch, context));
  const merged = merge${S}Diff(enriched, settled);

  try {
${
  nextStage
    ? `    return await withRetry${S}(() => ${nextStage[1]}(merged, context), ${stage.toUpperCase()}_LIMITS.maxRetries);`
    : "    return serialize" + S + "(merged);"
}
  } catch (cause) {
    throw errors${S}(cause, merged);
  }
}
`;
}

// A bank of plausible stage-local logic. Each block is 30-60 lines so that a
// stage module costs something real to read.
function block(stage, kind) {
  const S = cap(stage);
  const U = stage.toUpperCase();
  const banks = {
    rules: `const ${U}_RULES = [
  { code: "empty-lines", severity: "fatal", test: (order) => (order.lines ?? []).length === 0 },
  { code: "too-many-lines", severity: "fatal", test: (order) => (order.lines ?? []).length > ${U}_LIMITS.maxLines },
  { code: "negative-quantity", severity: "fatal", test: (order) => (order.lines ?? []).some((l) => l.quantity < 0) },
  { code: "quantity-ceiling", severity: "warn", test: (order) => (order.lines ?? []).some((l) => l.quantity > ${U}_LIMITS.maxQuantityPerLine) },
  { code: "missing-sku", severity: "fatal", test: (order) => (order.lines ?? []).some((l) => !l.sku) },
  { code: "duplicate-sku", severity: "warn", test: (order) => {
      const seen = new Set();
      return (order.lines ?? []).some((l) => (seen.has(l.sku) ? true : (seen.add(l.sku), false)));
    } },
  { code: "no-currency", severity: "fatal", test: (order) => !order.currency },
  { code: "stale-order", severity: "warn", test: (order) => Number(order.openedAt ?? 0) > 0 && Date.now() - order.openedAt > 86_400_000 },
];

export function collect${S}Violations(order, context) {
  const violations = [];
  for (const rule of ${U}_RULES) {
    let failed = false;
    try {
      failed = rule.test(order);
    } catch {
      failed = true;
    }
    if (!failed) continue;
    if (rule.severity === "warn" && context?.lenient) continue;
    violations.push(\`\${rule.code}\`);
  }
  return violations;
}

export function describe${S}Rules() {
  return ${U}_RULES.map((rule) => ({ code: rule.code, severity: rule.severity }));
}`,

    totals: `export function compute${S}Totals(order) {
  const lines = order.lines ?? [];
  let net = 0;
  let gross = 0;
  let discount = 0;
  let quantity = 0;

  for (const line of lines) {
    const lineNet = Math.round(line.unitPrice * line.quantity * 100) / 100;
    const lineDiscount = Math.round((line.discountMinor ?? 0)) / 100;
    net += lineNet;
    discount += lineDiscount;
    gross += lineNet - lineDiscount + (line.taxMinor ?? 0) / 100;
    quantity += line.quantity;
  }

  return {
    lineCount: lines.length,
    quantity,
    net: round2(net),
    discount: round2(discount),
    gross: round2(gross),
    average: lines.length === 0 ? 0 : round2(net / lines.length),
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}`,

    audit: `export function build${S}Audit(order, context) {
  return {
    stage: "${stage}",
    orderId: order.id,
    tenantId: context?.tenantId ?? null,
    operator: context?.operator?.id ?? null,
    device: context?.device?.serial ?? null,
    lineCount: (order.lines ?? []).length,
    features: Object.entries(${U}_FEATURES)
      .filter(([, on]) => on)
      .map(([name]) => name),
  };
}

export function summarize${S}Audit(entries) {
  const byOperator = new Map();
  for (const entry of entries ?? []) {
    const key = entry.operator ?? "unknown";
    byOperator.set(key, (byOperator.get(key) ?? 0) + 1);
  }
  return [...byOperator.entries()].map(([operator, count]) => ({ operator, count }));
}`,

    context: `export function derive${S}Context(context) {
  return {
    tenantId: context?.tenantId ?? null,
    lenient: Boolean(context?.lenient),
    locale: context?.locale ?? "de-DE",
    timezone: context?.timezone ?? "Europe/Berlin",
    softTimeoutMs: context?.softTimeoutMs ?? ${U}_LIMITS.softTimeoutMs,
  };
}

export function assert${S}Context(context) {
  const derived = derive${S}Context(context);
  if (!derived.tenantId) throw new Error("${stage}: context carries no tenant");
  if (derived.softTimeoutMs <= 0) throw new Error("${stage}: soft timeout must be positive");
  return derived;
}`,

    diff: `export function merge${S}Diff(base, patches) {
  let merged = { ...base };
  for (const patch of patches ?? []) {
    if (!patch) continue;
    merged = {
      ...merged,
      ...patch,
      lines: mergeLines(merged.lines ?? [], patch.lines ?? []),
      totals: { ...(merged.totals ?? {}), ...(patch.totals ?? {}) },
    };
  }
  return merged;
}

function mergeLines(left, right) {
  if (right.length === 0) return left;
  const bySku = new Map(left.map((line) => [line.sku, line]));
  for (const line of right) {
    const existing = bySku.get(line.sku);
    bySku.set(line.sku, existing ? { ...existing, ...line } : line);
  }
  return [...bySku.values()];
}`,

    batching: `export function split${S}Batches(order) {
  const lines = order.lines ?? [];
  if (lines.length <= 25) return [order];

  const batches = [];
  for (let i = 0; i < lines.length; i += 25) {
    batches.push({ ...order, lines: lines.slice(i, i + 25), batchIndex: batches.length });
  }
  return batches;
}

export function joinBatches(batches) {
  return (batches ?? []).reduce(
    (acc, batch) => ({ ...batch, lines: [...(acc.lines ?? []), ...(batch.lines ?? [])] }),
    {},
  );
}`,

    policy: `const ${U}_POLICY = {
  onWarn: "continue",
  onFatal: "abort",
  onTimeout: "retry",
  onUnknown: "abort",
};

export function apply${S}Policy(batch, context) {
  const decision = ${U}_POLICY[batch?.outcome ?? "onUnknown"] ?? ${U}_POLICY.onUnknown;
  if (decision === "abort" && !context?.lenient) return null;
  return { ...batch, decision };
}

export function ${stage}PolicyFor(outcome) {
  return ${U}_POLICY[outcome] ?? ${U}_POLICY.onUnknown;
}`,

    serialize: `export function serialize${S}(order) {
  return {
    id: order.id,
    stage: "${stage}",
    currency: order.currency ?? "EUR",
    totals: order.totals ?? null,
    lines: (order.lines ?? []).map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxMinor: line.taxMinor ?? 0,
      discountMinor: line.discountMinor ?? 0,
    })),
    audit: order.audit ?? null,
  };
}

export function deserialize${S}(payload) {
  return { ...payload, lines: payload.lines ?? [], stage: "${stage}" };
}`,
  };
  return banks[kind];
}

function helperSource(helper, stage) {
  const S = cap(stage);
  const others = otherStages(stage);
  const bodies = {
    normalize: `// Shared shaping. The stages that consume this output are
// ${others.slice(0, 4).join(", ")}, so keep the field names stable.
export function normalize${S}(order) {
  const lines = (order.lines ?? []).map((line) => ({
    ...line,
    sku: String(line.sku ?? "").trim(),
    quantity: Number(line.quantity ?? 1),
    unitPrice: Math.round(Number(line.unitPrice ?? 0) * 100) / 100,
    taxMinor: Math.round(Number(line.taxMinor ?? 0)),
    discountMinor: Math.round(Number(line.discountMinor ?? 0)),
  }));
  return { ...order, lines, stage: "${stage}", currency: order.currency ?? "EUR" };
}`,
    guard: `const REQUIRED = ["id", "lines"];

// Mirrors the checks the ${others[0]} and ${others[1]} stages make on their own input.
export function guard${S}(order, context) {
  for (const field of REQUIRED) {
    if (order?.[field] == null) throw new Error(\`${stage}: missing \${field}\`);
  }
  if (context?.tenantId == null) throw new Error("${stage}: no tenant in context");
  if (!Array.isArray(order.lines)) throw new Error("${stage}: lines must be an array");
  return order;
}`,
    metrics: `let counter = 0;

// Counter names are compared against the ${others[2]} stage in dashboards.
export function metrics${S}(order, context) {
  counter += 1;
  context?.telemetry?.record?.({ stage: "${stage}", orderId: order.id, seq: counter });
  return counter;
}

export function reset${S}Metrics() {
  counter = 0;
}`,
    errors: `export function errors${S}(cause, order) {
  const error = new Error(\`${stage} failed for order \${order?.id ?? "unknown"}\`);
  error.cause = cause;
  error.stage = "${stage}";
  error.retryable = cause?.retryable ?? false;
  return error;
}

// The ${others[3]} stage unwraps these, so the shape is load-bearing.
export function unwrap${S}(error) {
  return { stage: error?.stage ?? "${stage}", retryable: Boolean(error?.retryable), cause: error?.cause ?? null };
}`,
    mapping: `// Field names as they leave ${stage}. The ${others[4]} stage reads the same keys.
const FIELDS = {
  id: "orderId",
  currency: "currencyCode",
  totals: "totalsBlock",
  audit: "auditTrail",
};

export function mapping${S}(order) {
  const out = {};
  for (const [from, to] of Object.entries(FIELDS)) out[to] = order?.[from] ?? null;
  return out;
}

export function unmapping${S}(payload) {
  const out = {};
  for (const [from, to] of Object.entries(FIELDS)) out[from] = payload?.[to] ?? null;
  return out;
}`,
    retry: `export async function withRetry${S}(operation, attempts) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      if (error?.retryable === false) break;
    }
  }
  throw last;
}`,
  };
  return `${bodies[helper]}\n`;
}
