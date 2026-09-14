//! Risk Engine — Arbitrum Stylus.
//!
//! Stateless computation of effective borrowing capacity. No persistent
//! storage. Called from Solidity via a plain view/staticcall.
//!
//! collateral_factor_bps and risk_adjustment_bps are basis points
//! (10,000 = 100%), matching the spec's own worked examples.

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
}
