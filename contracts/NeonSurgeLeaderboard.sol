// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * NEONXURGE LEADERBOARD (Sepolia Testnet)
 * 
 * Minimal event-based leaderboard.
 * - submitScore(score) → emits event
 * - Frontend (Wagmi + viem getLogs) collects recent events → client-side sort for Top 10
 *
 * DEPLOY INSTRUCTIONS (easiest):
 * 1. Go to https://remix.ethereum.org
 * 2. Create new file "NeonSurgeLeaderboard.sol", paste this entire file.
 * 3. Compile (Solidity 0.8.20+).
 * 4. Deploy & Run tab → Environment: "Injected Provider - MetaMask"
 * 5. Make sure MetaMask is on Sepolia testnet + you have test ETH (https://sepoliafaucet.com)
 * 6. Deploy → copy the deployed contract address.
 * 7. Paste address into app/lib/wagmi.ts → LEADERBOARD_ADDRESS
 *
 * That's it. Scores are now permanently on-chain via events.
 */
contract NeonSurgeLeaderboard {
    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 timestamp
    );

    /// @notice Anyone can submit a run score. Gas only (no token cost).
    function submitScore(uint256 score) external {
        require(score > 0, "Score must be positive");
        emit ScoreSubmitted(msg.sender, score, block.timestamp);
    }
}
