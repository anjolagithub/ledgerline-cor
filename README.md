# LedgerLine Core

The programmable position, risk and policy layer for tokenized real-world assets.

Built for the Arbitrum Open House Singapore online buildathon.
First deep integration and proving ground: Robinhood Chain Stock Tokens.


## Repo layout

- `contracts/` — Foundry project (Solidity). Its own `foundry.toml` and `lib/forge-std`.
- `stylus/` — Rust/Arbitrum Stylus multi-contract Cargo workspace
  (`position-engine`, `risk-engine`), per Stylus SDK v0.10 conventions.
- `sdk/` — TypeScript SDK (`@ledgerline/core`), added once contract interfaces stabilize.
- `frontend/` — Next.js judge-facing demo app.
- `docs/` — supporting docs beyond the top-level ones below.

Status: architecture phase — not yet implemented.
See ARCHITECTURE.md (once written) for the technical design.
