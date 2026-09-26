import {
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  createPublicClient,
  erc20Abi,
  http,
} from "viem";
import {
  LedgerLineLendingAdapterAbi,
  LedgerLinePolicyAbi,
  LedgerLineRegistryAbi,
  LedgerLineVaultAdapterAbi,
  LedgerLineTransferAdapterAbi,
  LedgerLineLiquidationAdapterAbi,
} from "./abi";
import { ROBINHOOD_TESTNET_ADDRESSES, type LedgerLineAddresses } from "./addresses";
import { robinhoodChainTestnet } from "./chain";
import { Action, type AssetState, type PolicyResponse, type Position } from "./types";

export type LedgerLineClientConfig = {
  /// Chain to connect to. Defaults to Robinhood Chain testnet (46630).
  chain?: Chain;
  /// Convenience: builds a default (http) publicClient against this RPC
  /// URL. Ignored if `publicClient` is provided.
  rpcUrl?: string;
  /// Bring your own viem PublicClient (e.g. with a custom transport).
  /// Takes priority over `rpcUrl`.
  publicClient?: PublicClient;
  /// Required for write methods (deposit/borrow/withdraw/
  /// approveCollateral). Read methods work without it.
  walletClient?: WalletClient;
  /// Override any of the six contract addresses. Defaults to the real
  /// V4 testnet deployment (see ./addresses.ts).
  addresses?: Partial<LedgerLineAddresses>;
  /// Default assetId used when a method's `assetId` argument is
  /// omitted. Defaults to 1n, matching this deployment's single
  /// configured asset (TSLA).
  assetId?: bigint;
};

export type WriteOptions = {
  /// Overrides the account used to sign this call. Defaults to
  /// `walletClient.account`.
  account?: Address;
};

/// LedgerLineClient -- a thin, typed wrapper over CortexRails Protocol's
/// real deployed LedgerLine contracts (Registry, Policy, LendingAdapter,
/// VaultAdapter, TransferAdapter, LiquidationAdapter), built on viem.
///
/// AMOUNT CONVENTION (read this before calling any write method):
/// every `amount` parameter on this client -- deposit, borrow,
/// withdraw, transfer, and canExecute -- is an 18-decimal internal unit,
/// matching CortexRails' own accounting convention (PositionEngine /
/// RiskEngine / LedgerLineLendingAdapter all use this same
/// convention internally). This is true regardless of any individual
/// token's real onchain decimals: TSLA (the collateral token) happens
/// to already be 18-decimal, so deposit/withdraw amounts map directly
/// to literal token units. USDG (the borrow token on testnet) is
/// 6-decimal onchain, but LedgerLineLendingAdapter.borrow() scales the
/// 18-decimal `amount` you pass down to USDG's real decimals
/// internally, at the point of the final token transfer, and nowhere
/// else. Callers of this SDK must NEVER pre-scale amounts themselves --
/// doing so would double-apply the scaling the adapter already does.
/// (A decimal mismatch here was a real bug once already, fixed
/// directly in the contracts -- see LedgerLineLendingAdapter.sol's
/// DECIMAL HANDLING doc comment.)
///
/// CONFIRMATION: every write method returns a transaction hash as soon
/// as it is submitted -- NOT once it is confirmed. A hash alone does
/// not mean the action succeeded, or even that it will be included.
/// Always call `waitForReceipt(hash)` (or your own polling/confirmation
/// logic) before treating a deposit/borrow/withdraw as final.
export class LedgerLineClient {
  readonly chain: Chain;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  readonly addresses: LedgerLineAddresses;
  readonly assetId: bigint;

  constructor(config: LedgerLineClientConfig = {}) {
    this.chain = config.chain ?? robinhoodChainTestnet;
    this.publicClient =
      config.publicClient ??
      (createPublicClient({
        chain: this.chain,
        transport: http(config.rpcUrl),
      }) as PublicClient);
    this.walletClient = config.walletClient;
    this.addresses = { ...ROBINHOOD_TESTNET_ADDRESSES, ...config.addresses };
    this.assetId = config.assetId ?? 1n;
  }

  /// The onchain convention every LedgerLine consumer contract uses to
  /// derive a positionId from a user address: uint256(uint160(address)).
  /// SDK users should never need to reimplement this themselves.
  static positionIdFromAddress(address: Address): bigint {
    return BigInt(address);
  }

  private requireWalletClient(): WalletClient {
    if (!this.walletClient) {
      throw new Error(
        "LedgerLineClient: this method requires a walletClient to sign and submit a transaction, " +
          "but none was configured. Pass `walletClient` in the LedgerLineClient constructor config."
      );
    }
    return this.walletClient;
  }

  private resolveAccount(walletClient: WalletClient, options?: WriteOptions): Address {
    const account = options?.account ?? walletClient.account?.address;
    if (!account) {
      throw new Error(
        "LedgerLineClient: no account available to sign this transaction. Configure walletClient with " +
          "an account, or pass { account } to this call."
      );
    }
    return account;
  }

  // -----------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------

  async getAssetState(assetId: bigint = this.assetId): Promise<AssetState> {
    const result = await this.publicClient.readContract({
      address: this.addresses.registry,
      abi: LedgerLineRegistryAbi,
      functionName: "getAssetState",
      args: [assetId],
    });
    return result as unknown as AssetState;
  }

  async getPosition(positionId: bigint, assetId: bigint = this.assetId): Promise<Position> {
    const result = await this.publicClient.readContract({
      address: this.addresses.registry,
      abi: LedgerLineRegistryAbi,
      functionName: "getPosition",
      args: [assetId, positionId],
    });
    return result as unknown as Position;
  }

  /// Mirrors Policy.canExecute exactly -- `amount` is an 18-decimal
  /// internal unit, per this client's class-level amount convention.
  async canExecute(
    positionId: bigint,
    action: Action,
    amount: bigint,
    assetId: bigint = this.assetId
  ): Promise<PolicyResponse> {
    const result = await this.publicClient.readContract({
      address: this.addresses.policy,
      abi: LedgerLinePolicyAbi,
      functionName: "canExecute",
      args: [assetId, positionId, action, amount],
    });
    return result as unknown as PolicyResponse;
  }

  // -----------------------------------------------------------------
  // Writes -- LendingAdapter (deposit, borrow)
  // -----------------------------------------------------------------

  /// Approves LendingAdapter to pull `amount` of the collateral token
  /// (TSLA) from the caller -- required once before the first
  /// deposit(). Reads the real collateral token address from
  /// LendingAdapter.collateralToken() rather than assuming it, and
  /// calls its standard ERC20 approve() via viem's canonical erc20Abi
  /// (not a hand-written interface).
  async approveCollateral(amount: bigint, options?: WriteOptions): Promise<Hash> {
    const walletClient = this.requireWalletClient();
    const account = this.resolveAccount(walletClient, options);

    const collateralToken = (await this.publicClient.readContract({
      address: this.addresses.lendingAdapter,
      abi: LedgerLineLendingAdapterAbi,
      functionName: "collateralToken",
    })) as Address;

    return walletClient.writeContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.addresses.lendingAdapter, amount],
      account,
      chain: this.chain,
    });
  }

  /// Deposits `amount` (18-decimal, see class doc) of collateral (TSLA)
  /// via LendingAdapter.deposit(). Requires a prior approveCollateral()
  /// call covering at least `amount`. Returns a tx hash -- not
  /// confirmation; see waitForReceipt.
  async deposit(amount: bigint, options?: WriteOptions): Promise<Hash> {
    const walletClient = this.requireWalletClient();
    const account = this.resolveAccount(walletClient, options);

    return walletClient.writeContract({
      address: this.addresses.lendingAdapter,
      abi: LedgerLineLendingAdapterAbi,
      functionName: "deposit",
      args: [amount],
      account,
      chain: this.chain,
    });
  }

  /// Borrows `amount` (18-decimal internal unit, see class doc) via
  /// LendingAdapter.borrow(). The adapter independently calls
  /// Policy.canExecute() and reverts if the decision is BLOCK, or if
  /// the requested amount (plus existing debt) exceeds the permitted
  /// capacity -- this SDK does not pre-check that for you. Real USDG
  /// decimal scaling for the actual token transfer happens inside the
  /// adapter; never scale `amount` yourself. Returns a tx hash -- not
  /// confirmation; see waitForReceipt.
  async borrow(amount: bigint, options?: WriteOptions): Promise<Hash> {
    const walletClient = this.requireWalletClient();
    const account = this.resolveAccount(walletClient, options);

    return walletClient.writeContract({
      address: this.addresses.lendingAdapter,
      abi: LedgerLineLendingAdapterAbi,
      functionName: "borrow",
      args: [amount],
      account,
      chain: this.chain,
    });
  }

  // -----------------------------------------------------------------
  // Writes -- VaultAdapter (withdraw)
  // -----------------------------------------------------------------

  /// Withdraws `amount` (18-decimal, see class doc) of previously
  /// deposited collateral (TSLA) via VaultAdapter.withdraw(). This is
  /// CortexRails' second, independent real consumer of the same
  /// Policy/Registry -- it makes its own canExecute() call with
  /// Action.WITHDRAW (evaluated on lifecycle state, not borrowing
  /// capacity) and, only after a non-BLOCK decision, releases the
  /// already-custodied collateral back to the caller via
  /// LendingAdapter.releaseCollateral(). Returns a tx hash -- not
  /// confirmation; see waitForReceipt.
  async withdraw(amount: bigint, options?: WriteOptions): Promise<Hash> {
    const walletClient = this.requireWalletClient();
    const account = this.resolveAccount(walletClient, options);

    return walletClient.writeContract({
      address: this.addresses.vaultAdapter,
      abi: LedgerLineVaultAdapterAbi,
      functionName: "withdraw",
      args: [amount],
      account,
      chain: this.chain,
    });
  }

  // -----------------------------------------------------------------
  // Writes -- TransferAdapter (transfer)
  // -----------------------------------------------------------------

  /// Reassigns `amount` (18-decimal, see class doc) of the caller's
  /// position to `to` via TransferAdapter.transfer(). This is
  /// CortexRails' third, independent real consumer of the same
  /// Policy/Registry -- it makes its own canExecute() call with
  /// Action.TRANSFER (evaluated on lifecycle state, not borrowing
  /// capacity, exactly like WITHDRAW) and, only after a non-BLOCK
  /// decision, reassigns the already-custodied collateral's Registry
  /// position from the caller to `to` via
  /// LendingAdapter.transferPosition() -- no tokens move. The adapter
  /// also reverts outright if the caller carries ANY outstanding
  /// LendingAdapter debt, regardless of amount: unlike VaultAdapter's
  /// remaining-capacity check, there is no recomputation here, because
  /// the collateral is changing owners entirely. Returns a tx hash --
  /// not confirmation; see waitForReceipt.
  async transfer(to: Address, amount: bigint, options?: WriteOptions): Promise<Hash> {
    const walletClient = this.requireWalletClient();
    const account = this.resolveAccount(walletClient, options);

    return walletClient.writeContract({
      address: this.addresses.transferAdapter,
      abi: LedgerLineTransferAdapterAbi,
      functionName: "transfer",
      args: [to, amount],
      account,
      chain: this.chain,
    });
  }

  // -----------------------------------------------------------------
  // Reads -- debt / liquidation eligibility
  // -----------------------------------------------------------------

  /// Reads a user's current outstanding debt (18-decimal internal
  /// unit, see class doc) directly from LendingAdapter.debt(). This is
  /// the same figure LiquidationAdapter supplies to Policy.canExecute
  /// as the LIQUIDATE `amount` -- use it to pre-check eligibility via
  /// `checkLiquidatable` before submitting a real liquidate() call.
  async getDebt(user: Address): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.addresses.lendingAdapter,
      abi: LedgerLineLendingAdapterAbi,
      functionName: "debt",
      args: [user],
    });
    return result as bigint;
  }

  /// Convenience wrapper matching exactly what LiquidationAdapter does
  /// onchain before calling liquidate(): reads `user`'s live debt, then
  /// asks Policy.canExecute(assetId, positionId, Action.LIQUIDATE,
  /// debt). ALLOW means a real liquidate() call against
  /// LiquidationAdapter is expected to succeed (modulo a race with
  /// another liquidator or a price update in between) -- BLOCK means
  /// the position is currently healthy (or debt is zero), per whatever
  /// `reason` is returned.
  async checkLiquidatable(user: Address, assetId: bigint = this.assetId): Promise<PolicyResponse & { debt: bigint }> {
    const debt = await this.getDebt(user);
    const positionId = LedgerLineClient.positionIdFromAddress(user);
    const response = await this.canExecute(positionId, Action.LIQUIDATE, debt, assetId);
    return { ...response, debt };
  }

  // -----------------------------------------------------------------
  // Writes -- LiquidationAdapter (liquidate)
  // -----------------------------------------------------------------

  /// Liquidates `borrower`'s position: LiquidationAdapter derives
  /// their real, live debt from LendingAdapter itself (never trust a
  /// caller-supplied debt figure for the eligibility check -- this SDK
  /// does not pass one), asks Policy.canExecute() with
  /// Action.LIQUIDATE, and -- only on ALLOW -- calls
  /// LendingAdapter.liquidate() to pull `repayAmount` (18-decimal, see
  /// class doc) from the caller and pay them `seizeAmount` of the
  /// borrower's collateral in return. Reverts with PolicyBlocked if
  /// the position is not currently eligible. Permissionless: any
  /// account can call this for any borrower. The caller is responsible
  /// for choosing a `seizeAmount` that is a fair exchange for
  /// `repayAmount` (using live price data) and must have already
  /// approved LendingAdapter to pull at least `repayAmount` of the
  /// borrow token (USDG) -- see `approveCollateral` for the analogous
  /// pattern on the collateral side. Returns a tx hash -- not
  /// confirmation; see waitForReceipt.
  async liquidate(
    borrower: Address,
    repayAmount: bigint,
    seizeAmount: bigint,
    options?: WriteOptions
  ): Promise<Hash> {
    const walletClient = this.requireWalletClient();
    const account = this.resolveAccount(walletClient, options);

    return walletClient.writeContract({
      address: this.addresses.liquidationAdapter,
      abi: LedgerLineLiquidationAdapterAbi,
      functionName: "liquidate",
      args: [borrower, repayAmount, seizeAmount],
      account,
      chain: this.chain,
    });
  }

  // -----------------------------------------------------------------
  // Confirmation
  // -----------------------------------------------------------------

  /// Waits for and returns the transaction receipt for `hash`. This is
  /// the ONLY way to know whether a submitted deposit/borrow/withdraw
  /// actually succeeded -- a returned hash on its own is not
  /// confirmation, and a transaction can still revert, be dropped, or
  /// sit pending indefinitely.
  async waitForReceipt(hash: Hash): Promise<TransactionReceipt> {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
