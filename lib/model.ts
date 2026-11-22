// Token Radar, model radar-2: one sealed snapshot in, one ranked board out.
//
// The board ranks every pre-token protocol the snapshot can rank: the 40
// watchlist slugs plus every other pre-token protocol below the watchlist
// floor that is not an exchange and not a versioned pool. A protocol is
// pre-token when its index entry records no token (no market cap, no
// CoinGecko id, no symbol); live-token protocols are kept apart and shown as
// the market's own values, never mixed into the ranked board.
//
// Implied value is fitted from the snapshot itself, never from a fixed
// constant and never from a name:
//
//   multiple   = the median market-cap / TVL of the traded protocols in the
//                same category (at least 5 of them), else the median over
//                all traded protocols; capped at 2.0
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365)
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The fit is tested held out twice, on the traded protocols only: once by
// time (the older half fits, the newer half is predicted) and once by slug
// parity (even slugs fit, odd slugs are predicted). The test predicts traded
// market caps, and it is reported in full on the dashboard, including the
// flat-0.25 baseline for comparison. The honest reading, which the dashboard
// states: market-cap / TVL varies about 200x across traded tokens (10th
// percentile 0.013, 90th 2.975), so no TVL multiple predicts a single token's
// cap closely; the fitted multiple is a conservative central anchor for the
// category, and the board ranks launch value, not a price.
//
// Launch odds are the peers' record: the share of protocols in the same age
// bucket that already record a token, computed over the whole snapshot.
// Unknown age is its own bucket.
//
// A farm verdict is costed, not asserted. The airdrop pool is assumed to be
// 5% of the implied value, split among depositors in proportion to deposits,
// so the expected value of a $1 deposit is multiple x growthMult x maturity
// x odds x 0.05. Gas is an assumption, not snapshot data: five transactions
// at the first chain's assumed gas (see GAS_PER_TX). The break-even deposit
// is the deposit at which the expected value covers three times the gas:
// FARM when it is at most $250, THIN when it is at most $2,500, SKIP above
// that. The farm plan's deposit is the break-even deposit rounded up to the
// next $10, within $50..$250 for FARM rows.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** The growth clamp and weight, the maturity curve, and the unknown-age stand-in. */
export const MODEL = {
  growth_floor: -60,
  growth_cap: 120,
  growth_weight: 0.5,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  /** A category multiple needs this many traded anchors; fewer falls back to the global median. */
  min_category_anchors: 5,
  /** No fitted multiple is trusted above this: a thin category's median can be an outlier. */
  multiple_cap: 2.0,
  /** The share of the implied value assumed to reach farmers, split pro rata by deposit. */
  farmer_share: 0.05,
  /** Transactions a farm plan makes: set up, two weekly actions, a check, a claim. */
  farm_tx_count: 5,
  /** Break-even deposit at or below this is a FARM verdict. */
  verdict_farm_max_usd: 250,
  /** Break-even deposit at or below this is a THIN verdict; above it, SKIP. */
  verdict_thin_max_usd: 2500,
  /** The margin the break-even deposit demands over the gas it must cover. */
  break_even_margin: 3,
};

/** Assumed gas per transaction on the first chain named, in USDC. An assumption, not snapshot data. */
export const GAS_PER_TX: Record<string, number> = {
  Ethereum: 6,
  Bitcoin: 8,
  Solana: 0.05,
  Base: 0.3,
  Arbitrum: 0.3,
  Optimism: 0.3,
  Binance: 0.2,
  Polygon: 0.1,
  Avalanche: 0.5,
  Sui: 0.05,
};
/** Gas per transaction on a chain the table does not name. */
export const GAS_DEFAULT = 1.0;

/** The age buckets the launch odds are read from, in days. */
export const AGE_BUCKETS: Array<[number, number, string]> = [
  [0, 90, '0-90 days'],
  [90, 180, '90-180 days'],
  [180, 365, '180-365 days'],
  [365, 730, '1-2 years'],
  [730, 1500, '2-4 years'],
  [1500, Number.POSITIVE_INFINITY, '4+ years'],
];

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  launch_odds: number;
  odds_bucket: string;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  break_even_deposit_usd: number;
  expected_value_per_100_usd: number;
  farm_gas_total_usd: number;
  farm_deposit_usd: number;
  integrity_score: number;
  integrity_flags: string[];
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_odds: number;
  odds_bucket: string;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  break_even_deposit_usd: number;
  expected_value_per_100_usd: number;
  farm_gas_total_usd: number;
  farm_deposit_usd: number;
  integrity_score: number;
  integrity_flags: string[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One held-out test: the fitted multiples against the flat baseline, same test set. */
export interface ValidationTest {
  name: string;
  n_train: number;
  n_test: number;
  mdape_pct: number;
  within_2x_pct: number;
  spearman: number;
  baseline_mdape_pct: number;
  baseline_within_2x_pct: number;
  baseline_spearman: number;
}

/** One age bucket's launch odds, as the dashboard shows them. */
export interface OddsBucket {
  label: string;
  n: number;
  tokens: number;
  rate: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: typeof MODEL;
  gas_per_tx: Record<string, number>;
  gas_default: number;
  global_multiple: number;
  multiples: Record<string, number>;
  multiples_n: Record<string, number>;
  validation: ValidationTest[];
  odds_buckets: OddsBucket[];
  coverage: {
    total: number;
    pre_token: number;
    live_token: number;
    rankable: number;
    board: number;
    watchlist: number;
    excluded_cex: number;
    excluded_versioned: number;
    live_shown: number;
  };
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list; null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The traded protocols that anchor a fit: they record a market cap and a TVL. */
export function anchorsOf(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The fitted multiples: the median market-cap / TVL per category where the
 * category has enough traded anchors, else the global median; capped.
 * Returns the global median, the per-category multiples, and each category's
 * anchor count, so the dashboard can show the fit, not just use it.
 */
export function fitMultiples(protocols: SnapshotProtocol[]): {
  global: number;
  multiples: Record<string, number>;
  counts: Record<string, number>;
} {
  const anchors = anchorsOf(protocols);
  const global = median(anchors.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of anchors) {
    const key = p.category ?? 'Unknown';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const multiples: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [category, values] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    counts[category] = values.length;
    const med = median(values) ?? global;
    multiples[category] = values.length >= MODEL.min_category_anchors ? Math.min(MODEL.multiple_cap, med) : Math.min(MODEL.multiple_cap, global);
  }
  return { global: round4(Math.min(MODEL.multiple_cap, global)), multiples, counts };
}

/** The multiple one protocol gets: its category's fitted multiple, else the global one. */
function multipleFor(category: string | null, fit: ReturnType<typeof fitMultiples>): number {
  const key = category ?? 'Unknown';
  return fit.multiples[key] ?? fit.global;
}

/** The growth and maturity multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturityMult = MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/**
 * The launch-odds table, fitted from the snapshot: for each age bucket, the
 * protocols whose age falls in it and the share of them that record a token.
 * `asOf` is the snapshot date; the unknown-age bucket is computed separately.
 */
export function buildOdds(protocols: SnapshotProtocol[], asOf: string): { buckets: OddsBucket[]; unknown: OddsBucket } {
  const buckets: OddsBucket[] = AGE_BUCKETS.map(([lo, hi, label]) => {
    const inBucket = protocols.filter((p) => {
      const a = ageDays(asOf, p.listed_at);
      return a !== null && a >= lo && a < hi;
    });
    const tokens = inBucket.filter((p) => !isPreToken(p)).length;
    return { label, n: inBucket.length, tokens, rate: inBucket.length === 0 ? 0 : round4(tokens / inBucket.length) };
  });
  const unknownIn = protocols.filter((p) => ageDays(asOf, p.listed_at) === null);
  const unknownTokens = unknownIn.filter((p) => !isPreToken(p)).length;
  const unknown: OddsBucket = {
    label: 'Age unknown',
    n: unknownIn.length,
    tokens: unknownTokens,
    rate: unknownIn.length === 0 ? 0 : round4(unknownTokens / unknownIn.length),
  };
  return { buckets, unknown };
}

/** One protocol's launch odds and the bucket they came from. */
function oddsFor(age: number | null, odds: { buckets: OddsBucket[]; unknown: OddsBucket }): { odds: number; bucket: string } {
  if (age === null) return { odds: odds.unknown.rate, bucket: odds.unknown.label };
  for (let i = 0; i < AGE_BUCKETS.length; i++) {
    const [lo, hi] = AGE_BUCKETS[i]!;
    if (age >= lo && age < hi) return { odds: odds.buckets[i]!.rate, bucket: odds.buckets[i]!.label };
  }
  return { odds: odds.unknown.rate, bucket: odds.unknown.label };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Assumed gas for one transaction on a protocol's first chain. */
function gasPerTx(p: SnapshotProtocol): number {
  return GAS_PER_TX[chainOf(p)] ?? GAS_DEFAULT;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** How much capital one farm position needs, from the break-even deposit. */
function depositFor(breakEven: number, verdict: 'FARM' | 'THIN' | 'SKIP'): number {
  if (verdict === 'FARM') return Math.min(250, Math.max(50, Math.ceil(breakEven / 10) * 10));
  if (verdict === 'THIN') return 250;
  return 50;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, age)
 * and the costed verdict (gas, deposit, break-even), never from a hand-written
 * list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, gasTotal: number, deposit: number, verdict: 'FARM' | 'THIN' | 'SKIP', breakEven: number): FarmStep[] {
  const chain = chainOf(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, deposit, chain);
  const verdictLine =
    verdict === 'FARM'
      ? `This position breaks even from a $${deposit} deposit: the expected value covers three times the gas.`
      : verdict === 'THIN'
        ? `This position only breaks even from about $${Math.round(breakEven)}: at $${deposit} it is thin, so size it up or skip it.`
        : `This position needs about $${Math.round(breakEven)} to break even, far above a $${deposit} farm: skip it unless you were going to use the protocol anyway.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${deposit} of capital and about $${gasTotal.toFixed(2)} of gas across the plan`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gasPerTx(p).toFixed(2)} of gas a week on ${chain}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${deposit} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `${verdictLine} Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The five data-quality checks: each flag names a figure the board could not trust. */
export function integrityOf(p: SnapshotProtocol, age: number | null): { score: number; flags: string[] } {
  const flags: string[] = [];
  if (p.change_7d === null) flags.push('7d change missing');
  if (age === null) flags.push('age unknown');
  if (p.chains.length < 2) flags.push('single chain');
  if (p.tvl_usd < 10_000_000) flags.push('TVL under $10M');
  if (p.change_7d !== null && Math.abs(p.change_7d) > 100) flags.push('7d change over 100%');
  return { score: 5 - flags.length, flags };
}

/** Spearman's rank correlation between two lists of numbers, same length. */
function spearman(xs: number[], ys: number[]): number {
  const rankOf = (a: number[]): number[] => {
    const order = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
    const ranks = new Array<number>(a.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k]![1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

/** One held-out test on a train/test split of the traded anchors. */
function runValidation(
  name: string,
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  asOf: string,
): ValidationTest {
  const fit = fitMultiples(train);
  const predict = (p: SnapshotProtocol, multiple: number): number => impliedValue(p, asOf, multiple).implied;
  const flat = (p: SnapshotProtocol): number => predict(p, 0.25);
  const fitted = test.map((p) => predict(p, multipleFor(p.category, fit)));
  const baseline = test.map(flat);
  const actual = test.map((p) => p.mcap_usd!);
  const mdape = (preds: number[]): number => {
    const errs = actual.map((a, i) => Math.abs(preds[i]! - a) / a);
    return (median(errs) ?? 0) * 100;
  };
  const within2x = (preds: number[]): number => {
    let n = 0;
    for (let i = 0; i < actual.length; i++) if (preds[i]! >= actual[i]! / 2 && preds[i]! <= actual[i]! * 2) n++;
    return actual.length === 0 ? 0 : (n / actual.length) * 100;
  };
  return {
    name,
    n_train: train.length,
    n_test: test.length,
    mdape_pct: round2(mdape(fitted)),
    within_2x_pct: round2(within2x(fitted)),
    spearman: round4(spearman(fitted, actual)),
    baseline_mdape_pct: round2(mdape(baseline)),
    baseline_within_2x_pct: round2(within2x(baseline)),
    baseline_spearman: round4(spearman(baseline, actual)),
  };
}

/** Both held-out tests: by time and by slug parity, on the traded anchors. */
export function validate(snapshot: Snapshot): ValidationTest[] {
  const anchors = anchorsOf(snapshot.protocols);
  const byTime = [...anchors].sort((a, b) => {
    const la = a.listed_at ?? '9999-99-99';
    const lb = b.listed_at ?? '9999-99-99';
    return la < lb ? -1 : la > lb ? 1 : a.slug < b.slug ? -1 : 1;
  });
  const half = Math.floor(byTime.length / 2);
  const timeTest = runValidation('By time (older half fits, newer half predicted)', byTime.slice(0, half), byTime.slice(half), snapshot.as_of);
  const bySlug = [...anchors].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const parityTest = runValidation(
    'By slug parity (even slugs fit, odd slugs predicted)',
    bySlug.filter((_, i) => i % 2 === 0),
    bySlug.filter((_, i) => i % 2 === 1),
    snapshot.as_of,
  );
  return [timeTest, parityTest];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const fit = fitMultiples(snapshot.protocols);
  const odds = buildOdds(snapshot.protocols, snapshot.as_of);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const multiple = multipleFor(p.category, fit);
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, multiple);
    const { odds: launchOdds, bucket } = oddsFor(age, odds);
    const evPerDollar = multiple * growthMult * maturityMult * launchOdds * MODEL.farmer_share;
    const gasTotal = MODEL.farm_tx_count * gasPerTx(p);
    const breakEven = evPerDollar > 0 ? (MODEL.break_even_margin * gasTotal) / evPerDollar : Number.POSITIVE_INFINITY;
    const verdict: 'FARM' | 'THIN' | 'SKIP' =
      breakEven <= MODEL.verdict_farm_max_usd ? 'FARM' : breakEven <= MODEL.verdict_thin_max_usd ? 'THIN' : 'SKIP';
    const deposit = depositFor(breakEven, verdict);
    const integrity = integrityOf(p, age);
    return { p, multiple, implied, growthPct, growthMult, maturityMult, age, launchOdds, bucket, evPerDollar, gasTotal, breakEven, verdict, deposit, integrity };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // The multiple is stored at full precision, like the multipliers below:
      // the dashboard recomputes implied value from these three numbers, and
      // a rounded one would make the page's arithmetic disagree with the board.
      multiple: s.multiple,
      growth_pct: round4(s.growthPct),
      // The multipliers are stored at full precision, not rounded: the
      // dashboard recomputes implied value from them, and a rounded
      // multiplier would make the page's arithmetic disagree with the board.
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      age_days: s.age,
    },
    launch_odds: round4(s.launchOdds),
    odds_bucket: s.bucket,
    verdict: s.verdict,
    break_even_deposit_usd: Number.isFinite(s.breakEven) ? Math.round(s.breakEven) : -1,
    expected_value_per_100_usd: round2(s.evPerDollar * 100),
    farm_gas_total_usd: round2(s.gasTotal),
    farm_deposit_usd: s.deposit,
    integrity_score: s.integrity.score,
    integrity_flags: s.integrity.flags,
    farm_steps: farmSteps(s.p, s.age, s.gasTotal, s.deposit, s.verdict, s.breakEven).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: watchlist.has(row.slug),
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    launch_odds: row.launch_odds,
    odds_bucket: row.odds_bucket,
    verdict: row.verdict,
    break_even_deposit_usd: row.break_even_deposit_usd,
    expected_value_per_100_usd: row.expected_value_per_100_usd,
    farm_gas_total_usd: row.farm_gas_total_usd,
    farm_deposit_usd: row.farm_deposit_usd,
    integrity_score: row.integrity_score,
    integrity_flags: row.integrity_flags,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const fit = fitMultiples(snapshot.protocols);
  const odds = buildOdds(snapshot.protocols, snapshot.as_of);
  const pre = snapshot.protocols.filter(isPreToken);
  const verdict_counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdict_counts[r.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    gas_per_tx: GAS_PER_TX,
    gas_default: GAS_DEFAULT,
    global_multiple: fit.global,
    multiples: fit.multiples,
    multiples_n: fit.counts,
    validation: validate(snapshot),
    odds_buckets: [...odds.buckets, odds.unknown],
    coverage: {
      total: snapshot.protocols.length,
      pre_token: pre.length,
      live_token: snapshot.protocols.length - pre.length,
      rankable: board.length,
      board: board.length,
      watchlist: snapshot.watchlist.length,
      excluded_cex: pre.filter((p) => p.category === 'CEX').length,
      excluded_versioned: pre.filter((p) => p.category !== 'CEX' && VERSIONED.test(p.name)).length,
      live_shown: live.length,
    },
    verdict_counts,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
