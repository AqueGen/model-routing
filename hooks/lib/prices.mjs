// No node: imports - hooks/register.mjs is a Claude Code mod and may import only relative files and claude-code.

// USD per million BASE INPUT and OUTPUT tokens, transcribed from the Anthropic
// pricing page, captured on the date below. Enumerated per model rather than
// per family for the same reason EFFORT_SUPPORT is: families span price changes
// (Opus 4.1 bills at three times Opus 4.5) and a loose pattern would quietly
// misprice a retired model. A model absent from this table is reported as
// unpriced volume, never as zero.
export const PRICES_ASOF = "2026-11-12";
// A row's optional fourth element is the long-prompt card [inRate, outRate]:
// "A request's prompt length counts all of its input tokens, including cache
// reads and cache writes. Each request is priced on its own." Above
// LONG_PROMPT tokens the request bills on that card; exactly LONG_PROMPT is
// still the base card.
export const LONG_PROMPT = 100000;
export const PRICES = [
  // Retired families first: a looser pattern below must not claim them.
  [/opus-4-1-|opus-4-20/, () => [15, 75]],
  // Pre-4.x ids put the generation first (claude-3-5-haiku-...), so both orders
  // are matched; the row above needs the same trick for claude-opus-4-20250514.
  [/3-5-haiku|haiku-3-5/, () => [0.8, 4]],
  // 5.2 and 5.1 cache reads at 0.025x base input, ahead of the looser 5.x row below.
  [/(fable|mythos)-5-2(?!\d)/, () => [8, 40, 0.025]],
  [/fable-5-1|mythos-5-1/, () => [10, 50, 0.025]],
  [/fable-5|mythos-5/, () => [10, 50]],
  // Opus 5.5 cache reads at 0.05x ($0.20/MTok), ahead of the looser opus-5 row.
  [/opus-5-5/, () => [4, 20, 0.05]],
  [/opus-5|opus-4-8|opus-4-7|opus-4-6|opus-4-5/, () => [5, 25]],
  // "Cache hits and refreshes on Claude Opus 5.5 and Claude Sonnet 5.5 are
  // priced at 0.05x the base input price": $0.10/MTok, ahead of the sonnet-5 row.
  [/sonnet-5-5/, () => [2, 10, 0.05]],
  // Permanent $2/$10: the scheduled increase to $3/$15 on 2026-09-01 was
  // called off.
  [/sonnet-5/, () => [2, 10]],
  [/sonnet-4-6|sonnet-4-5|sonnet-4-20/, () => [3, 15]],
  // $0.10/$0.50 up to LONG_PROMPT, $0.50/$2.50 above it.
  [/haiku-5-5/, () => [0.1, 0.5, CACHE_READ, [0.5, 2.5]]],
  [/haiku-4-5/, () => [1, 5]],
];
// Prompt-caching multipliers, quoted from the same page: a 5-minute cache write
// costs 1.25x base input, a 1-hour write 2x, of whichever card the request bills
// on. Cache reads are 0.1x base input for every model except where the page
// states otherwise (Fable and Mythos 5.2 and 5.1 read at 0.025x, Opus 5.5 and
// Sonnet 5.5 at 0.05x - the row's third element overrides CACHE_READ).
const CACHE_WRITE_5M = 1.25, CACHE_WRITE_1H = 2, CACHE_READ = 0.1;

// Billable input volume: everything the model read, however it was cached.
// Output is counted separately because it prices an order of magnitude higher.
export const volOf = (v) => v.in + v.cr + v.cw5 + v.cw1h;

export const isPriced = (model) => !!model && PRICES.some(([re]) => re.test(model));

// Dollars for one model's token counts, or null when the model is not on the
// price table. `at` is kept as the hook for a future dated rate; no row on
// the table uses it today. `v.long` holds the share of `v` that came from
// requests above LONG_PROMPT; a row without a long card prices all of `v` on
// its base card.
export function costOf(model, v, at) {
  const row = model ? PRICES.find(([re]) => re.test(model)) : null;
  if (!row) return null;
  const [inRate, outRate, crMul = CACHE_READ, long] = row[1](at);
  const card = (c, inR, outR) => {
    const perTok = inR / 1e6;
    return (c.in * perTok)
      + (c.cw5 * perTok * CACHE_WRITE_5M)
      + (c.cw1h * perTok * CACHE_WRITE_1H)
      + (c.cr * perTok * crMul)
      + (c.out * outR / 1e6);
  };
  if (!long || !v.long) return card(v, inRate, outRate);
  const base = Object.fromEntries(Object.keys(v.long).map((k) => [k, v[k] - v.long[k]]));
  return card(base, inRate, outRate) + card(v.long, ...long);
}
