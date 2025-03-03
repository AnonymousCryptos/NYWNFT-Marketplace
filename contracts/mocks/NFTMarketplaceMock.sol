pragma solidity ^0.8.17;

import "../marketplace/NFTMarketplace.sol";

contract NFTMarketplaceMock is NFTMarketplace {
    constructor(
        address _designatedToken,
        uint256 _primaryFee,
        uint256 _secondaryFee,
        uint256 _maxRoyaltyPercentage
    ) NFTMarketplace(_designatedToken, _primaryFee, _secondaryFee, _maxRoyaltyPercentage) {
        // _mint(msg.sender, initialSupply);
    }
    function updateAuctionStatus(uint256 _auctionId, bool isEnded) public {
        AuctionDetails storage auction = auctions[_auctionId];
        if(isEnded) {
            auction.status =AuctionStatus.ENDED;
        } else {
            auction.status =AuctionStatus.ACTIVE;
        }
        

    }
    function updateAuctionCollections(uint256 auctionId,address _collection) public {
        auctionCollections[auctionId] = _collection;
    }
    function registerCollectionMock(address collection) external {
        registeredCollections[collection] = true;
    }
}