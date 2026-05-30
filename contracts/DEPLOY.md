# NeonXurge Blockchain Contracts - Sepolia Deployment

## Quick Deploy (Recommended: Remix - 5 minutes)

1. Open https://remix.ethereum.org
2. In the File Explorer, create two new files:
   - `NeonSurgeLeaderboard.sol`
   - `NeonSurgeSurvivorNFT.sol`
3. Copy the full content of each `.sol` from this folder into the files.
4. Go to **Solidity Compiler** tab:
   - Use compiler **0.8.20 or higher**
   - For `NeonSurgeSurvivorNFT.sol`: In **Advanced Configuration**, enable **"Via IR"** (this is required on 0.8.20+ due to the on-chain SVG construction).
5. Go to **Deploy & Run Transactions**:
   - Environment: **Injected Provider - MetaMask**
   - Make sure your MetaMask is connected to **Sepolia** testnet
   - Get test ETH if needed: https://sepoliafaucet.com or https://faucets.chain.link/sepolia
6. Deploy `NeonSurgeLeaderboard` first → copy the contract address.
7. Deploy `NeonSurgeSurvivorNFT` → copy the address.
8. Open `app/lib/wagmi.ts` and replace the placeholder addresses with the deployed ones:
   ```ts
   export const LEADERBOARD_ADDRESS = '0xfcb5c08c35db113ab220b8507ee815f872dbafde';
   export const NFT_ADDRESS = '0x8160a9c85ab394ea22a67ee9bf7512beef99cf35';
   ```
9. Save. Hard refresh the dev server (`npm run dev`).

## After Deployment

- Any player with a Sepolia wallet can call `submitScore` (costs ~30-50k gas).
- `mint(to, tier, stageCleared)` is restricted to the contract owner only (see game UI for owner-only minting flow).
- All data is permanent on Sepolia. Leaderboard uses events (free to emit).
- NFT images are fully on-chain SVG (beautiful glowing badges).

## Testing Flow (as per user request)

1. Run the game → Connect Wallet (MetaMask on Sepolia)
2. Play and beat bosses / reach Stage 10
3. After boss or Stage Clear, use the new **LEADERBOARD** button → Submit Score (real tx)
4. Open Leaderboard screen → it will fetch the on-chain events and show top scores
5. If you cleared Stage 10 or had high score → **NFT COLLECTION** → Mint button appears → mint real NFT
6. Success modal shows tx hash + link to https://sepolia.etherscan.io

## Notes

- Public RPC is used (may be slow during high load). For smoother experience later, add an Alchemy key to the wagmi transport.
- The game fully works offline / without wallet. Blockchain features are 100% optional.
- Never use a real mainnet private key here.

Enjoy the on-chain cyberpunk glory.

---

## Deploying NeonShard (NSH) – ERC-20 Token

**Neon Shard (NSH)** is the main in-game currency of NeonXurge.

### Token Details
- **Name**: Neon Shard
- **Symbol**: NSH
- **Decimals**: 18
- **Total Supply**: 1,000,000,000 NSH (1 Billion) — all pre-minted to the deployer
- **Features**:
  - Owner-only `mint()` function (for future game rewards)
  - Public `burn()` function (token sink)
  - Owner `burnFrom()` for administrative control

### Quick Deploy via Remix (Recommended)

1. Open https://remix.ethereum.org
2. In the File Explorer, create a new file called `NeonShard.sol`
3. Copy the entire content of `contracts/NeonShard.sol` into the new file.
4. Go to the **Solidity Compiler** tab:
   - Make sure you're using **Solidity 0.8.20 or higher**.
   - Enable **Auto-compile** (recommended).
5. Go to the **Deploy & Run Transactions** tab:
   - Set **Environment** to **Injected Provider - MetaMask**
   - Confirm you're connected to **Sepolia** testnet
   - Ensure you have test ETH (use https://sepoliafaucet.com if needed)
6. In the contract dropdown, select **NeonShard**.
7. Click **Deploy**.
8. Confirm the transaction in MetaMask.
9. Once deployed, copy the contract address from the Deployed Contracts section.

### After Deployment

- The full 1 billion NSH supply will appear in your wallet (you are the initial owner).
- You (as owner) can call `mint()` to create more tokens for game rewards.
- Players can call `burn()` on their own tokens.
- You can later transfer ownership to a game treasury or reward contract using `transferOwnership()`.

### Recommended Next Steps (Future Integration)

Once the game integrates the NSH token, you will need to:
1. Add the deployed address to `app/lib/wagmi.ts`:
   ```ts
   export const NEON_SHARD_ADDRESS = '0xYourNeonShardAddressHere...';
   ```
2. Add the ERC-20 ABI for NSH.
3. Build game features that use NSH (rewards, shop, staking, etc.).

### Alternative: Deploy with Foundry (Advanced)

If you prefer Foundry:

```bash
# Install OpenZeppelin contracts (if not already)
forge install OpenZeppelin/openzeppelin-contracts

# Compile
forge build

# Deploy to Sepolia (replace with your private key)
forge create contracts/NeonShard.sol:NeonShard \
  --rpc-url https://rpc.sepolia.org \
  --private-key $PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_KEY
```

---

**Important**: The NeonShard contract uses OpenZeppelin imports. In Remix, these are resolved automatically when you compile. If you see import errors, make sure the OpenZeppelin plugin is enabled in Remix settings.
