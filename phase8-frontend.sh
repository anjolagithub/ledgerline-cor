#!/usr/bin/env bash
# LedgerLine Core — Phase 8: institutional-terminal frontend
# Verified current tooling before writing: wagmi v2 API (useReadContract/
# useWriteContract, createConfig+WagmiProvider+QueryClientProvider,
# transports keyed by chain id, injected() connector) and Tailwind v4
# (CSS-first @theme config, @tailwindcss/postcss, no tailwind.config.js).
set -uo pipefail
export NEXT_TELEMETRY_DISABLED=1

if [ ! -d "contracts" ]; then
  echo "!!! Run this from inside the ledgerline-core repo root."
  exit 1
fi

if [ -d "frontend" ]; then
  echo "!!! frontend/ already exists. Refusing to overwrite -- remove it first if you want a clean scaffold."
  exit 1
fi

mkdir -p frontend
cd frontend

echo "=================================================="
echo "npm init + installing dependencies (letting npm resolve current versions)"
echo "=================================================="
npm init -y >/dev/null

python3 - << 'PYEOF'
import json
with open("package.json") as f:
    pkg = json.load(f)
pkg["name"] = "ledgerline-core-frontend"
pkg["private"] = True
pkg["scripts"] = {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "generate-abis": "node scripts/generate-abis.mjs"
}
with open("package.json", "w") as f:
    json.dump(pkg, f, indent=2)
PYEOF

npm install next@latest react@latest react-dom@latest
npm install wagmi viem @tanstack/react-query
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss

echo ""
echo "=================================================="
echo "Writing config files"
echo "=================================================="

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
EOF

cat > postcss.config.mjs << 'EOF'
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
EOF

mkdir -p app abi lib components scripts

cat > app/globals.css << 'EOF'
@import "tailwindcss";

@theme {
  /* Institutional dark palette -- near-black, restrained, no gradients */
  --color-terminal-bg: #0a0e14;
  --color-terminal-surface: #10141c;
  --color-terminal-border: #1e2530;
  --color-terminal-text: #e2e8f0;
  --color-terminal-muted: #7b8794;
  --color-terminal-accent: #3b82f6;

  --color-decision-allow: #34d399;
  --color-decision-limit: #fbbf24;
  --color-decision-block: #f87171;
}

body {
  background-color: var(--color-terminal-bg);
  color: var(--color-terminal-text);
  font-feature-settings: "tnum";
}
EOF

echo ""
echo "=================================================="
echo "Writing chain + wagmi configuration"
echo "=================================================="

cat > lib/chains.ts << 'EOF'
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
EOF

cat > lib/wagmi.ts << 'EOF'
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { localChain, robinhoodChainTestnet } from "./chains";

// Which chain is "active" is controlled entirely by NEXT_PUBLIC_CHAIN_ID --
// no code change needed to move from local Anvil to Robinhood Chain
// testnet, only environment configuration (per Phase 8 sign-off).
const activeChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? localChain.id);

export const config = createConfig({
  chains: [localChain, robinhoodChainTestnet],
  connectors: [injected()],
  transports: {
    [localChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"),
    [robinhoodChainTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? ""),
  },
});

export const CHAIN_ID = activeChainId;
EOF

echo ""
echo "=================================================="
echo "Writing ABI generation script (Foundry artifacts -> committed snapshot)"
echo "=================================================="

cat > scripts/generate-abis.mjs << 'EOF'
// Foundry contracts/out/ is the source of truth, but the frontend does
// NOT read it at runtime or at build time -- per Phase 8 sign-off, this
// script is run manually during development to produce a deterministic,
// committed ABI snapshot in frontend/abi/. Re-run this whenever a
// contract's interface changes, then commit the result.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "contracts", "out");
const ABI_DIR = join(__dirname, "..", "abi");

const CONTRACTS = [
  "LedgerLineRegistry",
  "LedgerLinePolicy",
  "LedgerLineLendingAdapter",
  "RobinhoodStockTokenAdapter",
  "MockStockToken",
  "MockBorrowToken",
];

if (!existsSync(ABI_DIR)) mkdirSync(ABI_DIR, { recursive: true });

for (const name of CONTRACTS) {
  const artifactPath = join(OUT_DIR, `${name}.sol`, `${name}.json`);
  if (!existsSync(artifactPath)) {
    console.error(`!!! Missing artifact: ${artifactPath} -- run 'forge build' in contracts/ first.`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  writeFileSync(join(ABI_DIR, `${name}.json`), JSON.stringify(artifact.abi, null, 2));
  console.log(`Wrote abi/${name}.json`);
}
EOF

echo "Running ABI generation now (requires contracts/out/ to already exist from 'forge build')..."
node scripts/generate-abis.mjs

echo ""
echo "=================================================="
echo "Writing contract bindings"
echo "=================================================="

cat > lib/contracts.ts << 'EOF'
import registryAbi from "../abi/LedgerLineRegistry.json";
import policyAbi from "../abi/LedgerLinePolicy.json";
import adapterAbi from "../abi/LedgerLineLendingAdapter.json";
import stockTokenAbi from "../abi/MockStockToken.json";
import borrowTokenAbi from "../abi/MockBorrowToken.json";
import type { Abi, Address } from "viem";

function requireAddress(envVar: string | undefined, name: string): Address {
  if (!envVar) {
    // Zero address is a safe, obvious placeholder that fails loudly on
    // any real read/write rather than silently pointing somewhere wrong.
    console.warn(`NEXT_PUBLIC_${name}_ADDRESS is not set -- contract calls will fail until configured.`);
    return "0x0000000000000000000000000000000000000000";
  }
  return envVar as Address;
}

export const REGISTRY = {
  address: requireAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS, "REGISTRY"),
  abi: registryAbi as Abi,
};

export const POLICY = {
  address: requireAddress(process.env.NEXT_PUBLIC_POLICY_ADDRESS, "POLICY"),
  abi: policyAbi as Abi,
};

export const LENDING_ADAPTER = {
  address: requireAddress(process.env.NEXT_PUBLIC_LENDING_ADAPTER_ADDRESS, "LENDING_ADAPTER"),
  abi: adapterAbi as Abi,
};

export const STOCK_TOKEN = {
  address: requireAddress(process.env.NEXT_PUBLIC_STOCK_TOKEN_ADDRESS, "STOCK_TOKEN"),
  abi: stockTokenAbi as Abi,
};

export const BORROW_TOKEN = {
  address: requireAddress(process.env.NEXT_PUBLIC_BORROW_TOKEN_ADDRESS, "BORROW_TOKEN"),
  abi: borrowTokenAbi as Abi,
};

export const ASSET_ID = BigInt(process.env.NEXT_PUBLIC_ASSET_ID ?? "1");
export const ONE = 10n ** 18n;

export const LIFECYCLE_LABELS = [
  "ACTIVE", "RESTRICTED", "CORPORATE_ACTION", "SUSPENDED", "MATURING", "REDEEMABLE", "REDEEMED",
] as const;

export const DECISION_LABELS = ["ALLOW", "LIMIT", "REVIEW", "BLOCK"] as const;

export function formatUnits18(value: bigint | undefined): string {
  if (value === undefined) return "--";
  const whole = value / ONE;
  return whole.toLocaleString("en-US");
}

export function bpsToPercent(bps: bigint | undefined): string {
  if (bps === undefined) return "--";
  return `${(Number(bps) / 100).toFixed(0)}%`;
}
EOF

echo ""
echo "=================================================="
echo "Writing app shell (layout, providers)"
echo "=================================================="

cat > app/providers.tsx << 'EOF'
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
EOF

cat > app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "LedgerLine Core",
  description: "Programmable position, risk and policy layer for tokenized real-world assets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
EOF

echo ""
echo "=================================================="
echo "Writing components"
echo "=================================================="

cat > components/ConnectButton.tsx << 'EOF'
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
      className="rounded bg-terminal-accent px-3 py-1.5 text-xs uppercase tracking-wide text-white hover:opacity-90"
    >
      Connect
    </button>
  );
}
EOF

cat > components/LifecycleBadge.tsx << 'EOF'
import { LIFECYCLE_LABELS } from "@/lib/contracts";

export function LifecycleBadge({ lifecycle }: { lifecycle: number | undefined }) {
  const label = lifecycle !== undefined ? LIFECYCLE_LABELS[lifecycle] : "--";
  const isActive = lifecycle === 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs uppercase tracking-wide ${
        isActive
          ? "border-decision-allow/40 text-decision-allow"
          : "border-decision-limit/40 text-decision-limit"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-decision-allow" : "bg-decision-limit"}`} />
      {label}
    </span>
  );
}
EOF

cat > components/StatCard.tsx << 'EOF'
export function StatCard({
  label,
  value,
  sublabel,
  subvalue,
}: {
  label: string;
  value: string;
  sublabel?: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded border border-terminal-border bg-terminal-surface p-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sublabel && subvalue && (
        <div className="mt-1 text-xs text-terminal-muted">
          {sublabel} <span className="tabular-nums">{subvalue}</span>
        </div>
      )}
    </div>
  );
}
EOF

cat > components/PolicyDecisionCard.tsx << 'EOF'
"use client";

import { DECISION_LABELS, LIFECYCLE_LABELS, formatUnits18, bpsToPercent } from "@/lib/contracts";

type PolicyResponse = { decision: number; permittedAmount: bigint; reason: string } | undefined;

export function PolicyDecisionCard({
  requestedAmount,
  positionValue,
  collateralFactorBps,
  riskAdjustmentBps,
  lifecycle,
  response,
}: {
  requestedAmount: bigint | undefined;
  positionValue: bigint | undefined;
  collateralFactorBps: bigint | undefined;
  riskAdjustmentBps: bigint | undefined;
  lifecycle: number | undefined;
  response: PolicyResponse;
}) {
  const decisionLabel = response ? DECISION_LABELS[response.decision] : undefined;
  const isActive = lifecycle === 0;

  const colorClass =
    decisionLabel === "ALLOW"
      ? "text-decision-allow border-decision-allow/40"
      : decisionLabel === "LIMIT"
      ? "text-decision-limit border-decision-limit/40"
      : decisionLabel === "BLOCK"
      ? "text-decision-block border-decision-block/40"
      : "text-terminal-muted border-terminal-border";

  const traceLines = [
    { label: "Position verified", ok: positionValue !== undefined },
    { label: "Asset state verified", ok: lifecycle !== undefined },
    { label: `Lifecycle: ${lifecycle !== undefined ? LIFECYCLE_LABELS[lifecycle] : "--"}`, ok: isActive, warn: !isActive },
    { label: "Price available", ok: positionValue !== undefined && positionValue > 0n },
    { label: `Collateral factor: ${bpsToPercent(collateralFactorBps)}`, ok: true },
    { label: `Risk adjustment: ${bpsToPercent(riskAdjustmentBps)}`, ok: true, warn: (riskAdjustmentBps ?? 10000n) < 10000n },
    { label: `Effective capacity: $${formatUnits18(response?.permittedAmount)}`, ok: true },
    {
      label: `Requested: $${formatUnits18(requestedAmount)}`,
      ok: requestedAmount !== undefined && response !== undefined && requestedAmount <= response.permittedAmount,
      fail: requestedAmount !== undefined && response !== undefined && requestedAmount > response.permittedAmount,
    },
  ];

  return (
    <div className="rounded border border-terminal-border bg-terminal-surface p-5">
      <div className="text-xs uppercase tracking-wide text-terminal-muted mb-4">Policy Decision</div>

      <div className="space-y-1.5 mb-4">
        {traceLines.map((line, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className={
                line.fail ? "text-decision-block" : line.warn ? "text-decision-limit" : "text-decision-allow"
              }
            >
              {line.fail ? "\u2715" : line.warn ? "\u26A0" : "\u2713"}
            </span>
            <span className="text-terminal-text">{line.label}</span>
          </div>
        ))}
      </div>

      <div className={`rounded border ${colorClass} px-4 py-3 text-center`}>
        <div className="text-2xl font-bold tracking-wide">{decisionLabel ?? "--"}</div>
        {response && (
          <div className="mt-1 text-xs text-terminal-muted">
            Maximum permitted <span className="tabular-nums">${formatUnits18(response.permittedAmount)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
EOF

cat > components/DepositForm.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useWriteContract, useAccount } from "wagmi";
import { STOCK_TOKEN, LENDING_ADAPTER, ONE } from "@/lib/contracts";

export function DepositForm() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const { writeContract: approve, isPending: approving } = useWriteContract();
  const { writeContract: deposit, isPending: depositing } = useWriteContract();

  const parsedAmount = amount ? BigInt(Math.floor(Number(amount) * 1e6)) * (ONE / 1_000_000n) : 0n;

  return (
    <div className="rounded border border-terminal-border bg-terminal-surface p-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Deposit Stock Token</div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Shares"
        className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-3"
      />
      <div className="flex gap-2">
        <button
          disabled={!address || !amount || approving}
          onClick={() =>
            approve({
              address: STOCK_TOKEN.address,
              abi: STOCK_TOKEN.abi,
              functionName: "approve",
              args: [LENDING_ADAPTER.address, parsedAmount],
            })
          }
          className="flex-1 rounded border border-terminal-border px-3 py-2 text-xs uppercase tracking-wide hover:bg-terminal-bg disabled:opacity-40"
        >
          Approve
        </button>
        <button
          disabled={!address || !amount || depositing}
          onClick={() =>
            deposit({
              address: LENDING_ADAPTER.address,
              abi: LENDING_ADAPTER.abi,
              functionName: "deposit",
              args: [parsedAmount],
            })
          }
          className="flex-1 rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-white hover:opacity-90 disabled:opacity-40"
        >
          Deposit
        </button>
      </div>
    </div>
  );
}
EOF

cat > components/BorrowForm.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { POLICY, LENDING_ADAPTER, ASSET_ID, ONE, formatUnits18 } from "@/lib/contracts";
import { PolicyDecisionCard } from "./PolicyDecisionCard";

export function BorrowForm({
  positionValue,
  collateralFactorBps,
  riskAdjustmentBps,
  lifecycle,
}: {
  positionValue: bigint | undefined;
  collateralFactorBps: bigint | undefined;
  riskAdjustmentBps: bigint | undefined;
  lifecycle: number | undefined;
}) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;
  const positionId = address ? BigInt(address) : 0n;

  const { data: response } = useReadContract({
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [ASSET_ID, positionId, 0, parsedAmount], // Action.BORROW = 0
    query: { enabled: !!address && parsedAmount > 0n },
  }) as { data: { decision: number; permittedAmount: bigint; reason: string } | undefined };

  const { writeContract: borrow, isPending } = useWriteContract();

  const decision = response ? ["ALLOW", "LIMIT", "REVIEW", "BLOCK"][response.decision] : undefined;
  const canSubmit = decision === "ALLOW";

  return (
    <div className="space-y-4">
      <div className="rounded border border-terminal-border bg-terminal-surface p-4">
        <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Borrow</div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (USD)"
          className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm mb-3"
        />
        <button
          disabled={!address || !canSubmit || isPending}
          onClick={() =>
            borrow({
              address: LENDING_ADAPTER.address,
              abi: LENDING_ADAPTER.abi,
              functionName: "borrow",
              args: [parsedAmount],
            })
          }
          className="w-full rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-white hover:opacity-90 disabled:opacity-40"
        >
          {canSubmit ? "Borrow" : "Preview only -- adjust amount"}
        </button>
      </div>

      {parsedAmount > 0n && (
        <PolicyDecisionCard
          requestedAmount={parsedAmount}
          positionValue={positionValue}
          collateralFactorBps={collateralFactorBps}
          riskAdjustmentBps={riskAdjustmentBps}
          lifecycle={lifecycle}
          response={response}
        />
      )}
    </div>
  );
}
EOF

echo ""
echo "=================================================="
echo "Writing dashboard (/) and admin (/admin) pages"
echo "=================================================="

cat > app/page.tsx << 'EOF'
"use client";

import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { LifecycleBadge } from "@/components/LifecycleBadge";
import { StatCard } from "@/components/StatCard";
import { DepositForm } from "@/components/DepositForm";
import { BorrowForm } from "@/components/BorrowForm";
import { REGISTRY, POLICY, ASSET_ID, formatUnits18, bpsToPercent } from "@/lib/contracts";

export default function Dashboard() {
  const { address } = useAccount();
  const positionId = address ? BigInt(address) : 0n;

  const { data: assetState } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getAssetState",
    args: [ASSET_ID],
  }) as {
    data:
      | {
          price: bigint;
          multiplier: bigint;
          lifecycle: number;
          collateralFactorBps: bigint;
          riskAdjustmentBps: bigint;
        }
      | undefined;
  };

  const { data: position } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getPosition",
    args: [ASSET_ID, positionId],
    query: { enabled: !!address },
  }) as { data: { rawBalance: bigint } | undefined };

  const positionValue =
    position && assetState ? (position.rawBalance * assetState.price) / 10n ** 18n : undefined;

  const baseCapacity =
    positionValue && assetState ? (positionValue * assetState.collateralFactorBps) / 10000n : undefined;

  const effectiveCapacity =
    baseCapacity && assetState ? (baseCapacity * assetState.riskAdjustmentBps) / 10000n : undefined;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between border-b border-terminal-border pb-4 mb-8">
        <div>
          <div className="text-lg font-semibold">LedgerLine Core</div>
          <div className="text-xs text-terminal-muted">Robinhood Chain</div>
        </div>
        <ConnectButton />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-terminal-muted">Stock Token</div>
          <div className="text-xl font-semibold">Asset #{ASSET_ID.toString()}</div>
        </div>
        <LifecycleBadge lifecycle={assetState?.lifecycle} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Position Value" value={`$${formatUnits18(positionValue)}`} />
        <StatCard
          label="Borrowing Power"
          value={`$${formatUnits18(effectiveCapacity)}`}
          sublabel="Base"
          subvalue={`$${formatUnits18(baseCapacity)}`}
        />
        <StatCard
          label="Risk Adjustment"
          value={bpsToPercent(assetState?.riskAdjustmentBps)}
          sublabel="Collateral Factor"
          subvalue={bpsToPercent(assetState?.collateralFactorBps)}
        />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <DepositForm />
        <BorrowForm
          positionValue={positionValue}
          collateralFactorBps={assetState?.collateralFactorBps}
          riskAdjustmentBps={assetState?.riskAdjustmentBps}
          lifecycle={assetState?.lifecycle}
        />
      </div>

      <div className="rounded border border-terminal-border bg-terminal-surface p-4">
        <div className="text-xs uppercase tracking-wide text-terminal-muted mb-2">How LedgerLine Works</div>
        <div className="flex items-center gap-2 text-sm text-terminal-muted flex-wrap">
          {["RWA Position", "Lifecycle", "Risk", "Policy", "Financial Action"].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="text-terminal-text">{step}</span>
              {i < arr.length - 1 && <span>&rarr;</span>}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
EOF

cat > app/admin/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { REGISTRY, ASSET_ID, LIFECYCLE_LABELS } from "@/lib/contracts";

export default function AdminPage() {
  const { address } = useAccount();
  const [lifecycleTarget, setLifecycleTarget] = useState(0);
  const [collateralBps, setCollateralBps] = useState("7000");
  const [riskBps, setRiskBps] = useState("8000");

  const { data: owner } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "owner",
  }) as { data: string | undefined };

  const { data: assetState } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getAssetState",
    args: [ASSET_ID],
  }) as { data: { lifecycle: number; price: bigint } | undefined };

  const { writeContract: transitionLifecycle } = useWriteContract();
  const { writeContract: updateParams } = useWriteContract();

  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-sm text-terminal-muted">
          Operator Mode -- connect the Registry owner wallet to access this screen.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-decision-limit mb-1">Operator Mode</div>
        <div className="text-lg font-semibold">LedgerLine / Operator</div>
      </div>

      <div className="rounded border border-terminal-border bg-terminal-surface p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-terminal-muted mb-1">Lifecycle</div>
          <select
            value={lifecycleTarget}
            onChange={(e) => setLifecycleTarget(Number(e.target.value))}
            className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm"
          >
            {LIFECYCLE_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-1">Collateral Factor (bps)</div>
            <input
              value={collateralBps}
              onChange={(e) => setCollateralBps(e.target.value)}
              className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-1">Risk Adjustment (bps)</div>
            <input
              value={riskBps}
              onChange={(e) => setRiskBps(e.target.value)}
              className="w-full rounded border border-terminal-border bg-terminal-bg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() =>
              transitionLifecycle({
                address: REGISTRY.address,
                abi: REGISTRY.abi,
                functionName: "transitionLifecycle",
                args: [ASSET_ID, lifecycleTarget],
              })
            }
            className="flex-1 rounded border border-terminal-border px-3 py-2 text-xs uppercase tracking-wide hover:bg-terminal-bg"
          >
            Transition Lifecycle
          </button>
          <button
            onClick={() =>
              updateParams({
                address: REGISTRY.address,
                abi: REGISTRY.abi,
                functionName: "updateAssetParameters",
                args: [ASSET_ID, assetState?.price ?? 0n, 10n ** 18n, BigInt(collateralBps), BigInt(riskBps)],
              })
            }
            className="flex-1 rounded bg-terminal-accent px-3 py-2 text-xs uppercase tracking-wide text-white hover:opacity-90"
          >
            Update Risk Params
          </button>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-terminal-border text-xs text-terminal-muted space-y-1">
        <div>
          Current state:{" "}
          <span className="text-terminal-text">
            {assetState ? LIFECYCLE_LABELS[assetState.lifecycle] : "--"}
          </span>
        </div>
        <div>
          Owner: <span className="text-terminal-text">{owner ?? "--"}</span>
        </div>
      </div>
    </main>
  );
}
EOF

echo ""
echo "=================================================="
echo "Writing .env.local.example"
echo "=================================================="
cat > .env.local.example << 'EOF'
# LedgerLine Core frontend -- environment-driven config (Phase 8 sign-off).
# Copy to .env.local and fill in. Never commit .env.local.

# For local Anvil: leave as-is with chain id 31337.
# For Robinhood Chain testnet (Phase 11): set to 46630 and a real RPC URL.
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

NEXT_PUBLIC_REGISTRY_ADDRESS=
NEXT_PUBLIC_POLICY_ADDRESS=
NEXT_PUBLIC_LENDING_ADAPTER_ADDRESS=
NEXT_PUBLIC_STOCK_TOKEN_ADDRESS=
NEXT_PUBLIC_BORROW_TOKEN_ADDRESS=
NEXT_PUBLIC_ASSET_ID=1
EOF

# .env.local.example has no real secrets, but .env.local itself must never be committed
if ! grep -q "^\.env\.local$" .gitignore 2>/dev/null; then
  echo ".env.local" >> .gitignore
fi

cd ..

echo ""
echo "=================================================="
echo "BUILD CHECK (TypeScript + Next.js build)"
echo "=================================================="
( cd frontend && npm run build ) && BUILD_STATUS="SUCCESS" || BUILD_STATUS="FAILED"
echo ""

echo "=================================================="
echo "SUMMARY"
echo "=================================================="
echo "Frontend build: $BUILD_STATUS"
echo ""

if [ "$BUILD_STATUS" = "SUCCESS" ]; then
  git add -A
  git add -f frontend/abi frontend/package-lock.json
  git commit -q -m "feat(frontend): Phase 8 -- institutional terminal dashboard + operator admin panel"
  echo "Committed (including package-lock.json and generated abi/ snapshot)."
else
  echo "NOT committed -- review errors above."
fi
echo ""
echo "Copy/paste this ENTIRE output back to Claude."
