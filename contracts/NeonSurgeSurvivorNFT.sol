// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract NeonSurgeSurvivorNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    enum Tier { Common, Rare, Epic }

    struct TokenData {
        Tier tier;
        uint256 stageCleared;
    }

    mapping(uint256 => TokenData) public tokenData;

    constructor() ERC721("NeonXurge Survivor", "NXS") Ownable(msg.sender) {}

    function mint(address to, uint8 tier, uint256 stageCleared) public onlyOwner {
        require(tier <= 2, "Invalid tier");
        
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        
        tokenData[tokenId] = TokenData(Tier(tier), stageCleared);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ERC721: URI query for nonexistent token");
        
        TokenData memory data = tokenData[tokenId];
        string memory tierName = data.tier == Tier.Common ? "Common" : 
                                data.tier == Tier.Rare ? "Rare" : "Epic";

        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#0a0a0f"/>',
            '<text x="200" y="180" font-family="monospace" font-size="28" fill="#00f3ff" text-anchor="middle">NEONXURGE</text>',
            '<text x="200" y="220" font-family="monospace" font-size="18" fill="#ffffff" text-anchor="middle">SURVIVOR</text>',
            '<text x="200" y="270" font-family="monospace" font-size="16" fill="#ffd700" text-anchor="middle">', tierName, '</text>',
            '<text x="200" y="310" font-family="monospace" font-size="14" fill="#888888" text-anchor="middle">Stage ', Strings.toString(data.stageCleared), '</text>',
            '</svg>'
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"NeonXurge Survivor #', Strings.toString(tokenId),
            '","description":"Official survivor NFT from NeonXurge game.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Tier","value":"', tierName,
            '"},{"trait_type":"Stage Cleared","value":', Strings.toString(data.stageCleared), '}]}'
        ));

        return string(abi.encodePacked(
            'data:application/json;base64,', 
            Base64.encode(bytes(json))
        ));
    }
}
