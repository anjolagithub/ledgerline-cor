//! Position Engine — Arbitrum Stylus.
//!
//! Stateless computation of economic position value. No persistent
//! storage. Called from Solidity via a plain view/staticcall.
//!
//! Fixed-point convention: raw_balance, price, and multiplier are all
//! 18-decimal fixed-point (1e18 = 1.0). Translating a specific token's
//! actual on-chain decimals into this convention is the adapter's job
//! (Phase 7), not this engine's — this keeps the engine RWA-agnostic.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

const FIXED_POINT_SCALE: u128 = 1_000_000_000_000_000_000; // 1e18

#[entrypoint]
#[storage]
pub struct PositionEngine;

#[public]
impl PositionEngine {
    /// positionValue = (rawBalance * price / 1e18) * multiplier / 1e18
    /// Division truncates (floors) — conservative for downstream capacity.
    pub fn compute_position_value(
        &self,
        raw_balance: U256,
        price: U256,
        multiplier: U256,
    ) -> Result<U256, Vec<u8>> {
        let scale = U256::from(FIXED_POINT_SCALE);

        let scaled_value = raw_balance
            .checked_mul(price)
            .ok_or_else(|| b"overflow: raw_balance * price".to_vec())?
            / scale;

        let position_value = scaled_value
            .checked_mul(multiplier)
            .ok_or_else(|| b"overflow: value * multiplier".to_vec())?
            / scale;

        Ok(position_value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    fn scale(n: u128) -> U256 {
        U256::from(n) * U256::from(FIXED_POINT_SCALE)
    }

    #[test]
    fn matches_spec_worked_example() {
        // Spec section 5: 1,000 AAPL Stock Tokens @ $200 = $200,000
        let vm = TestVM::default();
        let engine = PositionEngine::from(&vm);
        let value = engine
            .compute_position_value(scale(1000), scale(200), U256::from(FIXED_POINT_SCALE))
            .unwrap();
        assert_eq!(value, scale(200_000));
    }

    #[test]
    fn zero_price_yields_zero_value() {
        let vm = TestVM::default();
        let engine = PositionEngine::from(&vm);
        let value = engine
            .compute_position_value(scale(1000), U256::ZERO, U256::from(FIXED_POINT_SCALE))
            .unwrap();
        assert_eq!(value, U256::ZERO);
    }

    #[test]
    fn multiplier_below_one_scales_down() {
        // e.g. a 2-for-1 split represented as a 0.5x multiplier
        let vm = TestVM::default();
        let engine = PositionEngine::from(&vm);
        let half = U256::from(FIXED_POINT_SCALE / 2);
        let value = engine
            .compute_position_value(scale(1000), scale(200), half)
            .unwrap();
        assert_eq!(value, scale(100_000));
    }
}
