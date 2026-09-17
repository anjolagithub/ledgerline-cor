import { defineChain } from "viem";
import { foundry } from "viem/chains";

// foundry (chain id 31337) is viem's built-in definition matching anvil's
// defaults -- used for local development against `anvil`.

// Robinhood Chain testnet. Chain ID verified against official docs
// (docs.robinhood.com/chain) during Phase 1/7 -- do not change this
// without re-verifying against the current docs.
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? ""],
    },
  },
  testnet: true,
});

export const localChain = foundry;
