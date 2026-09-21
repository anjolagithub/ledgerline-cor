/// Financial actions a consuming protocol may request permission for.
/// Mirrors contracts/src/interfaces/LedgerLineTypes.sol's `Action` enum
/// exactly -- ordering matters, these are passed onchain as uint8.
export enum Action {
  BORROW = 0,
  WITHDRAW = 1,
  TRANSFER = 2,
  INCREASE_LEVERAGE = 3,
  LIQUIDATE = 4,
}

/// Policy decisions returned by canExecute. Mirrors LedgerLineTypes.sol's
/// `Decision` enum exactly. REVIEW has no MVP trigger today.
export enum Decision {
  ALLOW = 0,
  LIMIT = 1,
  REVIEW = 2,
  BLOCK = 3,
}

/// Mirrors LedgerLineTypes.sol's `LifecycleState` enum exactly.
export enum LifecycleState {
  ACTIVE = 0,
  RESTRICTED = 1,
  CORPORATE_ACTION = 2,
  SUSPENDED = 3,
  MATURING = 4,
  REDEEMABLE = 5,
  REDEEMED = 6,
}

/// Mirrors LedgerLineTypes.sol's `AssetState` struct, as returned by
/// Registry.getAssetState. `price` and `multiplier` are 18-decimal
/// fixed-point, matching PositionEngine/RiskEngine's convention.
export type AssetState = {
  price: bigint;
  multiplier: bigint;
  lifecycle: LifecycleState;
  collateralFactorBps: bigint;
  riskAdjustmentBps: bigint;
};

/// Mirrors LedgerLineTypes.sol's `Position` struct, as returned by
/// Registry.getPosition. `rawBalance` is an 18-decimal internal unit.
export type Position = {
  rawBalance: bigint;
};

/// Mirrors LedgerLineTypes.sol's `PolicyResponse` struct, as returned by
/// Policy.canExecute. `permittedAmount` is the maximum LedgerLine
/// permits -- it is NOT clamped to the requested amount, and callers
/// must enforce requestedAmount <= permittedAmount themselves.
/// `reason` is a machine-readable bytes32 (e.g. "OK", "NO_CAPACITY"),
/// not a display string.
export type PolicyResponse = {
  decision: Decision;
  permittedAmount: bigint;
  reason: `0x${string}`;
};
