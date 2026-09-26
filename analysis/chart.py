#!/usr/bin/env python3
"""Renders two charts from backtest.py's output: the real TSLA price
series with a worked example's entry/trigger prices annotated, and a
histogram of days-to-liquidation across all 3,420 usable entry days.
Run backtest.py first."""
import csv
import json
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

from backtest import load_price_series, liquidation_threshold_price_ratio

OUT_DIR = Path(__file__).parent / "out"

series = load_price_series()
dates = [d for d, _ in series]
prices = [p for _, p in series]

# --- Chart 1: real price series with one worked example annotated ---
fig, ax = plt.subplots(figsize=(11, 5))
ax.plot(dates, prices, linewidth=0.8, color="#3b82f6")

entry_date = datetime(2021, 11, 4).date()
entry_price = next(p for d, p in series if d == entry_date)
trigger_price = entry_price * liquidation_threshold_price_ratio()
liq_date = datetime(2021, 12, 13).date()

ax.axhline(trigger_price, color="#ef4444", linestyle="--", linewidth=1, alpha=0.7)
ax.scatter([entry_date], [entry_price], color="#22c55e", zorder=5, s=40, label=f"Full-capacity borrow, {entry_date} (${entry_price:.0f})")
ax.scatter([liq_date], [trigger_price], color="#ef4444", zorder=5, s=40, label=f"Liquidatable, {liq_date} (${trigger_price:.0f}, 26 trading days later)")
ax.set_title("Real TSLA price history vs. CortexRails' liquidation threshold\n(worked example: full-capacity borrow at the Nov 2021 all-time high)")
ax.set_ylabel("TSLA close price (USD)")
ax.legend(loc="upper left", fontsize=9)
ax.xaxis.set_major_locator(mdates.YearLocator(2))
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
fig.tight_layout()
fig.savefig(OUT_DIR / "price_history_example.png", dpi=150)
plt.close(fig)

# --- Chart 2: histogram of days-to-liquidation across all entry days ---
with open(OUT_DIR / "backtest_results.csv") as f:
    rows = list(csv.DictReader(f))

days = [int(r["days_to_liquidation"]) for r in rows if r["days_to_liquidation"]]

fig, ax = plt.subplots(figsize=(9, 5))
ax.hist(days, bins=60, color="#6366f1", edgecolor="none")
ax.set_title(f"Trading days from full-capacity borrow to liquidation eligibility\n(n={len(days)} historical entry days that eventually became liquidatable, of 3,420 tested)")
ax.set_xlabel("Trading days until debt exceeded the maintenance threshold")
ax.set_ylabel("Count of historical entry days")
fig.tight_layout()
fig.savefig(OUT_DIR / "days_to_liquidation_histogram.png", dpi=150)
plt.close(fig)

print("Wrote out/price_history_example.png and out/days_to_liquidation_histogram.png")
