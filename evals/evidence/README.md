# Evidence

Every number quoted in [`../README.md`](../README.md) and in the repository
README comes from one of these files. They are here because the traces they were
distilled from are gitignored, and a reader who cannot rerun a stochastic model
against the same historical sample would otherwise have to take the tables on
trust.

| File | What it backs |
| --- | --- |
| `small-case-opus.json` | `delegates-codebase-question`: the 3/3 against 0/3 delegation split, and the first per-tier cost table |
| `wide-case-sonnet-pin-and-baseline.json` | `traces-a-flow-end-to-end`, no-plugin and shipped-pin arms - the $1.359 and $1.675 rows, and the 74k/451k/6k subagent token counts everything downstream is repriced from |
| `wide-case-haiku-pin.json` | the same case with `agents/scout.md` edited to `model: haiku` - the $1.239 row |
| `quality-case-sonnet.json` | `subagent-answer-quality` at sonnet: 12/12 |
| `quality-case-haiku.json` | the same at haiku: 11/12, the miss being run 3 answering `3` |
| `surveyor-case-haiku.json` | `surveyor-traces-the-chain` on the shipped haiku pin: 3/3 at $0.156 |
| `small-case-opus55-old-anchor.json` | `delegates-codebase-question` on Opus 5.5, Claude Code 2.1.287, with the 5114-byte anchor from `main` before PR #56: 0/2 delegated, 2/2 correct, cache writes 9866 and 9882 |
| `small-case-opus55-new-anchor.json` | the same case and CLI with the 3225-byte anchor from PR #56: 0/2 delegated, 2/2 correct, cache writes 9254 and 9228 - the ~630-token anchor saving the README quotes |
| `small-case-opus55-no-nudge-anchor.json` | `answers-codebase-question-inline` on Opus 5.5, Claude Code 2.1.330, with the 2021-byte 0.17 anchor, plugin arm: 2/2 stayed in the main session, 2/2 correct, $0.116 per run |
| `small-case-opus55-baseline.json` | the same case and CLI, no-plugin arm: 2/2 stayed in the main session, 2/2 correct, $0.099 per run |
| `wide-case-opus55-no-nudge-anchor.json` | `traces-a-flow-end-to-end` on Opus 5.5, Claude Code 2.1.330, with the 2021-byte 0.17 anchor, plugin arm: 2/2 stayed in the main session, 2/2 correct, $2.119 per run |
| `wide-case-opus55-baseline.json` | the same case and CLI; its no-plugin arm is the $2.094 baseline (2/2 inline, 2/2 correct). Its plugin arm ran while the 0.17 anchor was still being edited - use the file above for that arm |
| `implementer-multi-sonnet.json` | `implementer-multi-file`, 0.17 implementer (sonnet/medium, context cap), Claude Code 2.1.330: 3/3 hidden tests, $0.239 / $0.190 / $0.198 |
| `implementer-multi-opus.json` | the same case with `--model opus`, PR #63 checkout: 3/3 hidden tests, $0.457 / $0.458 / $0.421 |
| `implementer-single-sonnet-capped.json` | `implementer-single-file`, 0.17 implementer: 3/3 hidden tests, $0.110 mean |
| `implementer-single-sonnet-uncapped.json` | the same case, PR #63 checkout (no context cap): 3/3 hidden tests, $0.106 mean |
| `reviewer-opus55-medium.json` | `reviewer-seeded-bugs`, 0.17 reviewer (opus/medium): 12/12 bugs, $0.376 (cold cache) / $0.157 / $0.162 |
| `reviewer-opus55-high.json` | the same case, PR #63 checkout (opus/high): 12/12 bugs, $0.153 / $0.156 / $0.141 |
| `plugin-details.txt` | the always-on token cost, with the Claude Code version that produced it |

Each aggregate carries per-run cost, per-model usage, and every grader verdict,
so the published means can be recomputed rather than believed. What they cannot
give you is the raw transcripts - those stay local, both for size and because
they contain absolute paths from the machine that ran them.

## The one thing worth checking yourself

The quality case rests on two claims about what the fixture does at runtime, and
the fixture is generated, so you can verify them in seconds rather than trusting
a reading of it:

```sh
node evals/fixtures/order-service.gen.mjs
node --input-type=module -e "
const base='file://$PWD/evals/fixtures/order-service/src/';
const {withRetryIntake}=await import(base+'intake/retry.js');
const {errorsValidation}=await import(base+'validation/errors.js');
let calls=0;
try { await withRetryIntake(async()=>{calls++; throw errorsValidation(new Error('x'),{id:'o'})},3) } catch {}
console.log('calls with a non-retryable error:', calls);
const tax=await import(base+'tax/index.js');
console.log('applyTaxPolicy warn/strict:', tax.applyTaxPolicy({outcome:'warn'},{lenient:false}));
"
```

It prints `1` and `null`. Both were asserted from reading the code first, and an
earlier version of the generator emitted a fixture that could not link at all -
`import { retryIntake }` against `export withRetryIntake` - so the assertions
were true of code that never ran. Executing them is the only version of that
check worth having.
