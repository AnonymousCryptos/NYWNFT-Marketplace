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
    struct Listing {
        address seller;
        uint256 price;
        uint256 quantity;
    }
    
    uint256 public primaryFee;
    uint256 public secondaryFee;
    uint256 public maxRoyaltyPercentage;
    address public collectionFactory;
    uint256 public totalCollections;
    IERC20 public immutable designatedToken;
    
    mapping(address => mapping(uint256 => mapping(address => Listing))) public listings;
    mapping(address => bool) public registeredCollections;
    mapping(uint256 => address) private collectionIndex;
    
    event NFTListed(address indexed collection, uint256 indexed tokenId, address seller, uint256 price, uint256 quantity);
    event NFTSold(address indexed collection, uint256 indexed tokenId, address seller, address buyer, uint256 price, uint256 quantity);
    event ListingRemoved(address indexed collection, uint256 indexed tokenId, address seller);
    event FeeUpdated(bool isPrimary, uint256 newFee);
    event MaxRoyaltyUpdated(uint256 newMaxRoyalty);
    event CollectionRegistered(address indexed collection);
    
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
    ) external {
        require(registeredCollections[collection], "Collection not registered");
        require(price > 0, "Invalid price");
        require(quantity > 0, "Invalid quantity");
        require(IERC1155(collection).balanceOf(msg.sender, tokenId) >= quantity, "Insufficient balance");
        
        listings[collection][tokenId][msg.sender] = Listing({
            seller: msg.sender,
            price: price,
            quantity: quantity
        });
        
        emit NFTListed(collection, tokenId, msg.sender, price, quantity);
    }
    
    function removeListing(
        address collection,
        uint256 tokenId
    ) external {
        Listing storage listing = listings[collection][tokenId][msg.sender];
        require(listing.seller == msg.sender && listing.quantity > 0, "No active listing");
        
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
        require(listing.quantity >= quantity, "Insufficient quantity");
        
        uint256 totalPrice = listing.price * quantity;
        uint256 platformFee = (totalPrice * secondaryFee) / 1000;
        ICollection.NFTDetails memory nftDetails = ICollection(collection).nftDetails(tokenId);
        uint256 creatorFee = (totalPrice * nftDetails.royaltyPercentage) / 1000;
        uint256 sellerAmount = totalPrice - platformFee - creatorFee;
        
        designatedToken.transferFrom(msg.sender, address(this), platformFee);
        designatedToken.transferFrom(msg.sender, nftDetails.creator, creatorFee);
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
}