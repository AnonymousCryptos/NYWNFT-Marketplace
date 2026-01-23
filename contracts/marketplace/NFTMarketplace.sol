// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ICollection.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract NFTMarketplace is Ownable, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;
    enum ListingType { FIXED_PRICE, AUCTION }
    enum AuctionStatus { ACTIVE, ENDED, CANCELLED }
    enum OfferStatus { PENDING, ACCEPTED, REJECTED, CANCELLED }
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

    struct Offer {
        address buyer;
        address seller;
        uint256 price;
        uint256 quantity;
        uint256 createTime;
        OfferStatus status;
    }

    struct FilterParams {
        address collection;
        uint256 tokenId;
        address user;
        uint8 filterType;
    }

    struct BatchPurchaseParams {
        address collection;
        uint256 tokenId;
        address seller;
        uint256 quantity;
    }
    
    uint256 public primaryFee;
    uint256 public secondaryFee;
    address public collectionFactory;
    uint256 public totalCollections;
    uint256 public amountLockedInPool;
    IERC20 public immutable designatedToken;

    uint256 private _auctionIds;
    uint256 private _offerIds;
    uint256 public minAuctionDuration;
    uint256 public maxAuctionDuration;
    uint256 public auctionExtensionInterval;
    
    mapping(address => mapping(uint256 => mapping(address => Listing))) public listings;
    mapping(address => bool) public registeredCollections;
    mapping(uint256 => address) private collectionIndex;
    mapping(uint256 => AuctionDetails) public auctions;
    mapping(uint256 => mapping(address => uint256)) public bids;
    mapping(uint256 => address) public auctionCollections;

    // Offer mappings
    mapping(address => mapping(uint256 => mapping(uint256 => Offer))) public offers; // collection => tokenId => offerId => Offer
    mapping(address => uint256[]) private userOfferIds; // buyer => offerIds
    mapping(uint256 => address) private offerCollections; // offerId => collection
    mapping(uint256 => uint256) private offerTokenIds; // offerId => tokenId
    mapping(address => uint256[]) private sellerReceivedOffers; // seller => offerIds
    mapping(address => mapping(uint256 => uint256[])) private tokenOffers; // collection => tokenId => offerIds
    
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
    event ListingRemoved(address indexed collection, uint256 indexed tokenId, address seller, string reason);
    event ListingQuantityUpdated(
        address indexed collection,
        uint256 indexed tokenId,
        address seller,
        uint256 newQuantity
    );
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
    event CollectionRegistered(address indexed collection);
    event AuctionExtensionIntervalUpdated(uint256 newInterval);

    event OfferCreated(
        uint256 indexed offerId,
        address indexed collection,
        uint256 indexed tokenId,
        address buyer,
        address seller,
        uint256 price,
        uint256 quantity
    );

    event OfferAccepted(uint256 indexed offerId, address indexed seller);
    event OfferRejected(uint256 indexed offerId, address indexed seller);
    event OfferCancelled(uint256 indexed offerId, address indexed buyer);
    
    constructor(
        address _designatedToken,
        uint256 _primaryFee,
        uint256 _secondaryFee
    ) {
        require(_designatedToken != address(0), "Invalid token address");
        require(_primaryFee <= 1000, "Primary fee too high");
        require(_secondaryFee <= 1000, "Secondary fee too high");
        
        designatedToken = IERC20(_designatedToken);
        primaryFee = _primaryFee;
        secondaryFee = _secondaryFee;
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
    ) external nonReentrant {
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
        emit ListingRemoved(collection, tokenId, msg.sender, "REMOVED_BY_SELLER");
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

        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(tokenId);
        
        uint256 fee = secondaryFee;
        if(nftDetails.creator == seller) {
            fee = primaryFee;
        }
        uint16 royaltyPercentage = ICollection(collection).getRoyaltyPercentage();
        uint256 totalPrice = listing.price * quantity;
        uint256 platformFee = (totalPrice * fee) / 1000;
        uint256 royaltyFee  = (totalPrice * royaltyPercentage) / 1000;
        uint256 sellerAmount = totalPrice - platformFee - royaltyFee;
        
        designatedToken.safeTransferFrom(msg.sender, address(this), platformFee);
        designatedToken.safeTransferFrom(msg.sender, seller, sellerAmount);
        if(royaltyFee > 0) {
            designatedToken.safeTransferFrom(msg.sender, nftDetails.creator, royaltyFee);
        }
        
        IERC1155(collection).safeTransferFrom(seller, msg.sender, tokenId, quantity, "");
        
        listing.quantity -= quantity;
        if (listing.quantity == 0) {
            delete listings[collection][tokenId][seller];
            emit ListingRemoved(collection, tokenId, seller, "SOLD_OUT");
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
        uint256 unlockedBalance = designatedToken.balanceOf(address(this)) - amountLockedInPool;
        if (unlockedBalance > 0) {
            designatedToken.safeTransfer(owner(), unlockedBalance);
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
    
        designatedToken.safeTransferFrom(msg.sender, address(this), bidAmount);

        if (previousBidder != address(0)) {
            designatedToken.safeTransfer(previousBidder, previousBid);
        }

        auction.highestBidder = msg.sender;
        auction.currentPrice = bidAmount;
        bids[auctionId][previousBidder] = 0;
        bids[auctionId][msg.sender] = bidAmount;
        // locking the amount in pool
        amountLockedInPool += bidAmount - previousBid; 

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
        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(auction.tokenId);

        uint256 fee = secondaryFee;
        if(nftDetails.creator == auction.seller) {
            fee = primaryFee;
        }
        uint16 royaltyPercentage = ICollection(collection).getRoyaltyPercentage();
        // Calculate fees
        uint256 platformFee = (finalPrice * fee) / 1000;
        uint256 royaltyFee = (finalPrice * royaltyPercentage) / 1000;
        uint256 sellerAmount = finalPrice - platformFee - royaltyFee;

        // Distribute funds
        designatedToken.safeTransfer(auction.seller, sellerAmount);
        if(royaltyFee>0) {
            designatedToken.safeTransfer(nftDetails.creator, royaltyFee);
        }

        // Transfer NFT
        IERC1155(collection).safeTransferFrom(
            address(this),
            auction.highestBidder,
            auction.tokenId,
            auction.quantity,
            ""
        );

        // freeing the locked amount after auctions settled
        amountLockedInPool -= finalPrice;

        // Remove listing
        address seller = auction.seller;
        delete listings[collection][auction.tokenId][seller];
        emit ListingRemoved(collection, auction.tokenId, seller, "AUCTION_SETTLED");

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
        emit ListingRemoved(collection, auction.tokenId, auction.seller, "AUCTION_CANCELLED");

        emit AuctionCancelled(auctionId);
    }

    function setAuctionExtensionInterval(uint256 _interval) external onlyOwner {
        require(_interval > 0, "Invalid interval");
        auctionExtensionInterval = _interval;
        emit AuctionExtensionIntervalUpdated(_interval);
    }

    function makeOffer(
        address collection,
        uint256 tokenId,
        address seller,
        uint256 quantity,
        uint256 price
    ) external nonReentrant {
        require(registeredCollections[collection], "Collection not registered");
        require(quantity > 0, "Invalid quantity");
        require(price > 0, "Invalid price");
        require(seller != address(0), "Invalid seller");
        require(seller != msg.sender, "Cannot make offer to self");
        
        uint256 sellerBalance = IERC1155(collection).balanceOf(seller, tokenId);
        require(sellerBalance >= quantity, "Insufficient seller balance");

        _offerIds++;
        uint256 offerId = _offerIds;

        offers[collection][tokenId][offerId] = Offer({
            buyer: msg.sender,
            seller: seller,
            price: price,
            quantity: quantity,
            createTime: block.timestamp,
            status: OfferStatus.PENDING
        });

        userOfferIds[msg.sender].push(offerId);
        sellerReceivedOffers[seller].push(offerId);
        tokenOffers[collection][tokenId].push(offerId);
        offerCollections[offerId] = collection;
        offerTokenIds[offerId] = tokenId;

        // Locking amount in pool
        amountLockedInPool += (price * quantity);

        // Pre-approve marketplace for token transfer
        designatedToken.safeTransferFrom(msg.sender, address(this), price * quantity);

        emit OfferCreated(offerId, collection, tokenId, msg.sender, seller, price, quantity);
    }

    function acceptOffer(uint256 offerId) external nonReentrant {
        (address collection, uint256 tokenId, Offer storage offer) = _validateAndGetOffer(offerId);
        uint256 totalBalance = _validateSellerBalance(collection, tokenId, offer);
        _validateAndUpdateListing(collection, tokenId, offer.quantity, totalBalance);
        _processOfferAcceptance(collection, tokenId, offer, offerId);
    }

    function _validateAndGetOffer(uint256 offerId) private view returns (
        address collection,
        uint256 tokenId,
        Offer storage offer
    ) {
        collection = offerCollections[offerId];
        require(collection != address(0), "Offer does not exist");

        tokenId = offerTokenIds[offerId];
        offer = offers[collection][tokenId][offerId];
        
        require(offer.status == OfferStatus.PENDING, "Invalid offer status");
        require(msg.sender == offer.seller, "Not offer recipient");

        return (collection, tokenId, offer);
    }

    function _validateSellerBalance(
        address collection,
        uint256 tokenId,
        Offer memory offer
    ) private view returns (uint256) {
        uint256 totalBalance = IERC1155(collection).balanceOf(msg.sender, tokenId);
        require(totalBalance >= offer.quantity, "Insufficient balance");
        return totalBalance;
    }

    function _validateAndUpdateListing(
        address collection,
        uint256 tokenId,
        uint256 offerQuantity,
        uint256 totalBalance
    ) private {
        Listing storage listing = listings[collection][tokenId][msg.sender];
        
        // Check if NFT is not in active auction
        if(listing.listingType == ListingType.AUCTION) {
            require(
                auctions[listing.auctionId].status != AuctionStatus.ACTIVE,
                "Active auction exists"
            );
        }

        // Calculate available quantities
        uint256 listedQuantity = listing.quantity;
        uint256 unlistedQuantity = totalBalance - listedQuantity;
        
        // Calculate how many NFTs to take from unlisted and listed
        uint256 takeFromUnlisted = unlistedQuantity >= offerQuantity ? 
            offerQuantity : unlistedQuantity;
        uint256 takeFromListed = offerQuantity - takeFromUnlisted;

        // Update listing if needed
        if(takeFromListed > 0) {
            if(takeFromListed == listedQuantity) {
                delete listings[collection][tokenId][msg.sender];
                emit ListingRemoved(collection, tokenId, msg.sender, "ZERO_QUANTITY");
            } else {
                listing.quantity = listedQuantity - takeFromListed;
                emit ListingQuantityUpdated(
                    collection,
                    tokenId,
                    msg.sender,
                    listing.quantity
                );
            }
        }
    }

    function _processOfferAcceptance(
        address collection,
        uint256 tokenId,
        Offer storage offer,
        uint256 offerId
    ) private {
        require(
            IERC1155(collection).isApprovedForAll(msg.sender, address(this)),
            "Not approved"
        );
        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(tokenId);

        uint256 fee = secondaryFee;
        if(nftDetails.creator == msg.sender) {
            fee = primaryFee;
        }
        uint16 royaltyPercentage = ICollection(collection).getRoyaltyPercentage();

        // Calculate fees
        uint256 totalPrice = offer.price * offer.quantity;
        uint256 platformFee = (totalPrice * fee) / 1000;
        uint256 royaltyFee = (totalPrice * royaltyPercentage) / 1000;
        uint256 sellerAmount = totalPrice - platformFee - royaltyFee;

        // Transfer NFT
        IERC1155(collection).safeTransferFrom(
            msg.sender,
            offer.buyer,
            tokenId,
            offer.quantity,
            ""
        );

        // Distribute payments
        designatedToken.safeTransfer(msg.sender, sellerAmount);
        if(royaltyFee>0) {
            designatedToken.safeTransfer(nftDetails.creator, royaltyFee);
        }

        // freeing the amount after offer acceptance
        amountLockedInPool -= totalPrice;
        

        offer.status = OfferStatus.ACCEPTED;
        emit OfferAccepted(offerId, msg.sender);
    }

    function rejectOffer(uint256 offerId) external nonReentrant {
        address collection = offerCollections[offerId];
        uint256 tokenId = offerTokenIds[offerId];
        require(collection != address(0), "Offer does not exist");

        Offer storage offer = offers[collection][tokenId][offerId];
        require(offer.status == OfferStatus.PENDING, "Invalid offer status");
        require(
            msg.sender == offer.seller,
            "Not offer recipient"
        );

        offer.status = OfferStatus.REJECTED;

        // Refund buyer
        designatedToken.safeTransfer(offer.buyer, offer.price * offer.quantity);

        // freeing locked amount after offer rejection
        amountLockedInPool -= (offer.price * offer.quantity);

        emit OfferRejected(offerId, msg.sender);
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        address collection = offerCollections[offerId];
        uint256 tokenId = offerTokenIds[offerId];
        require(collection != address(0), "Offer does not exist");

        Offer storage offer = offers[collection][tokenId][offerId];
        require(offer.buyer == msg.sender, "Not offer creator");
        require(offer.status == OfferStatus.PENDING, "Invalid offer status");

        offer.status = OfferStatus.CANCELLED;

        // Refund buyer
        designatedToken.safeTransfer(msg.sender, offer.price * offer.quantity);

        // freeing the locked amount after offer cancellation
        amountLockedInPool -= (offer.price * offer.quantity);

        emit OfferCancelled(offerId, msg.sender);
    }

    function getOffersByToken(
        address collection,
        uint256 tokenId,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory offerIdList, uint256 total) {
        return _getOffersWithFilter(
            collection,
            tokenId,
            address(0), // no user filter
            offset,
            limit,
            0 // filter type: BY_TOKEN
        );
    }

    function getOffersToSeller(
        address seller,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory offerIdList, uint256 total) {
        return _getOffersWithFilter(
            address(0), // no collection filter
            0, // no tokenId filter
            seller,
            offset,
            limit,
            1 // filter type: BY_SELLER
        );
    }

    function getOffersByBuyer(
        address buyer,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory offerIdList, uint256 total) {
        return _getOffersWithFilter(
            address(0), // no collection filter
            0, // no tokenId filter
            buyer,
            offset,
            limit,
            2 // filter type: BY_BUYER
        );
    }

    function _getOffersWithFilter(
        address collection,
        uint256 tokenId,
        address user,
        uint256 offset,
        uint256 limit,
        uint8 filterType
    ) private view returns (uint256[] memory offerIdList, uint256 total) {
        FilterParams memory params = FilterParams(collection, tokenId, user, filterType);
        uint256[] storage sourceOffers = _getSourceOffers(user, filterType, params);
        
        // Get total count first
        uint256 count = _countValidOffers(sourceOffers, params);

        if(count == 0 || offset >= count) {
            return (new uint256[](0), count);
        }

        return _getFilteredOffers(sourceOffers, params, offset, limit, count);
    }

    function _getSourceOffers(address user, uint8 filterType, FilterParams memory params) private view returns (uint256[] storage) {
        if (filterType == 0) { // BY_TOKEN
            return tokenOffers[params.collection][params.tokenId];
        } else if (filterType == 1) { // BY_SELLER
            return sellerReceivedOffers[user];
        } else { // BY_BUYER
            return userOfferIds[user];
        }
    }

    function _countValidOffers(
        uint256[] storage sourceOffers, 
        FilterParams memory params
    ) private view returns (uint256) {
        uint256 count;
        for(uint256 i = 0; i < sourceOffers.length; i++) {
            if(_isValidOffer(sourceOffers[i], params)) {
                count++;
            }
        }
        return count;
    }

    function _getFilteredOffers(
        uint256[] storage sourceOffers,
        FilterParams memory params,
        uint256 offset,
        uint256 limit,
        uint256 count
    ) private view returns (uint256[] memory offerIdList, uint256) {
        uint256 size = count - offset;
        if(size > limit) {
            size = limit;
        }

        offerIdList = new uint256[](size);
        uint256 currentIndex;
        uint256 skipped;

        for(uint256 i = 0; i < sourceOffers.length && currentIndex < size; i++) {
            uint256 offerId = sourceOffers[i];
            if(_isValidOffer(offerId, params)) {
                if(skipped < offset) {
                    skipped++;
                    continue;
                }
                offerIdList[currentIndex++] = offerId;
            }
        }

        return (offerIdList, count);
    }

    function _isValidOffer(
        uint256 offerId,
        FilterParams memory params
    ) private view returns (bool) {
        address offerCollection = offerCollections[offerId];
        uint256 offerTokenId = offerTokenIds[offerId];
        Offer storage offer = offers[offerCollection][offerTokenId][offerId];

        if (params.filterType == 0) { // BY_TOKEN
            return offerCollection == params.collection && 
                   offerTokenId == params.tokenId &&
                   offer.status == OfferStatus.PENDING;
        } else if (params.filterType == 1) { // BY_SELLER
            return offer.seller == params.user &&
                   offer.status == OfferStatus.PENDING;
        } else { // BY_BUYER
            return offer.buyer == params.user &&
                   offer.status == OfferStatus.PENDING;
        }
    }

    function getOffer(uint256 offerId) external view returns (
        address collection,
        uint256 tokenId,
        Offer memory offer
    ) {
        collection = offerCollections[offerId];
        require(collection != address(0), "Offer does not exist");
        
        tokenId = offerTokenIds[offerId];
        offer = offers[collection][tokenId][offerId];
        
        return (collection, tokenId, offer);
    }

    function batchBuyListedNFTs(BatchPurchaseParams[] calldata params) external nonReentrant {
        require(params.length > 0, "Empty batch");
        
        for(uint256 i = 0; i < params.length; i++) {
            BatchPurchaseParams calldata purchase = params[i];
            require(registeredCollections[purchase.collection], "Collection not registered");
            
            Listing storage listing = listings[purchase.collection][purchase.tokenId][purchase.seller];
            require(listing.seller == purchase.seller && listing.quantity > 0, "Invalid listing");
            require(listing.listingType == ListingType.FIXED_PRICE, "Not a fixed price listing");
            require(listing.quantity >= purchase.quantity, "Insufficient quantity");

            ICollection.NFTDetails memory nftDetails = ICollection(purchase.collection).nftDetails(purchase.tokenId);
            
            uint256 fee = secondaryFee;
            if(nftDetails.creator == purchase.seller) {
                fee = primaryFee;
            }
            uint16 royaltyPercentage = ICollection(purchase.collection).getRoyaltyPercentage();
            uint256 totalPrice = listing.price * purchase.quantity;
            uint256 platformFee = (totalPrice * fee) / 1000;
            uint256 royaltyFee = (totalPrice * royaltyPercentage) / 1000;
            uint256 sellerAmount = totalPrice - platformFee - royaltyFee;

            designatedToken.safeTransferFrom(msg.sender, address(this), platformFee);
            designatedToken.safeTransferFrom(msg.sender, purchase.seller, sellerAmount);
            if(royaltyFee>0) {
                designatedToken.safeTransferFrom(msg.sender, nftDetails.creator, royaltyFee);
            }

            IERC1155(purchase.collection).safeTransferFrom(
                purchase.seller, 
                msg.sender, 
                purchase.tokenId, 
                purchase.quantity, 
                ""
            );

            listing.quantity -= purchase.quantity;
            if (listing.quantity == 0) {
                delete listings[purchase.collection][purchase.tokenId][purchase.seller];
                emit ListingRemoved(purchase.collection, purchase.tokenId, purchase.seller, "SOLD_OUT");
            }

            emit NFTSold(
                purchase.collection, 
                purchase.tokenId, 
                purchase.seller, 
                msg.sender, 
                listing.price, 
                purchase.quantity
            );
        }
    }
}
 