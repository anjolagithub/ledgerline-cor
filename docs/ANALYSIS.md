# Real Historical Backtest of CortexRails' Risk Formulas

**What this is, and isn't.** This is not a liquidation-timing predictor
— that's a different, harder problem, and some competing buildathon
projects specialize in exactly that (backtested prediction models for
*when* to liquidate). This is a narrower, honest question: given the
EXACT math already live in `contracts/src/LedgerLinePolicy.sol` and
`stylus/risk-engine/src/lib.rs`, and CortexRails' actual configured
parameters, what would have happened to a borrower who opened a
full-capacity position on a given day and never touched it again,
across TSLA's real historical price volatility?

Code: `analysis/backtest.py` + `analysis/chart.py`. Reproducible --
run `python3 analysis/backtest.py` then `python3 analysis/chart.py`
from the repo root's `analysis/` directory.

## Data

Real daily TSLA closing prices, **2010-06-29 to 2024-12-31** (3,652
real trading days), split-adjusted throughout:

- `analysis/data/tsla_2010_2021.csv` -- 2010-06-29 to 2021-01-15
- `analysis/data/tsla_2021_2024.csv` -- 2021-01-04 to 2024-12-31 (NASDAQ historical data)

The small January 2021 overlap between the two files is de-duplicated
in favor of the NASDAQ-sourced series. No synthetic or simulated
prices anywhere in this dataset.

## The formulas, mirrored exactly from the live source

```
positionValue        = rawBalance * price / 1e18        (multiplier = 1.0, neutral)
borrowingCapacity     = positionValue * collateralFactorBps/1e4 * riskAdjustmentBps/1e4
liquidationThreshold  = positionValue * collateralFactorBps/1e4
isLiquidatable         = debt > liquidationThreshold      (strict inequality --
                          debt == threshold is NOT liquidatable, matching
                          stylus/risk-engine/src/lib.rs's is_liquidatable
                          and its own boundary unit tests exactly)
```

CortexRails' actual configured parameters (`docs/DEPLOYMENTS.md`):
`collateralFactorBps = 7000` (70%), `riskAdjustmentBps = 8000` (80%).

## A closed-form result, before touching any historical data at all

Combining the two formulas above algebraically (full derivation in
`analysis/backtest.py`'s `liquidation_threshold_price_ratio()`
docstring): a borrower who takes on **full capacity** debt on day 0 is
liquidatable exactly when

```
price(t) < price(0) * riskAdjustmentBps / 1e4
```

`collateralFactorBps` cancels out completely -- it does not affect
this ratio at all. **`riskAdjustmentBps` IS the liquidation buffer**,
by construction of these two formulas: with the live 80% risk
adjustment, a full-capacity borrower is liquidatable the instant the
asset falls **20% below the price at which they borrowed** -- no more,
no less, regardless of entry price. This is a real, provable property
of the deployed contracts, not an empirical observation.

## What the real historical data adds

The closed-form result above says a 20% drawdown *from your own entry
price* is the trigger. What real TSLA history adds is: **how often,
and how fast, did a 20% drawdown from an arbitrary day actually
happen?** We simulate every one of the 3,652 real trading days as a
hypothetical full-capacity borrow date and walk the remaining real
price history forward.

To avoid counting "never got liquidated" for dates too close to the
end of the dataset (where there just isn't enough future data to know),
only the 3,420 entry days with at least 500 trading days of real
subsequent history are counted in the summary below.

```json
{
  "total_entry_days_simulated": 3652,
  "entry_days_with_full_lookahead": 3420,
  "pct_that_became_liquidatable": 70.0,
  "pct_that_never_became_liquidatable": 30.0,
  "median_trading_days_to_liquidation": 72,
  "fastest_trading_days_to_liquidation": 1,
  "p10_trading_days_to_liquidation": 17,
  "liquidation_trigger_ratio": 0.8,
  "collateral_factor_bps": 7000,
  "risk_adjustment_bps": 8000
}
```

Full per-day results: `analysis/out/backtest_results.csv` (3,652 rows).
Machine-readable summary: `analysis/out/backtest_summary.json`.

**Reading this honestly:** TSLA is a famously volatile single stock.
70% of historical entry days eventually saw a 20%+ drawdown from that
day's price (median ~72 trading days, about 3.5 months, to get there;
the fastest was a single trading day). This is not a criticism of the
80% risk adjustment parameter -- it's a real, quantified statement
about the risk profile of borrowing at full capacity against a
volatile individual stock with these specific parameters, using
CortexRails' actual deployed math. An operator using CortexRails for a
less volatile asset, or configuring a smaller risk adjustment (a wider
buffer), would see a very different number -- and could know that
*before* choosing parameters, by running this same script.

## Two worked, checkable examples

**Near the November 2021 all-time high** (a realistic worst case: borrowing at the top before TSLA's ~73% 2022 drawdown):

| | |
|---|---|
| Entry date | 2021-11-04 |
| Entry price | $409.97 |
| Liquidation trigger price ($409.97 × 0.80) | $327.98 |
| Actual date price first crossed below trigger | 2021-12-13 ($322.14) |
| Trading days elapsed | 26 |

**Right before the COVID crash** (a case where the borrower survived):

| | |
|---|---|
| Entry date | 2020-01-02 |
| Entry price | $86.05 |
| Liquidation trigger price ($86.05 × 0.80) | $68.84 |
| Lowest real price reached afterward | $72.24 (2020-03-18, the COVID crash bottom) |
| Max real drawdown reached | 16.05% -- never crossed the 20% trigger |

Even TSLA's COVID-crash bottom (one of its sharpest real historical
drawdowns) fell just short of a 20% single-drawdown trigger from a
January 2020 entry point -- illustrating that the outcome genuinely
depends on the entry date's subsequent path, not just "TSLA is
volatile, therefore always liquidated."

## Charts

`analysis/out/price_history_example.png` -- the full real 2010-2024
TSLA price series with the November 2021 worked example's entry point,
trigger price, and actual liquidation date marked.

`analysis/out/days_to_liquidation_histogram.png` -- distribution of
trading-days-to-liquidation across the 2,395 historical entry days (of
3,420 with full lookahead) that eventually crossed the trigger price.

## What this deliberately does not claim

- **Not a predictor.** This does not forecast future TSLA prices or
  tell a liquidator when to act. It answers a historical
  what-if question about the live formulas' behavior.
- **Not tuned or cherry-picked.** `collateralFactorBps`/
  `riskAdjustmentBps` are CortexRails' actual configured values, not
  parameters chosen to make this analysis look good.
- **Single-asset, single-parameter-set.** Real conclusions here are
  specific to TSLA at 70%/80%. The script is written generically
  enough (`liquidation_threshold_price_ratio()`,
  `COLLATERAL_FACTOR_BPS`/`RISK_ADJUSTMENT_BPS` as top-level constants)
  that re-running it against a different asset's real price history or
  different parameters is a small edit, not a rewrite.
