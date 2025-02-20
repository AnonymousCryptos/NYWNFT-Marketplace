pragma solidity ^0.8.17;

import "../marketplace/NFTMarketplace.sol";

contract ReentrancyAttacker {
    NFTMarketplace public marketplace;

    constructor(address _marketplace) {
        marketplace = NFTMarketplace(_marketplace);
    }

    function attack(address collection, uint256 tokenId, uint256 quantity) external {
        marketplace.buyNFT(collection, tokenId, quantity);
    }

    receive() external payable {
        // Try to reenter
        marketplace.buyNFT(msg.sender, 1, 1);
    }
}