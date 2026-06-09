import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Sepolia testnet config - works with MetaMask (injected)
// Uses public RPC (rate-limited, fine for testing). For production use Alchemy/Infura.
export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected(), // MetaMask / browser wallets
  ],
  transports: {
    [sepolia.id]: http(), // public Sepolia RPC
  },
  ssr: true, // Next.js app router friendly
});

// Contract addresses - UPDATE THESE AFTER YOU DEPLOY ON SEPOLIA (via Remix or Hardhat)
// See /contracts folder for the .sol source + Remix deploy instructions.
export const LEADERBOARD_ADDRESS = '0xfcb5c08c35db113ab220b8507ee815f872dbafde'; // Deployed Leaderboard (unchanged)
export const NFT_ADDRESS = '0x8160a9c85ab394ea22a67ee9bf7512beef99cf35'; // Deployed NeonXurge Survivor NFT (unchanged)

// Set to true ONLY for fully local/demo testing with no real contracts
export const IS_DEMO_MODE = false;


// Minimal ABIs (event-based leaderboard + simple ERC-721 with tiered mint)
export const LEADERBOARD_ABI = [
  {
    "type": "function",
    "name": "submitScore",
    "inputs": [{ "name": "score", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ScoreSubmitted",
    "inputs": [
      { "name": "player", "type": "address", "indexed": true },
      { "name": "score", "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint256", "indexed": false }
    ]
  }
] as const;

export const NFT_ABI = [
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "tier", "type": "uint8" },
      { "name": "stageCleared", "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenData",
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "outputs": [
      { "name": "tier", "type": "uint8" },
      { "name": "stageCleared", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ownerOf",
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenURI",
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      { "name": "from", "type": "address", "indexed": true },
      { "name": "to", "type": "address", "indexed": true },
      { "name": "tokenId", "type": "uint256", "indexed": true }
    ]
  }
] as const;

// Tier labels for UI (matches new contract enum: 0=Common, 1=Rare, 2=Epic)
export const NFT_TIERS = {
  0: { label: 'COMMON', color: '#00f9ff', desc: 'Stage 10 Clear' },
  1: { label: 'RARE', color: '#c026ff', desc: 'High Score or Strong Clear' },
  2: { label: 'EPIC', color: '#ff2a6d', desc: 'Legendary Run' },
} as const;

export type NFTTier = 0 | 1 | 2;

// ==================== TOKEN SYSTEM (New Structure) ====================
// NS     = Neon Shards          → Soft / In-game currency (local only, earned via play)
// $NXG   = NeonXurge            → Governance + Staking token (future features: voting, staking rewards)
// $XURGE = Xurge                → Play-to-Earn + Utility token (NFT minting, upgrades, events, real rewards)

export const XURGE_ADDRESS = '0x79fd542116317111101630a8bcfab096ac219b7b' as const; // Current deployed utility token (previously labeled NSH)

// Placeholder for future $NXG governance token (not yet deployed)
export const NXG_ADDRESS = '' as const; // TODO: Deploy $NXG governance token and update here

// Minimal ERC-20 ABI (sufficient for balance, transfer, and basic info)
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }
] as const;
