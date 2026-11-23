# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zhenggangnan33-lang/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zhenggangnan33-lang/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's "Build the best token launch radar"
bounty, $1,325 in USDC. It ranks the pre-token protocols in the sealed
snapshot that are genuine launch candidates — all 40 watchlist slugs plus
the 163 other rankable pre-token protocols — by what a launch would be
worth, and costs every farm plan before it recommends one. Built by an AI
agent.

## What it does

`node main.ts` reads the sealed snapshot (`/input/snapshot.json`), scores
every rankable pre-token protocol, and writes `/output/board.json`,
`/output/data.js`, the static dashboard (`/output/dashboard/`), three
screenshots and `/output/dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## The model (radar-3)

Implied value is a power law on TVL, fitted from the snapshot itself, never
from a fixed constant and never from a name:

- **Power law** — log(market cap / TVL) = 6.410 − 0.445 · log(TVL), so
  market cap ~ TVL^0.555. The slope is the Theil-Sen median pairwise slope
  over the 128 traded protocols, and the intercept is the median residual,
  so the fit predicts the conditional median of the ratio — the forecast
  that minimises the median absolute percentage error. Theil-Sen is used
  because the ratio varies ~200× across traded tokens and a least-squares
  slope is dragged around by the extremes; the median slope is not. The
  multiple therefore falls as TVL rises: about 0.47× at $10M TVL, 0.17× at
  $100M, 0.06× at $1B.
- **Implied value** — TVL × exp(6.410 − 0.445 · log TVL).

**Launch odds** are the peers' record: the share of protocols in the same
age bucket that already record a token (30% under 90 days, 84% past four
years).

**Farm verdicts** are costed. The airdrop pool is assumed to be 5% of the
implied value, split among depositors in proportion to deposits, so a $1
deposit expects (implied / TVL) × odds × 0.05. Gas is an assumption, not
snapshot data (Ethereum $6/tx, Solana $0.05, Base $0.30, and so on; five
transactions a plan). The break-even deposit is where the expected value
covers three times the gas: FARM at or below $250, THIN at or below $2,500,
SKIP above. On this snapshot that gives 29 FARM, 67 THIN and 107 SKIP.

**Held out three ways.** The fit is tested on the traded protocols only:
leave-one-out (128 folds), by time (older half fits, newer half predicted)
and by slug parity (even slugs fit, odd slugs predicted) — each against the
same flat-0.25 baseline and against the radar-2 category-median model. The
power law beats flat on all three splits: leave-one-out 85.9% vs 88.6%
MdAPE, time 89.6% vs 91.0%, parity 85.8% vs 90.1%; the category-median
model loses to flat on all three (92.9%, 92.4%, 91.6%). Growth and age
were tested as extra terms and did not improve held-out accuracy, so the
shipped model does not use them; age still drives the launch odds, and
7-day growth is shown on every row. The dashboard shows the full result.

**The honest read.** The fitted model is better than flat, but the noise
floor is ~86% MdAPE — no model that only sees TVL predicts a single
token's market cap closely. The board is a ranking of launch candidates by
implied value, not a price forecast, and the farm verdicts are costed
against that ranking, not against a promised return.

**Coverage.** 758 protocols in the snapshot: 342 pre-token, 416 live-token.
The board ranks 203 genuine launch candidates. Set aside, not hidden: 86
wrapped, bridged or staked products of tokens that already trade, 42
pre-token exchanges and 11 versioned pools — every one of them listed on
the dashboard with its reason. All 40 watchlist slugs are ranked.

## Files

- `main.ts` — the entry point; reads the snapshot, writes the board, the
  data script, the dashboard, the screenshots and the dossier.
- `lib/model.ts` — the radar-3 model: Theil-Sen power law, three held-out
  validation tests, launch odds, costed farm verdicts, integrity scores,
  the board builder.
- `vendor/makefun-board.ts` — make.fun's dashboard-dossier library, copied
  unchanged from the kit.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No
  network; every byte it shows is in `data.js`.
- `screenshots/` — the board, a detail view and a filtered view.

Implied value is this entry's own estimate of what a launch would be worth.
It is not a price, a prediction of a listing, or investment advice.
