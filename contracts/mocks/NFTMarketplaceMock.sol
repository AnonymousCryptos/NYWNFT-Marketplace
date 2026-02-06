pragma solidity ^0.8.17;

import "../marketplace/NFTMarketplace.sol";

// Mock contract to adjust the state of the contract forcefully to create the desired scenario to test
contract NFTMarketplaceMock is NFTMarketplace {
    constructor(
        address _designatedToken,
        uint256 _primaryFee,
        uint256 _secondaryFee
    ) NFTMarketplace(_designatedToken, _primaryFee, _secondaryFee) {
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

    function updateListing(address collection, uint256 tokenId, address user) public {
        listings[collection][tokenId][user] = Listing({
            seller: user,
            price: 10,
            quantity: 1,
            listingType: ListingType.AUCTION,
            auctionId: 1
        });
    }
    function updateAuction(uint auctionId) public {
        auctions[auctionId] = AuctionDetails({
            seller: msg.sender,
            startPrice: 1,
            currentPrice: 1,
            minBidIncrement: 1,
            startTime: 100000000,
            endTime: 12000000000,
            tokenId: 1,
            quantity: 1,
            highestBidder: address(0),
            status: AuctionStatus.ACTIVE
        });

    }
}
