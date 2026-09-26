// Copied verbatim from frontend/abi/LedgerLineLiquidationAdapter.ts (produced by forge build + frontend/scripts/generate-abis.mjs). Do not hand-edit -- regenerate from the same source if the contract interface changes.
export const LedgerLineLiquidationAdapterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "registryAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "policyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "lendingAdapterAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assetId_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "assetId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lendingAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract LedgerLineLendingAdapter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liquidate",
    "inputs": [
      {
        "name": "borrower",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "repayAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "seizeAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "policy",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ILedgerLinePolicy"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ILedgerLineRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Liquidated",
    "inputs": [
      {
        "name": "borrower",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "liquidator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "repayAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "seizeAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "debtAtLiquidation",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AssetNotInitialized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoDebt",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoPosition",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PolicyBlocked",
    "inputs": [
      {
        "name": "reason",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "RepayExceedsDebt",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "available",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SeizeExceedsPosition",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "available",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  }
] as const;
