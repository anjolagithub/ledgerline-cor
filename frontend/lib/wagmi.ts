import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { localChain, robinhoodChainTestnet } from "./chains";

// Which chain is "active" is controlled entirely by NEXT_PUBLIC_CHAIN_ID --
// no code change needed to move from local Anvil to Robinhood Chain
// testnet, only environment configuration (per Phase 8 sign-off).
// Falls back to the real Robinhood Chain testnet (not the local devnode)
// so a missing env var in production doesn't silently target localhost.
const activeChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? robinhoodChainTestnet.id);

export const config = createConfig({
  chains: [localChain, robinhoodChainTestnet],
  connectors: [injected()],
  transports: {
    [localChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8547"),
    [robinhoodChainTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? ""),
  },
});

export const CHAIN_ID = activeChainId;
