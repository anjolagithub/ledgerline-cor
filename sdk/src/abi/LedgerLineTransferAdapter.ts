// Copied verbatim from frontend/abi/LedgerLineTransferAdapter.json (produced by forge build + frontend/scripts/generate-abis.mjs). Do not hand-edit -- regenerate from the same source if the contract interface changes.
export const LedgerLineTransferAdapterAbi = [
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
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Transferred",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
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
    "name": "ExceedsPosition",
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
    "name": "NoPosition",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OutstandingDebtBlocksTransfer",
    "inputs": [
      {
        "name": "existingDebt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
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
  }
] as const;
