import { ActionProvider, CreateAction, type EvmWalletProvider, type Network } from "@coinbase/agentkit";
import { z } from "zod";
import { type Address, encodeFunctionData, getAddress, parseUnits } from "viem";
import { LedgerLineClient } from "../client";
import { evaluateAgentIntent, KNOWN_AGENT_ASSETS, type AgentAction, type AgentIntent } from "../agent";
import { LedgerLineLendingAdapterAbi, LedgerLineVaultAdapterAbi, LedgerLineTransferAdapterAbi } from "../abi";
import { ROBINHOOD_TESTNET_ADDRESSES, type LedgerLineAddresses } from "../addresses";

/// Coinbase AgentKit action provider for CortexRails Protocol.
///
/// This is the second real consumer of `evaluateAgentIntent()` /
/// `Policy.canExecute()` -- the SDK's own agent-intent layer -- wired
/// into an actual third-party agent framework's real plugin interface
/// (`ActionProvider` / `@CreateAction`, as published in
/// `@coinbase/agentkit`), not a hand-rolled imitation of it.
///
/// WHAT THIS DOES NOT DO: it does not replace AgentKit's own wallet
/// infrastructure (custody, signing, session keys, spend limits --
/// that is AgentKit's job, via whichever `EvmWalletProvider` the agent
/// is configured with). This action provider sits strictly downstream
/// of that: given a wallet AgentKit already trusts to sign, it decides
/// whether a SPECIFIC action on a SPECIFIC RWA position is allowed,
/// using the exact same onchain `Policy.canExecute()` decision this
/// SDK's `LedgerLineClient` and the CortexRails frontend both use --
/// no separate risk logic is invented here.
///
/// EXECUTION SAFETY: `borrow`/`withdraw`/`transfer` below check policy
/// BEFORE submitting a transaction, and refuse outright (no tx sent)
/// on BLOCK or REVIEW. REVIEW is deliberately NOT auto-executed --
/// the CortexRails frontend itself marks REVIEW "Reserved" pending a
/// real human-in-the-loop flow (see PolicyVerdict/decision-grid), and
/// an autonomous agent gets the same restriction, not a looser one.
/// This pre-check is a courtesy that avoids wasting gas on a doomed
/// call and lets the agent see WHY before it tries -- it is not the
/// only enforcement: LedgerLineLendingAdapter/VaultAdapter/
/// TransferAdapter each independently call `Policy.canExecute()`
/// onchain and will revert regardless of what this pre-check said.
export type CortexRailsActionProviderConfig = {
  /// Builds a default (http) publicClient against this RPC URL when a
  /// walletProvider's own `getPublicClient()` isn't used. Normally
  /// unnecessary -- every action here reads via the walletProvider's
  /// own public client, which already points at the network the agent
  /// is actually connected to.
  rpcUrl?: string;
  /// Override any of the five contract addresses. Defaults to the real
  /// V2 testnet deployment (see ../addresses.ts), matching every other
  /// entry point in this SDK.
  addresses?: Partial<LedgerLineAddresses>;
  /// Default assetId used when a call's `asset` argument isn't a known
  /// symbol. Defaults to 1n (TSLA), matching LedgerLineClient.
  assetId?: bigint;
};

const CheckPolicySchema = z.object({
  asset: z.string().describe('Asset symbol, e.g. "TSLA" -- the only asset this deployment configures.'),
  action: z.enum(["BORROW", "WITHDRAW", "TRANSFER"]).describe("The action to evaluate."),
  amount: z.string().describe('Human-readable decimal amount, e.g. "120000". Never pre-scaled.'),
  positionId: z
    .string()
    .optional()
    .describe("Wallet address or numeric positionId to evaluate. Defaults to the connected wallet's own address."),
});

const BorrowSchema = z.object({
  amount: z.string().describe('Human-readable decimal amount to borrow, e.g. "120000".'),
});

const WithdrawSchema = z.object({
  amount: z.string().describe('Human-readable decimal amount of collateral to withdraw, e.g. "10".'),
});

const TransferSchema = z.object({
  to: z.string().describe("Destination wallet address to reassign the position to."),
  amount: z.string().describe("Human-readable decimal amount of collateral to reassign."),
});

/// True for ALLOW and LIMIT -- the two decisions this action provider
/// will submit a transaction for (adjusted to `permittedAmount` on
/// LIMIT). False for REVIEW and BLOCK -- both refused without a tx.
function isExecutable(decision: string): decision is "ALLOW" | "LIMIT" {
  return decision === "ALLOW" || decision === "LIMIT";
}

export class CortexRailsActionProvider extends ActionProvider<EvmWalletProvider> {
  private readonly addresses: LedgerLineAddresses;
  private readonly assetId: bigint;
  private readonly rpcUrl: string | undefined;

  constructor(config: CortexRailsActionProviderConfig = {}) {
    super("cortexrails", []);
    this.addresses = { ...ROBINHOOD_TESTNET_ADDRESSES, ...config.addresses };
    this.assetId = config.assetId ?? 1n;
    this.rpcUrl = config.rpcUrl;
  }

  supportsNetwork = (network: Network): boolean => network.protocolFamily === "evm";

  /// Builds a read-only LedgerLineClient over the wallet provider's own
  /// public client, so this action provider never opens a second RPC
  /// connection to a different network than the agent is actually on.
  private readClient(walletProvider: EvmWalletProvider): LedgerLineClient {
    return new LedgerLineClient({
      publicClient: walletProvider.getPublicClient(),
      rpcUrl: this.rpcUrl,
      addresses: this.addresses,
      assetId: this.assetId,
    });
  }

  private resolveAsset(asset: string): bigint {
    return KNOWN_AGENT_ASSETS[asset] ?? this.assetId;
  }

  @CreateAction({
    name: "check_policy",
    description:
      "Checks CortexRails' real onchain policy (Policy.canExecute()) for a proposed RWA action BEFORE " +
      "attempting it. Returns the real decision (ALLOW, LIMIT, REVIEW, or BLOCK), the permitted amount " +
      "(may be less than requested on LIMIT), and the real reason code. Use this before borrow/withdraw/" +
      "transfer to understand what will happen, or to check an action this provider doesn't execute directly.",
    schema: CheckPolicySchema,
  })
  async checkPolicy(walletProvider: EvmWalletProvider, args: z.infer<typeof CheckPolicySchema>): Promise<string> {
    const intent: AgentIntent = {
      asset: args.asset,
      action: args.action as AgentAction,
      amount: args.amount,
      positionId: (args.positionId as Address | undefined) ?? (walletProvider.getAddress() as Address),
    };

    try {
      const result = await evaluateAgentIntent(this.readClient(walletProvider), intent);
      const base =
        `Policy decision for ${args.action} ${args.amount} ${args.asset}: ${result.decision} ` +
        `(reason: ${result.reason}). Permitted amount: ${result.permittedAmount} ${args.asset}.`;
      if (result.decision === "LIMIT") {
        return `${base} A LIMIT decision means only the permitted amount would be accepted onchain -- retry with that amount, not the original request.`;
      }
      if (result.decision === "REVIEW") {
        return `${base} REVIEW is not auto-executed by this action provider (or by the CortexRails frontend) -- it requires a human decision.`;
      }
      return base;
    } catch (error) {
      return `Error checking policy: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  @CreateAction({
    name: "borrow",
    description:
      "Borrows against an existing CortexRails RWA collateral position, via LedgerLineLendingAdapter. " +
      "Checks Policy.canExecute() first and refuses (no transaction sent) on BLOCK or REVIEW. On LIMIT, " +
      "submits the permitted amount instead of the requested amount. The adapter independently re-checks " +
      "policy onchain regardless of this pre-check.",
    schema: BorrowSchema,
  })
  async borrow(walletProvider: EvmWalletProvider, args: z.infer<typeof BorrowSchema>): Promise<string> {
    const positionId = walletProvider.getAddress() as Address;
    const intent: AgentIntent = { asset: "TSLA", action: "BORROW", amount: args.amount, positionId };

    try {
      const check = await evaluateAgentIntent(this.readClient(walletProvider), intent);
      if (!isExecutable(check.decision)) {
        return `Refused: policy decision was ${check.decision} (reason: ${check.reason}). No transaction was sent.`;
      }

      const amountToSubmit = check.decision === "LIMIT" ? check.permittedAmount : args.amount;
      const amountWei = parseUnits(amountToSubmit, 18);

      const data = encodeFunctionData({
        abi: LedgerLineLendingAdapterAbi,
        functionName: "borrow",
        args: [amountWei],
      });

      const hash = await walletProvider.sendTransaction({ to: this.addresses.lendingAdapter, data });
      const note =
        check.decision === "LIMIT"
          ? ` Note: policy limited this to ${check.permittedAmount} TSLA-borrow (requested ${args.amount}).`
          : "";
      return `Submitted borrow(${amountToSubmit}) via LedgerLineLendingAdapter. Tx hash: ${hash}.${note} This is a submitted hash, not confirmation -- wait for the receipt before treating it as final.`;
    } catch (error) {
      return `Error submitting borrow: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  @CreateAction({
    name: "withdraw",
    description:
      "Withdraws previously deposited RWA collateral via VaultAdapter -- CortexRails' independent " +
      "second consumer of Policy.canExecute(), evaluated on lifecycle state and remaining debt-safe " +
      "capacity, not borrowing capacity. Refuses (no transaction sent) on BLOCK or REVIEW.",
    schema: WithdrawSchema,
  })
  async withdraw(walletProvider: EvmWalletProvider, args: z.infer<typeof WithdrawSchema>): Promise<string> {
    const positionId = walletProvider.getAddress() as Address;
    const intent: AgentIntent = { asset: "TSLA", action: "WITHDRAW", amount: args.amount, positionId };

    try {
      const check = await evaluateAgentIntent(this.readClient(walletProvider), intent);
      if (!isExecutable(check.decision)) {
        return `Refused: policy decision was ${check.decision} (reason: ${check.reason}). No transaction was sent.`;
      }

      const amountToSubmit = check.decision === "LIMIT" ? check.permittedAmount : args.amount;
      const amountWei = parseUnits(amountToSubmit, 18);

      const data = encodeFunctionData({
        abi: LedgerLineVaultAdapterAbi,
        functionName: "withdraw",
        args: [amountWei],
      });

      const hash = await walletProvider.sendTransaction({ to: this.addresses.vaultAdapter, data });
      return `Submitted withdraw(${amountToSubmit}) via VaultAdapter. Tx hash: ${hash}. This is a submitted hash, not confirmation.`;
    } catch (error) {
      return `Error submitting withdraw: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  @CreateAction({
    name: "transfer",
    description:
      "Reassigns an RWA collateral position to another wallet via TransferAdapter. Reverts onchain if " +
      "the caller carries any outstanding debt, regardless of amount. Refuses (no transaction sent) on " +
      "BLOCK or REVIEW from the pre-check.",
    schema: TransferSchema,
  })
  async transfer(walletProvider: EvmWalletProvider, args: z.infer<typeof TransferSchema>): Promise<string> {
    const positionId = walletProvider.getAddress() as Address;
    const intent: AgentIntent = { asset: "TSLA", action: "TRANSFER", amount: args.amount, positionId };

    try {
      // `getAddress` both validates and checksums `args.to`. An LLM agent
      // extracting an address from free text has no reason to produce
      // EIP-55 checksummed casing -- viem's encodeFunctionData/ABI
      // encoding rejects a mixed-case address whose checksum doesn't
      // match rather than silently accepting it, so this must run before
      // that call, not just before the policy check.
      const to = getAddress(args.to);

      const check = await evaluateAgentIntent(this.readClient(walletProvider), intent);
      if (!isExecutable(check.decision)) {
        return `Refused: policy decision was ${check.decision} (reason: ${check.reason}). No transaction was sent.`;
      }

      const amountToSubmit = check.decision === "LIMIT" ? check.permittedAmount : args.amount;
      const amountWei = parseUnits(amountToSubmit, 18);

      const data = encodeFunctionData({
        abi: LedgerLineTransferAdapterAbi,
        functionName: "transfer",
        args: [to, amountWei],
      });

      const hash = await walletProvider.sendTransaction({ to: this.addresses.transferAdapter, data });
      return `Submitted transfer(${to}, ${amountToSubmit}) via TransferAdapter. Tx hash: ${hash}. This is a submitted hash, not confirmation.`;
    } catch (error) {
      return `Error submitting transfer: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/// Factory matching AgentKit's own convention (e.g. `erc20ActionProvider()`)
/// for registering this in an `actionProviders: [...]` array.
export function cortexRailsActionProvider(config?: CortexRailsActionProviderConfig): CortexRailsActionProvider {
  return new CortexRailsActionProvider(config);
}
