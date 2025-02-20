pragma solidity ^0.8.17;

import "../core/BaseCollection.sol";

contract TestMinter is BaseCollection {
    function testMint(address collection, uint256 tokenId, uint256 quantity) external {
        // This will call _mintNFT directly through inheritance
        _mintNFT(tokenId, quantity);
    }
}