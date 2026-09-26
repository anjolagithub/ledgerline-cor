# Historical risk-formula backtest

See `docs/ANALYSIS.md` for the full writeup, methodology, and results.

## Reproduce

```
python3 backtest.py   # writes out/backtest_results.csv, out/backtest_summary.json
python3 chart.py      # writes out/price_history_example.png, out/days_to_liquidation_histogram.png
```

Requires `matplotlib` for `chart.py` only (`backtest.py` has no
third-party dependencies, stdlib `csv`/`json`/`datetime` only).

## Layout

- `data/` -- real historical TSLA daily price CSVs (sources cited in `docs/ANALYSIS.md`)
- `backtest.py` -- loads the data, mirrors CortexRails' exact deployed risk formulas, simulates every historical day as a full-capacity borrow date
- `chart.py` -- renders the two charts referenced in `docs/ANALYSIS.md`
- `out/` -- generated results (git-ignored is NOT set up for this yet -- these are committed so the numbers in `docs/ANALYSIS.md` are checkable without re-running anything)
