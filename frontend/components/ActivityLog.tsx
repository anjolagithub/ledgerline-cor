"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContract, useWatchContractEvent } from "wagmi";
import { REGISTRY, LENDING_ADAPTER, VAULT_ADAPTER, TRANSFER_ADAPTER, STOCK_TOKEN } from "@/lib/contracts";
import {
  type ActivityKind,
  type ActivityRow,
  EXPLORER_TX_BASE_URL,
  LENDING_ADAPTER_DEPLOY_BLOCK,
  REGISTRY_DEPLOY_BLOCK,
  VAULT_ADAPTER_DEPLOY_BLOCK,
  TRANSFER_ADAPTER_DEPLOY_BLOCK,
  describeRow,
  formatRelativeTime,
  pickEvents,
  sortRowsDesc,
  toActivityRow,
} from "@/lib/activity";

type FilterId = "all" | "deposit" | "borrow" | "withdraw" | "transfer" | "lifecycle";

const TABS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposits" },
  { id: "borrow", label: "Borrows" },
  { id: "withdraw", label: "Withdrawals" },
  { id: "transfer", label: "Transfers" },
  { id: "lifecycle", label: "Lifecycle" },
];

const ACTION_KINDS: ActivityKind[] = ["deposit", "borrow", "withdraw", "transfer"];

function matchesFilter(row: ActivityRow, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "lifecycle") return row.kind === "lifecycle" || row.kind === "parameters";
  return row.kind === filter;
}

function mergeRows(existing: ActivityRow[], incoming: ActivityRow[]): ActivityRow[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return sortRowsDesc(Array.from(byId.values()));
}

export function ActivityLog() {
  const publicClient = usePublicClient();
  const { data: symbol } = useReadContract({
    address: STOCK_TOKEN.address,
    abi: STOCK_TOKEN.abi,
    functionName: "symbol",
  }) as { data: string | undefined };
  const stockSymbol = symbol ?? "TSLA";

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [filter, setFilter] = useState<FilterId>("all");

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
        const [lendingLogs, vaultLogs, transferLogs, registryLogs] = await Promise.all([
          publicClient.getLogs({
            address: LENDING_ADAPTER.address,
            events: pickEvents(LENDING_ADAPTER.abi, ["Deposited", "Borrowed"]),
            fromBlock: LENDING_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: VAULT_ADAPTER.address,
            events: pickEvents(VAULT_ADAPTER.abi, ["Withdrawn"]),
            fromBlock: VAULT_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: TRANSFER_ADAPTER.address,
            events: pickEvents(TRANSFER_ADAPTER.abi, ["Transferred"]),
            fromBlock: TRANSFER_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: REGISTRY.address,
            events: pickEvents(REGISTRY.abi, ["LifecycleTransitioned", "AssetParametersUpdated"]),
            fromBlock: REGISTRY_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
        ]);

        const allLogs = [...lendingLogs, ...vaultLogs, ...transferLogs, ...registryLogs];
        const uniqueBlockNumbers = Array.from(new Set(allLogs.map((log) => log.blockNumber))).filter(
          (blockNumber): blockNumber is bigint => blockNumber !== null
        );
        const blocks = await Promise.all(
          uniqueBlockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber }))
        );
        const timestampByBlock = new Map(blocks.map((block) => [block.number, block.timestamp]));

        // biome-ignore lint: getLogs' return type for a multi-event `events` array
        // doesn't narrow eventName/args per-entry; decoding is driven by the
        // real ABI values passed in, so this is safe at runtime.
        const nextRows = allLogs
          .map((log) =>
            toActivityRow(log as never, log.blockNumber ? timestampByBlock.get(log.blockNumber) : undefined)
          )
          .filter((row): row is ActivityRow => row !== undefined);

        if (!cancelled) {
          setRows(sortRowsDesc(nextRows));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load activity");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  async function appendLiveLogs(logs: unknown[]) {
    if (!publicClient) return;
    const decoded = logs as {
      eventName?: string;
      args?: Record<string, unknown>;
      transactionHash?: `0x${string}` | null;
      blockNumber?: bigint | null;
      logIndex?: number | null;
    }[];

    const blockNumbers = Array.from(new Set(decoded.map((log) => log.blockNumber))).filter(
      (blockNumber): blockNumber is bigint => !!blockNumber
    );
    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber }))
    );
    const timestampByBlock = new Map(blocks.map((block) => [block.number, block.timestamp]));

    const newRows = decoded
      .map((log) => toActivityRow(log, log.blockNumber ? timestampByBlock.get(log.blockNumber) : undefined))
      .filter((row): row is ActivityRow => row !== undefined);

    if (newRows.length > 0) setRows((prev) => mergeRows(prev, newRows));
  }

  useWatchContractEvent({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    eventName: "Deposited",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    eventName: "Borrowed",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: VAULT_ADAPTER.address,
    abi: VAULT_ADAPTER.abi,
    eventName: "Withdrawn",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: TRANSFER_ADAPTER.address,
    abi: TRANSFER_ADAPTER.abi,
    eventName: "Transferred",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    eventName: "LifecycleTransitioned",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    eventName: "AssetParametersUpdated",
    onLogs: appendLiveLogs,
  });

  const visibleRows = rows.filter((row) => matchesFilter(row, filter));

  return (
    <section className="console-shell border border-terminal-border bg-terminal-surface p-5 md:p-7" aria-labelledby="activity-title">
      <div className="mb-6 flex flex-col gap-4 border-b border-terminal-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Onchain activity</p>
          <h2 id="activity-title" className="mt-2 text-2xl font-semibold tracking-tight">Activity</h2>
          <p className="mt-2 max-w-xl text-sm text-terminal-muted">
            Deposited, Borrowed, Withdrawn, Transferred, and Registry state changes, read directly from onchain logs.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            aria-pressed={filter === tab.id}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] transition-colors ${
              filter === tab.id
                ? "border-terminal-accent bg-terminal-accent text-terminal-accent-fg"
                : "border-terminal-border text-terminal-muted hover:text-terminal-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="mb-5 text-xs text-terminal-muted">
        Only successful onchain actions appear here. A LIMIT or BLOCK policy decision reverts the whole
        transaction, so rejected attempts leave no onchain record to read.
      </p>

      {loading && <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-terminal-muted" role="status">Loading activity…</div>}
      {loadError && <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-decision-block" role="alert">{loadError}</div>}

      {!loading && !loadError && visibleRows.length === 0 && (
        <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-terminal-muted">
          No activity recorded yet for this filter.
        </div>
      )}

      {!loading && !loadError && visibleRows.length > 0 && (
        <ul className="divide-y divide-terminal-border border border-terminal-border bg-terminal-bg">
          {visibleRows.map((row) => {
            const { label, amountText, detailText } = describeRow(row, stockSymbol);
            const isAction = ACTION_KINDS.includes(row.kind);
            return (
              <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-terminal-text">{label}</span>
                  {isAction && (
                    <span className="rounded-full border border-decision-allow px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.1em] text-decision-allow">
                      Allow
                    </span>
                  )}
                  {amountText && <span className="font-mono text-sm text-terminal-muted">{amountText}</span>}
                  {detailText && <span className="font-mono text-xs text-terminal-muted">{detailText}</span>}
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-terminal-muted">
                  <span>{formatRelativeTime(row.timestamp)}</span>
                  <span>{row.txHash.slice(0, 10)}...{row.txHash.slice(-8)}</span>
                  <a
                    href={`${EXPLORER_TX_BASE_URL}/${row.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-terminal-accent hover:underline"
                  >
                    View on Explorer
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
