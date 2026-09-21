import { defineChain } from "viem";

/// Robinhood Chain testnet. Chain id verified against official docs
/// (docs.robinhood.com/chain) -- do not change without re-verifying.
/// No default RPC URL is set: pass `rpcUrl` or `publicClient` to
/// LedgerLineClient explicitly rather than relying on a baked-in one.
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [] },
  },
  testnet: true,
});
