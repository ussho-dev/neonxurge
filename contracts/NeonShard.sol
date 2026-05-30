// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Neon Shard (NSH)
 * @author NeonXurge Team
 * @notice The main in-game currency token for NeonXurge.
 *
 * @dev This is a standard ERC-20 token with owner-controlled minting.
 *      It follows OpenZeppelin best practices for security and standards compliance.
 *
 * Token Details:
 * - Name: Neon Shard
 * - Symbol: NSH
 * - Decimals: 18 (standard)
 * - Initial Total Supply: 1,000,000,000 NSH (1 Billion)
 *   → Entire supply is minted to the deployer upon contract creation.
 *
 * Key Features:
 * - `mint(address to, uint256 amount)`: Only the contract owner can mint new tokens.
 *   This allows the game backend / smart contracts to reward players.
 * - `burn(uint256 amount)`: Any token holder can burn their own tokens (token sink).
 * - `burnFrom(address account, uint256 amount)`: Owner can burn tokens from any address
 *   (useful for game mechanics, penalties, or economy balancing).
 *
 * Security:
 * - Uses OpenZeppelin's audited ERC20 and Ownable contracts.
 * - Ownership can be transferred or renounced after deployment if desired.
 */
contract NeonShard is ERC20, Ownable {
    /// @notice Initial supply of 1 billion NSH with 18 decimals
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    /**
     * @dev Constructor that mints the entire initial supply to the deployer.
     */
    constructor() ERC20("Neon Shard", "NSH") Ownable(msg.sender) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @notice Mints new NSH tokens to a specified address.
     * @dev Only the contract owner can call this function.
     *      Intended primarily for distributing game rewards.
     *
     * @param to The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint (in wei, i.e. with 18 decimals).
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burns NSH tokens from the caller's balance.
     * @dev Any holder can burn their own tokens. This is useful as a token sink
     *      in the game economy (e.g. crafting, upgrades, entry fees).
     *
     * @param amount The amount of tokens to burn (in wei).
     */
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    /**
     * @notice Burns NSH tokens from any address.
     * @dev Only the contract owner can call this. Useful for admin-controlled
     *      sinks or recovering tokens in special game scenarios.
     *
     * @param account The address whose tokens will be burned.
     * @param amount The amount of tokens to burn (in wei).
     */
    function burnFrom(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }
}
