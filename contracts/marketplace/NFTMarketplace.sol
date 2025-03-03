// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ICollection.sol";

contract NFTMarketplace is Ownable, ReentrancyGuard, ERC1155Holder {
    enum ListingType { FIXED_PRICE, AUCTION }
    enum AuctionStatus { ACTIVE, ENDED, CANCELLED }
    struct Listing {
        address seller;
        uint256 price;
        uint256 quantity;
        ListingType listingType;
        uint256 auctionId;  // 0 for fixed price listings
    }

    struct AuctionDetails {
        address seller;
        uint256 startPrice;
        uint256 currentPrice;
        uint256 minBidIncrement;
        uint256 startTime;
        uint256 endTime;
        uint256 tokenId;
        uint256 quantity;
        address highestBidder;
        AuctionStatus status;
    }
    
    uint256 public primaryFee;
    uint256 public secondaryFee;
    uint256 public maxRoyaltyPercentage;
    address public collectionFactory;
    uint256 public totalCollections;
    IERC20 public immutable designatedToken;

    uint256 private _auctionIds;
    uint256 public minAuctionDuration;
    uint256 public maxAuctionDuration;
    uint256 public auctionExtensionInterval;
    
    mapping(address => mapping(uint256 => mapping(address => Listing))) public listings;
    mapping(address => bool) public registeredCollections;
    mapping(uint256 => address) private collectionIndex;
    mapping(uint256 => AuctionDetails) public auctions;
    mapping(uint256 => mapping(address => uint256)) public bids;
    mapping(uint256 => address) public auctionCollections;
    
    event NFTListed(
        address indexed collection, 
        uint256 indexed tokenId, 
        address seller, 
        uint256 price, 
        uint256 quantity,
        ListingType listingType,
        uint256 auctionId
    );
    event NFTSold(address indexed collection, uint256 indexed tokenId, address seller, address buyer, uint256 price, uint256 quantity);
    event ListingRemoved(address indexed collection, uint256 indexed tokenId, address seller);
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed collection,
        uint256 indexed tokenId,
        address seller,
        uint256 startPrice,
        uint256 minBidIncrement,
        uint256 startTime,
        uint256 endTime,
        uint256 quantity
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed auctionId);
    event AuctionExtended(uint256 indexed auctionId, uint256 newEndTime);

    event FeeUpdated(bool isPrimary, uint256 newFee);
    event MaxRoyaltyUpdated(uint256 newMaxRoyalty);
    event CollectionRegistered(address indexed collection);
    event AuctionExtensionIntervalUpdated(uint256 newInterval);
    
    constructor(
        address _designatedToken,
        uint256 _primaryFee,
        uint256 _secondaryFee,
        uint256 _maxRoyaltyPercentage
    ) {
        require(_designatedToken != address(0), "Invalid token address");
        require(_primaryFee <= 1000, "Primary fee too high");
        require(_secondaryFee <= 1000, "Secondary fee too high");
        require(_maxRoyaltyPercentage <= 1000, "Max royalty too high");
        
        designatedToken = IERC20(_designatedToken);
        primaryFee = _primaryFee;
        secondaryFee = _secondaryFee;
        maxRoyaltyPercentage = _maxRoyaltyPercentage;
        minAuctionDuration = 1 hours;
        maxAuctionDuration = 30 days;
        auctionExtensionInterval = 10 minutes;
    }
    
    function setCollectionFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "Invalid factory address");
        collectionFactory = _factory;
    }

    function registerCollection(address collection) external {
        require(msg.sender == collectionFactory, "Only factory can register");
        require(collection != address(0), "Invalid collection address");
        require(!registeredCollections[collection], "Already registered");
        
        registeredCollections[collection] = true;
        collectionIndex[totalCollections] = collection;
        totalCollections++;
        
        emit CollectionRegistered(collection);
    }
    
    function setPrimaryFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1000, "Fee too high");
        primaryFee = _fee;
        emit FeeUpdated(true, _fee);
    }
    
    function setSecondaryFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1000, "Fee too high");
        secondaryFee = _fee;
        emit FeeUpdated(false, _fee);
    }
    
    function setMaxRoyaltyPercentage(uint256 _maxRoyalty) external onlyOwner {
        require(_maxRoyalty <= 1000, "Max royalty too high");
        maxRoyaltyPercentage = _maxRoyalty;
        emit MaxRoyaltyUpdated(_maxRoyalty);
    }
    
    function buyNFT(
        address collection,
        uint256 tokenId,
        uint256 quantity
    ) external nonReentrant {
        require(registeredCollections[collection], "Collection not registered");
        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(tokenId);
        require(nftDetails.maxSupply > 0, "NFT does not exist");
        
        uint256 totalPrice = nftDetails.price * quantity;
        uint256 platformFee = (totalPrice * primaryFee) / 1000;
        uint256 creatorFee = (totalPrice * nftDetails.royaltyPercentage) / 1000;
        uint256 sellerAmount = totalPrice - platformFee - creatorFee;
        
        designatedToken.transferFrom(msg.sender, address(this), platformFee);
        designatedToken.transferFrom(msg.sender, nftDetails.creator, creatorFee);
        designatedToken.transferFrom(msg.sender, nftDetails.creator, sellerAmount);
        
        ICollection(collection).mintNFT(tokenId, quantity);
        
        emit NFTSold(collection, tokenId, nftDetails.creator, msg.sender, nftDetails.price, quantity);
    }
    
     function listNFT(
        address collection,
        uint256 tokenId,
        uint256 price,
        uint256 quantity
    ) external nonReentrant {
        require(registeredCollections[collection], "Collection not registered");
        require(price > 0, "Invalid price");
        require(quantity > 0, "Invalid quantity");
        require(
            IERC1155(collection).balanceOf(msg.sender, tokenId) >= quantity,
            "Insufficient balance"
        );

        // Check if NFT is already listed by this seller
        Listing storage existingListing = listings[collection][tokenId][msg.sender];
        require(
            existingListing.quantity == 0 || 
            (existingListing.listingType == ListingType.AUCTION && 
             auctions[existingListing.auctionId].status != AuctionStatus.ACTIVE), 
            "Already listed"
        );

        listings[collection][tokenId][msg.sender] = Listing({
            seller: msg.sender,
            price: price,
            quantity: quantity,
            listingType: ListingType.FIXED_PRICE,
            auctionId: 0
        });

        emit NFTListed(
            collection, 
            tokenId, 
            msg.sender, 
            price, 
            quantity,
            ListingType.FIXED_PRICE,
            0
        );
    }
    
    function removeListing(
        address collection,
        uint256 tokenId
    ) external {
        Listing storage listing = listings[collection][tokenId][msg.sender];
        require(listing.seller == msg.sender && listing.quantity > 0, "No active listing");

        if (listing.listingType == ListingType.AUCTION) {
            AuctionDetails storage auction = auctions[listing.auctionId];
            require(auction.status == AuctionStatus.ACTIVE, "Auction not active");
            require(auction.highestBidder == address(0), "Bids already placed");
            
            auction.status = AuctionStatus.CANCELLED;
            IERC1155(collection).safeTransferFrom(
                address(this),
                msg.sender,
                tokenId,
                listing.quantity,
                ""
            );
            
            emit AuctionCancelled(listing.auctionId);
        }
        
        delete listings[collection][tokenId][msg.sender];
        
        emit ListingRemoved(collection, tokenId, msg.sender);
    }
    
    function buyListedNFT(
        address collection,
        uint256 tokenId,
        address seller,
        uint256 quantity
    ) external nonReentrant {
        require(registeredCollections[collection], "Collection not registered");
        Listing storage listing = listings[collection][tokenId][seller];
        require(listing.seller == seller && listing.quantity > 0, "Invalid listing");
        require(listing.listingType == ListingType.FIXED_PRICE, "Not a fixed price listing");
        require(listing.quantity >= quantity, "Insufficient quantity");
        
        uint256 totalPrice = listing.price * quantity;
        uint256 platformFee = (totalPrice * secondaryFee) / 1000;
        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(tokenId);
        uint256 royaltyFee  = (totalPrice * nftDetails.royaltyPercentage) / 1000;
        uint256 sellerAmount = totalPrice - platformFee - royaltyFee;
        
        designatedToken.transferFrom(msg.sender, address(this), platformFee);
        designatedToken.transferFrom(msg.sender, nftDetails.creator, royaltyFee);
        designatedToken.transferFrom(msg.sender, seller, sellerAmount);
        
        IERC1155(collection).safeTransferFrom(seller, msg.sender, tokenId, quantity, "");
        
        listing.quantity -= quantity;
        if (listing.quantity == 0) {
            delete listings[collection][tokenId][seller];
        }
        
        emit NFTSold(collection, tokenId, seller, msg.sender, listing.price, quantity);
    }
    
    function getRegisteredCollections(uint256 offset, uint256 limit) 
        public 
        view 
        returns (address[] memory collections) 
    {
        require(offset <= totalCollections, "Invalid offset");
        
        uint256 size = totalCollections - offset;
        if (size > limit) {
            size = limit;
        }
        
        collections = new address[](size);
        
        for (uint256 i = 0; i < size; i++) {
            collections[i] = collectionIndex[offset + i];
        }
        
        return collections;
    }
    
    function getCollectionsByOwner(address _owner, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory _collections, uint256 total)
    {
        uint256 count = 0;
        
        for (uint256 i = 0; i < totalCollections; i++) {
            address collection = collectionIndex[i];
            if (OwnableUpgradeable(collection).owner() == _owner) {
                count++;
            }
        }
        
        require(offset <= count, "Invalid offset");
        
        uint256 size = count - offset;
        if (size > limit) {
            size = limit;
        }
        
        _collections = new address[](size);
        uint256 currentIndex = 0;
        uint256 skipped = 0;
        
        for (uint256 i = 0; i < totalCollections && currentIndex < size; i++) {
            address collection = collectionIndex[i];
            if (OwnableUpgradeable(collection).owner() == _owner) {
                if (skipped < offset) {
                    skipped++;
                    continue;
                }
                _collections[currentIndex] = collection;
                currentIndex++;
            }
        }
        
        return (_collections, count);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = designatedToken.balanceOf(address(this));
        if (balance > 0) {
            designatedToken.transfer(owner(), balance);
        }
    }
    
    function getListing(
        address collection,
        uint256 tokenId,
        address seller
    ) external view returns (Listing memory) {
        return listings[collection][tokenId][seller];
    }

     function createAuction(
        address collection,
        uint256 tokenId,
        uint256 quantity,
        uint256 startPrice,
        uint256 minBidIncrement,
        uint256 duration
    ) external nonReentrant returns (uint256) {
        _validateAuctionParams(
            collection,
            tokenId,
            quantity,
            startPrice,
            minBidIncrement,
            duration
        );

        _auctionIds++;
        uint256 auctionId = _auctionIds;
        
        _createAuctionListing(
            collection,
            tokenId,
            quantity,
            startPrice,
            auctionId
        );

        _setupAuction(
            auctionId,
            collection,
            tokenId,
            quantity,
            startPrice,
            minBidIncrement,
            duration
        );

        return auctionId;
    }

    function _validateAuctionParams(
        address collection,
        uint256 tokenId,
        uint256 quantity,
        uint256 startPrice,
        uint256 minBidIncrement,
        uint256 duration
    ) internal view {
        require(registeredCollections[collection], "Collection not registered");
        require(quantity > 0, "Invalid quantity");
        require(startPrice > 0, "Invalid start price");
        require(minBidIncrement > 0, "Invalid min bid increment");
        require(duration >= minAuctionDuration && duration <= maxAuctionDuration, "Invalid duration");
        require(
            IERC1155(collection).balanceOf(msg.sender, tokenId) >= quantity,
            "Insufficient balance"
        );
        require(
            IERC1155(collection).isApprovedForAll(msg.sender, address(this)),
            "Not approved"
        );

        Listing storage existingListing = listings[collection][tokenId][msg.sender];
        require(
            existingListing.quantity == 0 || 
            (existingListing.listingType == ListingType.AUCTION && 
             auctions[existingListing.auctionId].status != AuctionStatus.ACTIVE), 
            "Already listed"
        );
    }

    function _createAuctionListing(
        address collection,
        uint256 tokenId,
        uint256 quantity,
        uint256 startPrice,
        uint256 auctionId
    ) internal {
        listings[collection][tokenId][msg.sender] = Listing({
            seller: msg.sender,
            price: startPrice,
            quantity: quantity,
            listingType: ListingType.AUCTION,
            auctionId: auctionId
        });

        emit NFTListed(
            collection, 
            tokenId, 
            msg.sender, 
            startPrice, 
            quantity,
            ListingType.AUCTION,
            auctionId
        );
    }

    function _setupAuction(
        uint256 auctionId,
        address collection,
        uint256 tokenId,
        uint256 quantity,
        uint256 startPrice,
        uint256 minBidIncrement,
        uint256 duration
    ) internal {
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + duration;

        auctions[auctionId] = AuctionDetails({
            seller: msg.sender,
            startPrice: startPrice,
            currentPrice: startPrice,
            minBidIncrement: minBidIncrement,
            startTime: startTime,
            endTime: endTime,
            tokenId: tokenId,
            quantity: quantity,
            highestBidder: address(0),
            status: AuctionStatus.ACTIVE
        });

        auctionCollections[auctionId] = collection;

        IERC1155(collection).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            quantity,
            ""
        );

        emit AuctionCreated(
            auctionId,
            collection,
            tokenId,
            msg.sender,
            startPrice,
            minBidIncrement,
            startTime,
            endTime,
            quantity
        );
    }

    function placeBid(uint256 auctionId, uint256 bidAmount) external nonReentrant {
        AuctionDetails storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.ACTIVE, "Auction not active");
        require(block.timestamp <= auction.endTime, "Auction ended");
        require(bidAmount >= auction.currentPrice + auction.minBidIncrement, "Bid too low");

        // Check if bid is placed near the end
        if (auction.endTime - block.timestamp <= auctionExtensionInterval) {
            auction.endTime = block.timestamp + auctionExtensionInterval;
            emit AuctionExtended(auctionId, auction.endTime);
        }

        address previousBidder = auction.highestBidder;
        uint256 previousBid = bids[auctionId][previousBidder];

        if (previousBidder != address(0)) {
            designatedToken.transfer(previousBidder, previousBid);
        }

        require(
            designatedToken.transferFrom(msg.sender, address(this), bidAmount),
            "Transfer failed"
        );

        auction.highestBidder = msg.sender;
        auction.currentPrice = bidAmount;
        bids[auctionId][msg.sender] = bidAmount;

        emit BidPlaced(auctionId, msg.sender, bidAmount);
    }

    function settleAuction(uint256 auctionId) external nonReentrant {
        AuctionDetails storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.ACTIVE, "Auction not active");
        require(block.timestamp > auction.endTime, "Auction not ended");
        require(auction.highestBidder != address(0), "No bids placed");

        auction.status = AuctionStatus.ENDED;
        address collection = auctionCollections[auctionId];
        uint256 finalPrice = auction.currentPrice;

        // Calculate fees
        uint256 platformFee = (finalPrice * secondaryFee) / 1000;
        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(auction.tokenId);
        uint256 royaltyFee = (finalPrice * nftDetails.royaltyPercentage) / 1000;
        uint256 sellerAmount = finalPrice - platformFee - royaltyFee;

        // Distribute funds
        designatedToken.transfer(nftDetails.creator, royaltyFee);
        designatedToken.transfer(auction.seller, sellerAmount);

        // Transfer NFT
        IERC1155(collection).safeTransferFrom(
            address(this),
            auction.highestBidder,
            auction.tokenId,
            auction.quantity,
            ""
        );

        // Remove listing
        delete listings[collection][auction.tokenId][auction.seller];

        emit AuctionSettled(auctionId, auction.highestBidder, finalPrice);
    }

    function cancelAuction(uint256 auctionId) external nonReentrant {
        AuctionDetails storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.ACTIVE, "Auction not active");
        require(msg.sender == auction.seller, "Not seller");
        require(auction.highestBidder == address(0), "Bids already placed");

        auction.status = AuctionStatus.CANCELLED;
        address collection = auctionCollections[auctionId];

        IERC1155(collection).safeTransferFrom(
            address(this),
            auction.seller,
            auction.tokenId,
            auction.quantity,
            ""
        );

        // Remove listing
        delete listings[collection][auction.tokenId][auction.seller];

        emit AuctionCancelled(auctionId);
        emit ListingRemoved(collection, auction.tokenId, auction.seller);
    }

    function setAuctionExtensionInterval(uint256 _interval) external onlyOwner {
        require(_interval > 0, "Invalid interval");
        auctionExtensionInterval = _interval;
        emit AuctionExtensionIntervalUpdated(_interval);
    }
}