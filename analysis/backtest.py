#!/usr/bin/env python3
"""
Historical stress test of CortexRails' real, deployed risk formulas
against real TSLA daily price history (2010-06-29 -- 2024-12-31).

This is NOT a liquidation-timing predictor (that's a different, harder
problem some competing projects specialize in). It is a straightforward,
honest question: given the EXACT math already live in
contracts/src/LedgerLinePolicy.sol and stylus/risk-engine/src/lib.rs,
and CortexRails' actual configured parameters (collateralFactorBps=7000,
riskAdjustmentBps=8000), what would have happened to a borrower who
opened a full-capacity position on a given day and never touched it
again, across TSLA's real historical volatility?

Formulas mirrored exactly (see docs/ANALYSIS.md for the full derivation
and citations into the real source):
    positionValue          = rawBalance * price / 1e18      (multiplier = 1.0, neutral)
    borrowingCapacity       = positionValue * collateralFactorBps/1e4 * riskAdjustmentBps/1e4
    liquidationThreshold    = positionValue * collateralFactorBps/1e4
    isLiquidatable          = debt > liquidationThreshold      (strict; matches
                              stylus/risk-engine/src/lib.rs's is_liquidatable exactly,
                              including the boundary: debt == threshold is NOT liquidatable)

Data sources (real, not synthetic -- see docs/ANALYSIS.md):
    analysis/data/tsla_2010_2021.csv  -- split-adjusted daily OHLC, 2010-06-29 to 2021-01-15
    analysis/data/tsla_2021_2024.csv  -- NASDAQ historical daily data, 2021-01-04 to 2024-12-31
Overlap in Jan 2021 is de-duplicated (2021-2024 file wins, it's the
more authoritative NASDAQ-sourced series for that range).
"""
import csv
import json
import re
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
OUT_DIR = Path(__file__).parent / "out"
OUT_DIR.mkdir(exist_ok=True)

COLLATERAL_FACTOR_BPS = 7000  # 70%, matches docs/DEPLOYMENTS.md's "Configuration at deploy time"
RISK_ADJUSTMENT_BPS = 8000    # 80%, matches docs/DEPLOYMENTS.md's "Configuration at deploy time"


def load_2010_2021():
    rows = []
    with open(DATA_DIR / "tsla_2010_2021.csv") as f:
        for row in csv.DictReader(f):
            date = datetime.strptime(row["Date"], "%Y-%m-%d").date()
            close = float(row["Close"])
            rows.append((date, close))
    return rows


def load_2021_2024():
    rows = []
    with open(DATA_DIR / "tsla_2021_2024.csv") as f:
        for row in csv.DictReader(f):
            date_str = row.get("Date", "").strip()
            if not re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", date_str):
                continue  # skip trailing blank rows in the source file
            date = datetime.strptime(date_str, "%m/%d/%Y").date()
            close_str = row["Close/Last"].strip().lstrip("$")
            close = float(close_str)
            rows.append((date, close))
    return rows


def load_price_series():
    a = load_2010_2021()
    b = load_2021_2024()
    by_date = {d: p for d, p in a}
    for d, p in b:  # 2021-2024 file (NASDAQ) wins on overlap
        by_date[d] = p
    series = sorted(by_date.items())
    return series  # list of (date, close) ascending


def liquidation_threshold_price_ratio():
    """
    Closed-form invariant, independent of the entry price itself:
    a borrower who takes on FULL capacity debt on day 0 is liquidatable
    exactly when price(t) < price(0) * riskAdjustmentBps / 1e4.

    Derivation: debt0 = capacity(0) = value(0) * CF * RA.
    isLiquidatable(t) <=> debt0 > threshold(t) = value(t) * CF
                       <=> value(0) * CF * RA > value(t) * CF
                       <=> value(0) * RA > value(t)
                       <=> price(t) < price(0) * RA          (value scales linearly with price)
    This does not depend on collateralFactorBps at all -- it cancels.
    It depends only on riskAdjustmentBps, which is exactly the gap
    between "how much you're allowed to borrow" and "the maintenance
    threshold" -- i.e. riskAdjustmentBps IS the liquidation buffer, by
    construction of these two formulas.
    """
    return RISK_ADJUSTMENT_BPS / 10_000  # 0.80 with current live parameters


def simulate(series):
    """
    For every trading day as a hypothetical full-capacity borrow date,
    find the number of trading days until the position first becomes
    liquidatable (price drops below entry_price * ratio), if it ever
    does within the remaining series.
    """
    ratio = liquidation_threshold_price_ratio()
    n = len(series)
    results = []
    for i in range(n):
        entry_date, entry_price = series[i]
        trigger_price = entry_price * ratio
        days_to_liquidation = None
        min_price_after = entry_price
        min_price_date = entry_date
        for j in range(i + 1, n):
            date_j, price_j = series[j]
            if price_j < min_price_after:
                min_price_after = price_j
                min_price_date = date_j
            if price_j < trigger_price:
                days_to_liquidation = j - i
                break
        max_drawdown_seen = (entry_price - min_price_after) / entry_price
        results.append({
            "entry_date": entry_date.isoformat(),
            "entry_price": entry_price,
            "trigger_price": round(trigger_price, 4),
            "days_to_liquidation": days_to_liquidation,
            "max_drawdown_after_entry_pct": round(max_drawdown_seen * 100, 2),
            "min_price_after_entry": min_price_after,
            "min_price_date": min_price_date.isoformat(),
        })
    return results


def summarize(results):
    total = len(results)
    # Exclude the tail where there isn't enough remaining history to know
    # the true outcome (would-be-censored observations) -- keep only
    # entries with at least 500 trading days of subsequent history so
    # "never liquidated" is a meaningful statement, not just "ran out of data".
    MIN_LOOKAHEAD = 500
    usable = [r for r in results if _has_lookahead(r, results, MIN_LOOKAHEAD)]

    liquidated = [r for r in usable if r["days_to_liquidation"] is not None]
    never = [r for r in usable if r["days_to_liquidation"] is None]

    days_list = sorted(r["days_to_liquidation"] for r in liquidated)

    def pct(count):
        return round(100 * count / len(usable), 1) if usable else 0.0

    def median(lst):
        if not lst:
            return None
        m = len(lst) // 2
        return lst[m] if len(lst) % 2 else (lst[m - 1] + lst[m]) / 2

    return {
        "total_entry_days_simulated": total,
        "entry_days_with_full_lookahead": len(usable),
        "min_lookahead_trading_days_required": MIN_LOOKAHEAD,
        "pct_that_became_liquidatable": pct(len(liquidated)),
        "pct_that_never_became_liquidatable": pct(len(never)),
        "median_trading_days_to_liquidation": median(days_list),
        "fastest_trading_days_to_liquidation": days_list[0] if days_list else None,
        "p10_trading_days_to_liquidation": days_list[len(days_list) // 10] if days_list else None,
        "liquidation_trigger_ratio": liquidation_threshold_price_ratio(),
        "collateral_factor_bps": COLLATERAL_FACTOR_BPS,
        "risk_adjustment_bps": RISK_ADJUSTMENT_BPS,
    }


def _has_lookahead(r, results, min_days):
    # Cheap re-derivation: an entry has full lookahead if either it
    # actually got liquidated (real, observed outcome) or there were at
    # least min_days remaining trading days after it in the series.
    if r["days_to_liquidation"] is not None:
        return True
    idx = _index_by_date.get(r["entry_date"])
    return idx is not None and (_series_len - idx - 1) >= min_days


if __name__ == "__main__":
    series = load_price_series()
    _series_len = len(series)
    _index_by_date = {d.isoformat(): i for i, (d, _) in enumerate(series)}

    print(f"Loaded {len(series)} real trading days: {series[0][0]} to {series[-1][0]}")

    results = simulate(series)
    summary = summarize(results)

    with open(OUT_DIR / "backtest_results.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)

    with open(OUT_DIR / "backtest_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(json.dumps(summary, indent=2))

    # A few real, concrete, checkable examples for the writeup.
    examples_of_interest = [
        "2021-11-04",  # near TSLA's Nov 2021 all-time high before the 2022 crash
        "2020-01-02",  # near the start of the dataset
        "2023-07-03",  # a 2023 rally peak before another pullback
    ]
    by_date_result = {r["entry_date"]: r for r in results}
    print("\nWorked examples:")
    for d in examples_of_interest:
        if d in by_date_result:
            print(f"  {d}: {by_date_result[d]}")
