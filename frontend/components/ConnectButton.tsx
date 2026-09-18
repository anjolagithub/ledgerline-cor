"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded border border-terminal-border px-3 py-1.5 text-xs uppercase tracking-wide text-terminal-muted hover:text-terminal-text"
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="rounded bg-terminal-accent px-3 py-1.5 text-xs uppercase tracking-wide text-terminal-accent-fg font-medium hover:opacity-90"
    >
      Connect
    </button>
  );
}
