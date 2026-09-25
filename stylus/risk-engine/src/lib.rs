//! Risk Engine — Arbitrum Stylus.
//!
//! Stateless computation of effective borrowing capacity. No persistent
//! storage. Called from Solidity via a plain view/staticcall.
//!
//! collateral_factor_bps and risk_adjustment_bps are basis points
//! (10,000 = 100%), matching the spec's own worked examples.
//!
//! Two margins, deliberately different:
//! - initial margin (borrowing):  value x collateral factor x risk adjustment
//! - maintenance margin (liquidation): value x collateral factor
//! Maintenance is always >= borrowing capacity, so a freshly-opened
//! position at full capacity is never immediately liquidatable -- the
//! risk adjustment is the buffer between the two.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

const BPS_DENOMINATOR: u128 = 10_000;

#[entrypoint]
#[storage]
pub struct RiskEngine;

#[public]
impl RiskEngine {
    /// capacity = (positionValue * collateralFactorBps / 10000)
    ///            * riskAdjustmentBps / 10000
    /// Division truncates (floors) — never rounds capacity up.
    pub fn compute_borrowing_capacity(
        &self,
        position_value: U256,
        collateral_factor_bps: U256,
        risk_adjustment_bps: U256,
    ) -> Result<U256, Vec<u8>> {
        let denom = U256::from(BPS_DENOMINATOR);

        let after_collateral = position_value
            .checked_mul(collateral_factor_bps)
            .ok_or_else(|| b"overflow: position_value * collateral_factor_bps".to_vec())?
            / denom;

        let capacity = after_collateral
            .checked_mul(risk_adjustment_bps)
            .ok_or_else(|| b"overflow: value * risk_adjustment_bps".to_vec())?
            / denom;

        Ok(capacity)
    }

    /// threshold = positionValue * collateralFactorBps / 10000
    /// The maintenance margin: the most debt a position can carry before
    /// it becomes eligible for liquidation. Division truncates (floors).
    pub fn compute_liquidation_threshold(
        &self,
        position_value: U256,
        collateral_factor_bps: U256,
    ) -> Result<U256, Vec<u8>> {
        let threshold = position_value
            .checked_mul(collateral_factor_bps)
            .ok_or_else(|| b"overflow: position_value * collateral_factor_bps".to_vec())?
            / U256::from(BPS_DENOMINATOR);
        Ok(threshold)
    }

    /// Liquidatable iff debt is STRICTLY above the maintenance threshold.
    /// Debt exactly at the threshold is not liquidatable.
    pub fn is_liquidatable(
        &self,
        position_value: U256,
        collateral_factor_bps: U256,
        debt: U256,
    ) -> Result<bool, Vec<u8>> {
        let threshold = self.compute_liquidation_threshold(position_value, collateral_factor_bps)?;
        Ok(debt > threshold)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    fn scale(n: u128) -> U256 {
        U256::from(n) * U256::from(1_000_000_000_000_000_000u128)
    }

    #[test]
    fn matches_spec_worked_example() {
        // Spec section 7: $200,000 x 70% x 80% = $112,000
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let capacity = engine
            .compute_borrowing_capacity(scale(200_000), U256::from(7000u32), U256::from(8000u32))
            .unwrap();
        assert_eq!(capacity, scale(112_000));
    }

    #[test]
    fn zero_collateral_factor_yields_zero_capacity() {
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let capacity = engine
            .compute_borrowing_capacity(scale(200_000), U256::ZERO, U256::from(8000u32))
            .unwrap();
        assert_eq!(capacity, U256::ZERO);
    }

    #[test]
    fn full_collateral_and_no_risk_adjustment_returns_full_value() {
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let capacity = engine
            .compute_borrowing_capacity(scale(200_000), U256::from(10_000u32), U256::from(10_000u32))
            .unwrap();
        assert_eq!(capacity, scale(200_000));
    }

    #[test]
    fn liquidation_threshold_matches_spec_example() {
        // $200,000 x 70% collateral factor = $140,000 maintenance threshold
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let threshold = engine
            .compute_liquidation_threshold(scale(200_000), U256::from(7000u32))
            .unwrap();
        assert_eq!(threshold, scale(140_000));
    }

    #[test]
    fn debt_below_threshold_is_not_liquidatable() {
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let liquidatable = engine
            .is_liquidatable(scale(200_000), U256::from(7000u32), scale(139_999))
            .unwrap();
        assert!(!liquidatable);
    }

    #[test]
    fn debt_exactly_at_threshold_is_not_liquidatable() {
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let liquidatable = engine
            .is_liquidatable(scale(200_000), U256::from(7000u32), scale(140_000))
            .unwrap();
        assert!(!liquidatable, "boundary is inclusive-safe: debt == threshold is not liquidatable");
    }

    #[test]
    fn debt_one_wei_above_threshold_is_liquidatable() {
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let liquidatable = engine
            .is_liquidatable(scale(200_000), U256::from(7000u32), scale(140_000) + U256::from(1u8))
            .unwrap();
        assert!(liquidatable);
    }

    #[test]
    fn zero_value_position_with_any_debt_is_liquidatable() {
        let vm = TestVM::default();
        let engine = RiskEngine::from(&vm);
        let liquidatable = engine
            .is_liquidatable(U256::ZERO, U256::from(7000u32), U256::from(1u8))
            .unwrap();
        assert!(liquidatable);
    }
}

#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;
    use stylus_sdk::testing::*;

    fn bounded_value() -> impl Strategy<Value = u128> {
        0u128..=1_000_000_000_000_000_000_000_000u128
    }

    // Valid bps range only -- see SECURITY.md finding: Registry now
    // enforces this onchain, so out-of-range bps should never reach the
    // engine in practice. This property documents the engine's own
    // behavior *within* that valid range.
    fn bounded_bps() -> impl Strategy<Value = u32> {
        0u32..=10_000u32
    }

    proptest! {
        #[test]
        fn never_panics(position_value in bounded_value(), collateral_bps in 0u32..=u32::MAX, risk_bps in 0u32..=u32::MAX) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let _ = engine.compute_borrowing_capacity(
                U256::from(position_value), U256::from(collateral_bps), U256::from(risk_bps)
            );
        }

        #[test]
        fn zero_collateral_factor_always_zero_capacity(position_value in bounded_value(), risk_bps in bounded_bps()) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let capacity = engine
                .compute_borrowing_capacity(U256::from(position_value), U256::ZERO, U256::from(risk_bps))
                .unwrap();
            prop_assert_eq!(capacity, U256::ZERO);
        }

        #[test]
        fn zero_risk_adjustment_always_zero_capacity(position_value in bounded_value(), collateral_bps in bounded_bps()) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let capacity = engine
                .compute_borrowing_capacity(U256::from(position_value), U256::from(collateral_bps), U256::ZERO)
                .unwrap();
            prop_assert_eq!(capacity, U256::ZERO);
        }

        #[test]
        fn capacity_never_exceeds_position_value_within_valid_bps(
            position_value in bounded_value(), collateral_bps in bounded_bps(), risk_bps in bounded_bps()
        ) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let capacity = engine
                .compute_borrowing_capacity(U256::from(position_value), U256::from(collateral_bps), U256::from(risk_bps))
                .unwrap();
            prop_assert!(capacity <= U256::from(position_value));
        }

        #[test]
        fn liquidation_never_panics(
            position_value in bounded_value(), collateral_bps in 0u32..=u32::MAX, debt in bounded_value()
        ) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let _ = engine.is_liquidatable(U256::from(position_value), U256::from(collateral_bps), U256::from(debt));
        }

        #[test]
        fn threshold_never_exceeds_position_value_within_valid_bps(
            position_value in bounded_value(), collateral_bps in bounded_bps()
        ) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let threshold = engine
                .compute_liquidation_threshold(U256::from(position_value), U256::from(collateral_bps))
                .unwrap();
            prop_assert!(threshold <= U256::from(position_value));
        }

        #[test]
        fn zero_debt_is_never_liquidatable(position_value in bounded_value(), collateral_bps in bounded_bps()) {
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let liquidatable = engine
                .is_liquidatable(U256::from(position_value), U256::from(collateral_bps), U256::ZERO)
                .unwrap();
            prop_assert!(!liquidatable);
        }

        #[test]
        fn maintenance_threshold_never_below_borrowing_capacity(
            position_value in bounded_value(), collateral_bps in bounded_bps(), risk_bps in bounded_bps()
        ) {
            // A position borrowed to full capacity must never be
            // immediately liquidatable.
            let vm = TestVM::default();
            let engine = RiskEngine::from(&vm);
            let capacity = engine
                .compute_borrowing_capacity(U256::from(position_value), U256::from(collateral_bps), U256::from(risk_bps))
                .unwrap();
            let threshold = engine
                .compute_liquidation_threshold(U256::from(position_value), U256::from(collateral_bps))
                .unwrap();
            prop_assert!(threshold >= capacity);
            prop_assert!(!engine
                .is_liquidatable(U256::from(position_value), U256::from(collateral_bps), capacity)
                .unwrap());
        }
    }
}
