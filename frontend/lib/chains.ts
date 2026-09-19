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

// Arbitrum Nitro dev-mode chain ID -- confirmed live from the actual
// nitro-devnode startup log ("Chain ID: 412346"), not assumed.
export const nitroDevnode = defineChain({
  id: 412346,
  name: "Nitro Dev Node",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8547"] },
  },
  testnet: true,
});

export const localChain = nitroDevnode;
