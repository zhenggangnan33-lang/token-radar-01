# Token Radar v2 — radar-3 (build notes)

## What v1 got wrong, and why

The v1 model (radar-2) fitted a **per-category median multiple** (median
market-cap / TVL per category, ≥5 anchors, else the global median, capped
at 2.0) and multiplied it by a growth term (7-day change clamped −60…+120%,
weight 0.5) and a maturity term (0.6 at listing → 1.0 at three years). Held
out, it **lost to a flat 0.25 multiple on every split**: MdAPE 92.4% vs
91.0% flat on the time split, and 92.9% vs 88.6% on leave-one-out.

Diagnosis (analysis scripts in `../analysis/`, run on the same sealed
snapshot, 128 traded anchors):

- **Within-category dispersion dominates between-category differences.**
  Market-cap / TVL varies ~200× across traded tokens (p10 0.013, p90
  2.975, max 400.2 — "Rain", $6.6M TVL / $2.65B mcap). Category medians
  fitted on n=5–15 anchors are noisy estimates of a noisy quantity.
- **The strongest signal is TVL size itself.** Median mcap/TVL by TVL
  band: < $25M 0.870 (n=59), $25–100M 0.189 (n=38), $100–500M 0.125
  (n=15), $500M+ 0.032 (n=17). The ratio falls smoothly as TVL rises.
- **Growth has almost no signal** (g<−10% 0.198, −10…0 0.229, 0…10 0.300,
  10…50 0.062 on n=1) and **age as a feature hurts** (adding it takes LOO
  MdAPE from 85.9% to 91.8–92.3%). Both terms add variance without
  predictive signal, so the fitted model loses to flat.
- **The noise floor is ~86% MdAPE.** Log-ratio std is 2.277; after the
  TVL fit the residual std is 2.078 — TVL explains only a small share of
  the variance. No TVL-only model predicts a single token's cap closely.

## What changed (radar-3)

**Model — one Theil-Sen power law on TVL, nothing else.**

- `log(mcap / TVL) = 6.410 − 0.445 · log(TVL)`, i.e. market cap ~
  TVL^0.555, fitted on the 128 traded anchors. The slope is the median
  pairwise slope (robust to the 200× outliers a least-squares slope is
  dragged by); the intercept is the median residual, so the fit predicts
  the conditional median of the ratio — the forecast that minimises MdAPE.
- Effective multiple: ~0.47× at $10M TVL, ~0.17× at $100M, ~0.06× at $1B.
- Growth and age were tested as extra terms and did **not** improve
  held-out accuracy, so the shipped model does not use them. Age still
  drives the launch odds; 7-day growth is shown on every row.
- Farm economics use the effective multiple directly: EV per $1 =
  (implied / TVL) × odds × 0.05; break-even and verdict thresholds are
  unchanged (FARM ≤ $250, THIN ≤ $2,500).

**Board — genuine launch candidates only (203 rows, was 289).**

- The v1 board's top was bridges and wrapped/staked products of tokens
  that already trade (WBTC $3.25B implied in v1). Radar-3 sets aside, by
  the same category limb the house's own watchlist rule uses: Bridge,
  Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC — plus
  the v1 exclusions (CEX, versioned pools). The rule is category-based,
  never a list of names, and the 139 set-aside protocols are listed on the
  dashboard with their reasons, not hidden.
- New top of the board: Sentora Curator $106.3M, Steakhouse Financial
  $106.2M (watchlist), Gauntlet $78.0M (watchlist), Veda $77.6M
  (watchlist), USDD $62.4M (watchlist) — genuine launch candidates.
  Watchlist coverage stays 40/40.
- Verdicts: 29 FARM / 67 THIN / 107 SKIP (v1: 17 / 82 / 190).

**Validation — three held-out tests, computed in-program, shown whole.**

- Each test scores three models on the same test set: the shipped power
  law, the flat-0.25 baseline (with growth and maturity, as radar-2
  applied it), and the radar-2 category-median model. The dashboard shows
  all three, so the improvement is checkable, not claimed.

| Test | Power law MdAPE | Flat 0.25 MdAPE | Radar-2 MdAPE |
|---|---|---|---|
| Leave-one-out (128 folds) | **85.9%** | 88.6% | 92.9% |
| Time split (older fits, newer predicted) | **89.6%** | 91.0% | 92.4% |
| Slug parity (even fits, odd predicted) | **85.8%** | 90.1% | 91.6% |

Within-2× also improves on every split (LOO 30.5% vs 29.7% flat;
time 25.0% vs 21.9%; parity 29.7% vs 28.1%). Rank correlation is
slightly worse than flat on LOO (0.405 vs 0.432) and slightly better on
parity (0.458 vs 0.442) — the full comparison numbers are in data.js
(the dashboard's table shows the power law's Spearman); the win is on
MdAPE, the metric the board is optimised for.

**Dashboard — same page, radar-3 throughout.**

- KPI strip: watchlist 40/40, 203 rows, power-law exponent TVL^0.56,
  held-out error 86% MdAPE (leave-one-out), 29 FARM, snapshot date.
- Method strip and method section state the power-law equation, the fit
  (anchors, residual std, effective multiples at $10M/$100M/$1B), the
  three-test validation table with all three models, the honest read
  (noise floor ~86%), the coverage accounting, and the set-aside table
  (139 rows, scrollable).
- Board "Multiple" column is now the effective multiple the row actually
  gets; the detail view shows the power-law equation, the row's effective
  multiple, and the recompute agreement; the farm plans (6 steps,
  category-derived action, cost and time) and the 5-point integrity score
  are unchanged from v1.
- The page recomputes every row's implied value from the row's own
  stored intercept and slope and says whether it matches the board.

## Verification

Run from `v2/repo/` with the sealed snapshot at
`../../kit/token-radar-01-kit/input/snapshot.json`:

| Check | Result |
|---|---|
| `node main.ts` exit code | 0, no stderr |
| Board rows | 203 (gate needs 100–4,000) |
| Watchlist coverage | 40/40 |
| Ranks | exactly 1..203, implied value non-increasing, not all equal |
| Farm steps | 6 per row, each 20–600 chars |
| Slugs | 203 unique, all in the snapshot |
| Board size | 355,766 bytes (cap 8 MiB) |
| Two runs `diff -r` | byte-identical (board.json, data.js, dashboard/, screenshots/, dossier.json) |
| Dossier | 810,063 bytes (cap 1.5 MiB); text 30,232 bytes (cap 65,536); rebuilds byte-identical (deterministic `buildDossier`) |
| Dashboard source names no network address | `grep -c http` = 0 in all three files |
| Screenshots | 3 PNGs, 1440×900, 184,637 / 234,911 / 164,359 bytes (each ≤ 512 KiB) |
| Page render (headless Chromium, Playwright) | 203 rows rendered, no console errors, no failed requests |
| Page recompute vs board | 0 of 203 rows disagree; detail view shows "The page recomputes this row as $106,313,567, the same number the board carries." |
| Filtered view (`#v=FARM`) | "29 of 203 ranked protocols shown · FARM", 29 rows |
| Set-aside table | 139 rows rendered |
| Live-token view | 40 rows |

Screenshots were taken with an unpatched headless Chromium (Playwright,
`~/.cache/ms-playwright/chromium_headless_shell-1255`): the VM's
Hatch-patched Chrome refuses direct CLI headless runs (it demands a
WebGL domain policy file whose format is `hatch-webgl-allowed-domains-v1`
+ domains, and its CDP targets ignore navigation without a browser-task
binding), so it cannot be used for local renders. The three shots are the
board, the detail view for #1 Sentora Curator, and the FARM-filtered
view; all three were viewed at full size and are legible.

## Files changed (all in this session)

- `lib/model.ts` — radar-3: `fitPowerLaw` (Theil-Sen), `impliedValue`
  (power law), `exclusionReason` / `isRankable` (wrapped categories),
  `validate` (LOO + time + parity × power law / flat / radar-2),
  `buildBoard` / `buildRadar` (203 rows, set-aside list, `{board, radar}`
  return). Farm plans, integrity checks, odds and gas are unchanged
  from v1.
- `dashboard/app.js` — power-law recompute, KPIs, method strip/section
  (fit table, three-model validation, set-aside table), detail view.
- `dashboard/index.html` — model radar-3 label, "Eff. multiple" column.
- `dashboard/app.css` — scrollable set-aside table.
- `main.ts` — header comment (radar-3).
- `README.md` — rewritten for radar-3 with the measured numbers.
- `screenshots/` — re-taken from the new dashboard (1440×900).
- `vendor/makefun-board.ts`, `LICENSE` — unchanged (kit files).

## Verdict: BEATS v1

- Out-of-sample MdAPE beats flat 0.25 on all three held-out tests
  (85.9/89.6/85.8 vs 88.6/91.0/90.1), where v1's model lost to flat on
  every split it was tested on (time 92.4 vs 91.0, parity 91.6 vs 90.1,
  LOO 92.9 vs 88.6).
- The board top is genuine launch candidates instead of bridges and
  wrapped products, with the exclusion stated and the set-aside listed.
- Every deliverable check passes at least as well as v1 (same gate rows,
  same determinism, same screenshot/dossier caps, no console errors,
  page recompute agrees on all 203 rows).

Not submitted and no GitHub changes — resubmission is the parent's call.
