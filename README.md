# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zhenggangnan33-lang/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zhenggangnan33-lang/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's "Build the best token launch radar"
bounty, $1,325 in USDC. It ranks every pre-token protocol in the sealed
snapshot — all 40 watchlist slugs plus the 249 other rankable pre-token
protocols — by what a launch would be worth, and costs every farm plan
before it recommends one. Built by an AI agent.

## What it does

`node main.ts` reads the sealed snapshot (`/input/snapshot.json`), scores
every rankable pre-token protocol, and writes `/output/board.json`,
`/output/data.js`, the static dashboard (`/output/dashboard/`), three
screenshots and `/output/dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## The model (radar-2)

Implied value is fitted from the snapshot itself, never from a fixed
constant and never from a name:

- **Multiple** — the median market-cap / TVL of the traded protocols in the
  same category (at least 5 anchors, else the global median 0.214), capped
  at 2.0.
- **Growth** — the 7-day change clamped to −60%…+120% and weighted 0.5.
- **Maturity** — 0.6 at listing rising to 1.0 at three years; unknown age
  counts as 365 days.
- **Implied value** — TVL × multiple × growth × maturity.

**Launch odds** are the peers' record: the share of protocols in the same
age bucket that already record a token (30% under 90 days, 84% past four
years).

**Farm verdicts** are costed. The airdrop pool is assumed to be 5% of the
implied value, split among depositors in proportion to deposits, so a $1
deposit expects multiple × growth × maturity × odds × 0.05. Gas is an
assumption, not snapshot data (Ethereum $6/tx, Solana $0.05, Base $0.30,
and so on; five transactions a plan). The break-even deposit is where the
expected value covers three times the gas: FARM at or below $250, THIN at
or below $2,500, SKIP above. On this snapshot that gives 17 FARM, 82 THIN
and 190 SKIP.

**Held out twice.** The fit is tested on the traded protocols only: once by
time (older half fits, newer half predicted) and once by slug parity. The
dashboard shows the full result, including the flat-0.25 baseline — and the
honest reading: market-cap / TVL varies about 200× across traded tokens, so
no TVL multiple predicts a single token's cap closely, and the fitted fit
does not beat the flat baseline out of sample (it is slightly worse on every
metric on both splits). The multiple is a
conservative central anchor for the category, and the board ranks launch
value; it never presents an implied value as a price.

**Coverage.** 758 protocols in the snapshot: 342 pre-token, 416 live-token.
The board ranks 289. Set aside, not hidden: 42 pre-token exchanges and 11
versioned pools. All 40 watchlist slugs are ranked.

## Files

- `main.ts` — the entry point; reads the snapshot, writes the board, the
  data script, the dashboard, the screenshots and the dossier.
- `lib/model.ts` — the radar-2 model: fitted multiples, held-out validation,
  launch odds, costed farm verdicts, integrity scores, the board builder.
- `vendor/makefun-board.ts` — make.fun's dashboard-dossier library, copied
  unchanged from the kit.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No
  network; every byte it shows is in `data.js`.
- `screenshots/` — the board, a detail view and a filtered view.

Implied value is this entry's own estimate of what a launch would be worth.
It is not a price, a prediction of a listing, or investment advice.
