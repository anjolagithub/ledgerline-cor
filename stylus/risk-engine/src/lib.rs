//! Risk Engine — Arbitrum Stylus.
//!
//! Stateless computation of effective borrowing capacity. No persistent
//! storage. Called from Solidity via a plain view/staticcall.
//!
//! Phase 1 status: contract-facing signature only. Business logic lands
//! in Phase 2 — do not add computation here until that phase starts.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

#[entrypoint]
#[storage]
pub struct RiskEngine {}

#[public]
impl RiskEngine {
    /// Computes effective borrowing capacity.
    ///
    /// - `position_value`: economic position value (from Position Engine).
    /// - `collateral_factor_bps`: base collateral factor, in basis points.
    /// - `risk_adjustment_bps`: risk adjustment, in basis points.
    ///
    /// Returns the effective borrowing capacity.
    pub fn compute_borrowing_capacity(
        &self,
        position_value: U256,
        collateral_factor_bps: U256,
        risk_adjustment_bps: U256,
    ) -> Result<U256, Vec<u8>> {
        let _ = (position_value, collateral_factor_bps, risk_adjustment_bps);
        unimplemented!("Phase 2: Risk Engine business logic")
    }
}
