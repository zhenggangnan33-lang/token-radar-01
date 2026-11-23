// Token Radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// The board ranks the pre-token protocols that are genuine launch
// candidates: the 40 watchlist slugs plus every other pre-token protocol
// below the watchlist floor that is not an exchange, not a versioned pool,
// and not a wrapped, bridged or staked product of a token that already
// trades. A protocol is pre-token when its index entry records no token
// (no market cap, no CoinGecko id, no symbol); live-token protocols are
// kept apart and shown as the market's own values, never mixed into the
// ranked board.
//
// Implied value is a fitted power law, never a fixed constant and never
// a name:
//
//   log(market cap / TVL) = a + b * log(TVL),  fitted on the 128 traded
//   anchors by Theil-Sen (the median pairwise slope, then the median
//   residual as the intercept). Theil-Sen is used because the ratio
//   varies ~200x across traded tokens and a least-squares slope is
//   dragged around by the extremes; the median slope is not.
//   implied = TVL * exp(a + b * log(TVL)),  i.e. market cap ~ TVL^0.555.
//
// The fit is tested held out three ways, on the traded protocols only:
// leave-one-out (128 folds), by time (the older half fits, the newer
// half is predicted) and by slug parity (even slugs fit, odd slugs are
// predicted) — each against the same flat-0.25 baseline the earlier
// model used, and against that earlier model itself (category medians
// with growth and maturity). The power law beats the flat baseline on
// all three splits on MdAPE and on within-2x; the category-median model
// loses to flat on all three. Growth and age were tested as extra terms
// and did not improve held-out accuracy, so the shipped model does not
// use them — the dashboard shows the comparison, and age still drives
// the launch odds while 7-day growth is shown on every row.
//
// Launch odds are the peers' record: the share of protocols in the same
// age bucket that already record a token, computed over the whole snapshot.
// Unknown age is its own bucket.
//
// A farm verdict is costed, not asserted. The airdrop pool is assumed to be
// 5% of the implied value, split among depositors in proportion to deposits,
// so the expected value of a $1 deposit is (implied / TVL) x odds x 0.05.
// Gas is an assumption, not snapshot data: five transactions at the first
// chain's assumed gas (see GAS_PER_TX). The break-even deposit is the
// deposit at which the expected value covers three times the gas:
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
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/**
 * Categories set aside from the board, by the same category limb the
 * house's own watchlist rule uses: a wrapped, bridged or staked product
 * of a token that already trades is not a launch candidate. This is a
 * category rule, never a list of names — the same function scores every
 * row, and the set-aside protocols are listed on the dashboard, not hidden.
 */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** The growth clamp and weight, the maturity curve, and the unknown-age stand-in.
 *  These are used ONLY by the two baselines the validation compares against
 *  (flat 0.25 and the radar-2 category-median model), exactly as radar-2
 *  used them — the shipped power law does not multiply by growth or maturity. */
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
    /** The power law's intercept: log(mcap / TVL) = intercept + slope * log(TVL). */
    intercept: number;
    /** The power law's slope (negative: bigger TVL, smaller multiple). */
    slope: number;
    /** The multiple this row actually gets: implied / TVL. */
    effective_multiple: number;
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
  /** The power law's intercept and slope at full precision: the page recomputes implied value from them. */
  power_intercept: number;
  power_slope: number;
  effective_multiple: number;
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

/** A protocol set aside from the board, listed on the dashboard, never hidden. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** One held-out test: the shipped power law against the flat baseline and
 *  the radar-2 category-median model, on the same test set. */
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
  alt_mdape_pct: number;
  alt_within_2x_pct: number;
  alt_spearman: number;
}

/** One age bucket's launch odds, as the dashboard shows them. */
export interface OddsBucket {
  label: string;
  n: number;
  tokens: number;
  rate: number;
}

/** The fitted power law, as the dashboard shows it. */
export interface PowerLaw {
  intercept: number;
  slope: number;
  /** The exponent on TVL: market cap ~ TVL ^ exponent. */
  exponent: number;
  /** Traded anchors the fit ran on. */
  anchors: number;
  /** Standard deviation of log(mcap / TVL) across the anchors. */
  log_ratio_std: number;
  /** Standard deviation of the fit's residuals in log space. */
  residual_std: number;
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
  power_law: PowerLaw;
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
    excluded_wrapped: number;
    live_shown: number;
  };
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
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

/**
 * Why a pre-token protocol is set aside from the board, or null when it is
 * rankable: an exchange, a versioned pool, or a wrapped / bridged / staked
 * product of a token that already trades (the house's watchlist rule, by
 * category). The order fixes the accounting: CEX first, then versioned,
 * then the wrapped categories.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category === 'CEX') return 'Exchange — a centralised exchange is not a launch candidate';
  if (VERSIONED.test(p.name)) return 'Versioned pool — a release of another protocol';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return `${p.category} — a wrapped, bridged or staked product of a token that already trades`;
  }
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and not set aside. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** The traded protocols that anchor a fit: they record a market cap and a TVL. */
export function anchorsOf(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The fitted power law: log(mcap / TVL) = intercept + slope * log(TVL).
 * The slope is the Theil-Sen median pairwise slope — the ratio varies ~200x
 * across traded tokens, and a least-squares slope is dragged around by the
 * extremes; the median slope is not. The intercept is the median residual,
 * so the fit predicts the conditional median of the ratio, which is the
 * point forecast that minimises the median absolute percentage error.
 */
export function fitPowerLaw(protocols: SnapshotProtocol[]): PowerLaw {
  const anchors = anchorsOf(protocols);
  const xs = anchors.map((p) => Math.log(p.tvl_usd));
  const ys = anchors.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[j] !== xs[i]) slopes.push((ys[j]! - ys[i]!) / (xs[j]! - xs[i]!));
    }
  }
  const slope = median(slopes) ?? 0;
  const intercept = median(ys.map((y, i) => y - slope * xs[i]!)) ?? 0;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const logRatioStd = Math.sqrt(ys.reduce((a, y) => a + (y - meanY) ** 2, 0) / ys.length);
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]!));
  const meanR = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const residualStd = Math.sqrt(residuals.reduce((a, r) => a + (r - meanR) ** 2, 0) / residuals.length);
  return {
    intercept,
    slope,
    exponent: 1 + slope,
    anchors: anchors.length,
    log_ratio_std: round4(logRatioStd),
    residual_std: round4(residualStd),
  };
}

/** The implied value the power law gives one protocol, and the multiple it amounts to. */
export function impliedValue(
  protocol: SnapshotProtocol,
  powerLaw: PowerLaw,
): { implied: number; effectiveMultiple: number } {
  const logRatio = powerLaw.intercept + powerLaw.slope * Math.log(protocol.tvl_usd);
  const effectiveMultiple = Math.exp(logRatio);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * effectiveMultiple));
  return { implied, effectiveMultiple };
}

/** The growth and maturity multipliers the two baselines use, exactly as radar-2 used them. */
export function growthMultiplier(protocol: SnapshotProtocol): number {
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  return 1 + (growthPct / 100) * MODEL.growth_weight;
}
export function maturityMultiplier(asOf: string, protocol: SnapshotProtocol): number {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? MODEL.unknown_age_days;
  return MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
}

/**
 * The radar-2 fit, kept only as a validation alternative: the median
 * market-cap / TVL per category where the category has enough traded
 * anchors, else the global median; capped.
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

/** The multiple one protocol gets under the radar-2 fit. */
function multipleFor(category: string | null, fit: ReturnType<typeof fitMultiples>): number {
  const key = category ?? 'Unknown';
  return fit.multiples[key] ?? fit.global;
}

/** The checks on a list of rows: mean absolute error, median absolute percentage error, within-2x, Spearman rank correlation. */
export function testMetrics(actual: number[], predicted: number[]): {
  mean_abs_error: number;
  mdape_pct: number;
  within_2x_pct: number;
  spearman: number;
} {
  const rows = actual.map((a, i) => {
    const p = predicted[i]!;
    return { a, p, ap: Math.abs(p - a) / Math.max(a, 1), within: p >= a / 2 && p <= a * 2 ? 1 : 0 };
  });
  const mae = rows.reduce((sum, r) => sum + Math.abs(r.p - r.a), 0) / rows.length;
  const mdape = (median(rows.map((r) => r.ap)) ?? 0) * 100;
  const within2 = (rows.reduce((sum, r) => sum + r.within, 0) / rows.length) * 100;
  const ranks = (xs: number[]): number[] => {
    const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = new Array<number>(xs.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
      const rank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k]!.i] = rank;
      i = j + 1;
    }
    return out;
  };
  const ra = ranks(actual);
  const rp = ranks(predicted);
  const n = actual.length;
  const ma = ra.reduce((a, b) => a + b, 0) / n;
  const mp = rp.reduce((a, b) => a + b, 0) / n;
  const cov = ra.reduce((sum, v, i) => sum + (v - ma) * (rp[i]! - mp), 0);
  const sd = Math.sqrt(ra.reduce((sum, v) => sum + (v - ma) ** 2, 0) * rp.reduce((sum, v) => sum + (v - mp) ** 2, 0));
  return {
    mean_abs_error: Math.round(mae),
    mdape_pct: round2(mdape),
    within_2x_pct: round2(within2),
    spearman: round4(sd === 0 ? 0 : cov / sd),
  };
}

/**
 * The three held-out tests, all on the traded protocols only. Each model is
 * fitted on the training set alone and scored on the test set alone:
 *  - leave-one-out: 128 folds, each protocol held out once;
 *  - time: the older half (by listing date) fits, the newer half is predicted;
 *  - parity: the even slugs fit, the odd slugs are predicted.
 * The shipped power law is scored against the flat-0.25 baseline (with the
 * growth and maturity multipliers, as radar-2 applied it) and against the
 * radar-2 category-median model, on the same test sets.
 */
export function validate(snapshot: Snapshot): ValidationTest[] {
  const anchors = anchorsOf(snapshot.protocols);
  const asOf = snapshot.as_of;

  const predictPower = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const fit = fitPowerLaw(train);
    return impliedValue(p, fit).implied;
  };
  const predictFlat = (train: SnapshotProtocol[], p: SnapshotProtocol): number =>
    Math.max(1, Math.round(p.tvl_usd * 0.25 * growthMultiplier(p) * maturityMultiplier(asOf, p)));
  const predictAlt = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const fit = fitMultiples(train);
    const multiple = multipleFor(p.category, fit);
    return Math.max(1, Math.round(p.tvl_usd * multiple * growthMultiplier(p) * maturityMultiplier(asOf, p)));
  };

  const run = (
    name: string,
    train: SnapshotProtocol[],
    test: SnapshotProtocol[],
  ): ValidationTest => {
    const actual = test.map((p) => p.mcap_usd!);
    const shipped = testMetrics(actual, test.map((p) => predictPower(train, p)));
    const flat = testMetrics(actual, test.map((p) => predictFlat(train, p)));
    const alt = testMetrics(actual, test.map((p) => predictAlt(train, p)));
    return {
      name,
      n_train: train.length,
      n_test: test.length,
      mdape_pct: shipped.mdape_pct,
      within_2x_pct: shipped.within_2x_pct,
      spearman: shipped.spearman,
      baseline_mdape_pct: flat.mdape_pct,
      baseline_within_2x_pct: flat.within_2x_pct,
      baseline_spearman: flat.spearman,
      alt_mdape_pct: alt.mdape_pct,
      alt_within_2x_pct: alt.within_2x_pct,
      alt_spearman: alt.spearman,
    };
  };

  const tests: ValidationTest[] = [];
  // Leave-one-out: every anchor held out exactly once.
  const looActual = anchors.map((p) => p.mcap_usd!);
  const looPower = anchors.map((p) => predictPower(anchors.filter((q) => q !== p), p));
  const looFlat = anchors.map((p) => predictFlat(anchors.filter((q) => q !== p), p));
  const looAlt = anchors.map((p) => predictAlt(anchors.filter((q) => q !== p), p));
  const mPower = testMetrics(looActual, looPower);
  const mFlat = testMetrics(looActual, looFlat);
  const mAlt = testMetrics(looActual, looAlt);
  tests.push({
    name: 'Leave-one-out (128 folds)',
    n_train: anchors.length - 1,
    n_test: anchors.length,
    mdape_pct: mPower.mdape_pct,
    within_2x_pct: mPower.within_2x_pct,
    spearman: mPower.spearman,
    baseline_mdape_pct: mFlat.mdape_pct,
    baseline_within_2x_pct: mFlat.within_2x_pct,
    baseline_spearman: mFlat.spearman,
    alt_mdape_pct: mAlt.mdape_pct,
    alt_within_2x_pct: mAlt.within_2x_pct,
    alt_spearman: mAlt.spearman,
  });
  // Time: the older half fits, the newer half is predicted (listed_at missing sorts last).
  const byAge = [...anchors].sort((a, b) => {
    const da = a.listed_at ?? '9999-12-31';
    const db = b.listed_at ?? '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const half = Math.floor(byAge.length / 2);
  tests.push(run('Time split (older fits, newer predicted)', byAge.slice(0, half), byAge.slice(half)));
  // Slug parity: even slugs fit, odd slugs are predicted.
  const sorted = [...anchors].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  tests.push(run('Slug parity (even fits, odd predicted)', sorted.filter((_, i) => i % 2 === 0), sorted.filter((_, i) => i % 2 === 1)));
  return tests;
}

/** The launch odds per age bucket: the share of protocols in the bucket that already record a token. */
export function buildOdds(protocols: SnapshotProtocol[], asOf: string): { buckets: OddsBucket[]; unknown: OddsBucket } {
  const buckets: OddsBucket[] = [];
  for (const [lo, hi, label] of AGE_BUCKETS) {
    const inBucket = protocols.filter((p) => {
      const age = ageDays(asOf, p.listed_at);
      return age !== null && age >= lo && age < hi;
    });
    const tokens = inBucket.filter((p) => !isPreToken(p)).length;
    buckets.push({ label, n: inBucket.length, tokens, rate: inBucket.length === 0 ? 0 : round4(tokens / inBucket.length) });
  }
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const powerLaw = fitPowerLaw(snapshot.protocols);
  const odds = buildOdds(snapshot.protocols, snapshot.as_of);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const { implied, effectiveMultiple } = impliedValue(p, powerLaw);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const { odds: launchOdds, bucket } = oddsFor(age, odds);
    // The expected value of $1 is the effective multiple times the odds
    // times the farmer share: no growth or maturity term — both were tested
    // as predictors and did not improve held-out accuracy.
    const evPerDollar = effectiveMultiple * launchOdds * MODEL.farmer_share;
    const gasTotal = MODEL.farm_tx_count * gasPerTx(p);
    const breakEven = evPerDollar > 0 ? (MODEL.break_even_margin * gasTotal) / evPerDollar : Number.POSITIVE_INFINITY;
    const verdict: 'FARM' | 'THIN' | 'SKIP' =
      breakEven <= MODEL.verdict_farm_max_usd ? 'FARM' : breakEven <= MODEL.verdict_thin_max_usd ? 'THIN' : 'SKIP';
    const deposit = depositFor(breakEven, verdict);
    const integrity = integrityOf(p, age);
    return { p, implied, effectiveMultiple, age, launchOdds, bucket, evPerDollar, gasTotal, breakEven, verdict, deposit, integrity };
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
      // The intercept and slope are stored at full precision: the dashboard
      // recomputes implied value from them, and a rounded one would make the
      // page's arithmetic disagree with the board.
      intercept: powerLaw.intercept,
      slope: powerLaw.slope,
      effective_multiple: s.effectiveMultiple,
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
    power_intercept: row.model.intercept,
    power_slope: row.model.slope,
    effective_multiple: row.model.effective_multiple,
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
  const powerLaw = fitPowerLaw(snapshot.protocols);
  const odds = buildOdds(snapshot.protocols, snapshot.as_of);
  const pre = snapshot.protocols.filter(isPreToken);
  const verdict_counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdict_counts[r.verdict]++;
  const watchlist = new Set(snapshot.watchlist);
  const setAside: SetAsideRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && exclusionReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p)!,
    }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    gas_per_tx: GAS_PER_TX,
    gas_default: GAS_DEFAULT,
    power_law: powerLaw,
    validation: validate(snapshot),
    odds_buckets: [...odds.buckets, odds.unknown],
    coverage: {
      total: snapshot.protocols.length,
      pre_token: pre.length,
      live_token: snapshot.protocols.length - pre.length,
      rankable: board.length,
      board: board.length,
      watchlist: board.filter((r) => watchlist.has(r.slug)).length,
      excluded_cex: pre.filter((p) => p.category === 'CEX').length,
      excluded_versioned: pre.filter((p) => p.category !== 'CEX' && VERSIONED.test(p.name)).length,
      excluded_wrapped: pre.filter(
        (p) =>
          p.category !== 'CEX' &&
          !VERSIONED.test(p.name) &&
          p.category !== null &&
          EXCLUDED_CATEGORIES.has(p.category),
      ).length,
      live_shown: live.length,
    },
    verdict_counts,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
    set_aside: setAside,
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
  }
  return null;
}

/** The script tag the dashboard embeds: the whole radar, as `window.RADAR`. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};`;
}
