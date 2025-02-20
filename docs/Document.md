# NFT Marketplace Documentation

## Overview
The NFT marketplace is a decentralized platform that enables users to create collections, mint NFTs, and trade them. It supports both regular collections and scheduled drops, with all trades conducted through a designated ERC20 token.

## Core Components

### Collection Factory
The central contract that manages the creation and tracking of all collections.

#### Key Features:
- Create regular collections
- Create scheduled drops
- Track collection ownership
- Verify collection authenticity

### Collections (ERC1155)
Collections are containers for NFTs with shared characteristics.

#### Types:
1. **Regular Collections**
   - Instant availability
   - No time restrictions
   - Immediate trading capability

2. **Scheduled Drops**
   - Time-gated availability
   - Scheduled release
   - Pre-configured start time

### Marketplace
Handles all trading activities and fee management.

#### Features:
- Primary market sales
- Secondary market trading
- Fee distribution
- Royalty management

## Function Guide

### Collection Creation

#### Regular Collection
```
Function: createCollection(string name, string description, address designatedToken, bool isDrop, uint256 startTime)
Parameters:
- name: Collection name
- description: Collection description
- designatedToken: Address of trading token
- isDrop: false
- startTime: 0 (unused for regular collections)

Returns: Collection address
Events Emitted: CollectionCreated(address collection, address owner, bool isDrop)
```

#### Scheduled Drop
```
Function: createCollection(string name, string description, address designatedToken, bool isDrop, uint256 startTime)
Parameters:
- name: Drop name
- description: Drop description
- designatedToken: Address of trading token
- isDrop: true
- startTime: Unix timestamp for release

Returns: Collection address
Events Emitted: CollectionCreated(address collection, address owner, bool isDrop)
```

### NFT Management

#### Create NFT
```
Function: createNFT(string uri, uint256 maxSupply, uint256 price, uint256 royaltyPercentage)
Parameters:
- uri: Metadata URI (IPFS recommended)
- maxSupply: Maximum number of copies
- price: Price in designated token
- royaltyPercentage: Creator royalty (base 1000, e.g., 50 = 5%)

Returns: Token ID
Events Emitted: NFTCreated(uint256 tokenId, address creator, uint256 maxSupply, uint256 price)
```

#### Mint NFT (Primary Market)
```
Function: buyNFT(address collection, uint256 tokenId, uint256 quantity)
Parameters:
- collection: Collection address
- tokenId: NFT identifier
- quantity: Number of copies to mint

Requirements:
- Collection must be registered
- Sufficient token allowance
- Within max supply limit
- Drop must be active (for scheduled drops)

Events Emitted: NFTSold(address collection, uint256 tokenId, address seller, address buyer, uint256 price, uint256 quantity)
```

### Trading Functions

#### List NFT
```
Function: listNFT(address collection, uint256 tokenId, uint256 price, uint256 quantity)
Parameters:
- collection: Collection address
- tokenId: NFT identifier
- price: Listing price per unit
- quantity: Number of copies to sell

Requirements:
- Must own NFTs
- Collection must be registered
- Marketplace must be approved

Events Emitted: NFTListed(address collection, uint256 tokenId, address seller, uint256 price, uint256 quantity)
```

#### Buy Listed NFT
```
Function: buyListedNFT(address collection, uint256 tokenId, address seller, uint256 quantity)
Parameters:
- collection: Collection address
- tokenId: NFT identifier
- seller: Current owner's address
- quantity: Number of copies to buy

Requirements:
- Active listing exists
- Sufficient token allowance
- Requested quantity available

Events Emitted: NFTSold(address collection, uint256 tokenId, address seller, address buyer, uint256 price, uint256 quantity)
```

#### Remove Listing
```
Function: removeListing(address collection, uint256 tokenId)
Parameters:
- collection: Collection address
- tokenId: NFT identifier

Requirements:
- Must be the listing creator
- Active listing exists

Events Emitted: ListingRemoved(address collection, uint256 tokenId, address seller)
```

## Fee Structure

### Primary Market
- Platform Fee: 2.5% (configurable)
- Creator Royalty: Set per NFT (max 10%)

### Secondary Market
- Platform Fee: 1% (configurable)
- Creator Royalty: Carries over from NFT creation

## Error Scenarios

### Collection Creation
- Invalid token address
- Invalid start time (for drops)
- Zero address parameters

### NFT Creation
- Invalid max supply (zero)
- Invalid price (zero)
- Excessive royalty percentage
- Non-owner attempt

### Trading
- Insufficient balance
- Insufficient allowance
- Invalid listing
- Expired listing
- Quantity exceeds availability
- Drop not started

## Events Reference

### CollectionCreated
```
Event: CollectionCreated(address collection, address owner, bool isDrop)
- collection: New collection address
- owner: Collection creator
- isDrop: Collection type identifier
```

### NFTCreated
```
Event: NFTCreated(uint256 tokenId, address creator, uint256 maxSupply, uint256 price)
- tokenId: Unique identifier
- creator: NFT creator
- maxSupply: Maximum supply limit
- price: Initial price
```

### NFTListed
```
Event: NFTListed(address collection, uint256 tokenId, address seller, uint256 price, uint256 quantity)
- collection: Collection address
- tokenId: NFT identifier
- seller: Listing creator
- price: Listed price
- quantity: Available quantity
```

### NFTSold
```
Event: NFTSold(address collection, uint256 tokenId, address seller, address buyer, uint256 price, uint256 quantity)
- collection: Collection address
- tokenId: NFT identifier
- seller: Seller address
- buyer: Buyer address
- price: Sale price
- quantity: Quantity sold
```

### ListingRemoved
```
Event: ListingRemoved(address collection, uint256 tokenId, address seller)
- collection: Collection address
- tokenId: NFT identifier
- seller: Listing creator
```

## Query Functions

### Collection Queries
```
Function: getUserCollections(address user)
Returns: address[] (Collection addresses owned by user)

Function: getRegisteredCollections(uint256 offset, uint256 limit)
Returns: (address[] collections, uint256 total)

Function: getCollectionsByOwner(address owner, uint256 offset, uint256 limit)
Returns: (address[] collections, uint256 total)
```

### NFT Queries
```
Function: nftDetails(uint256 tokenId)
Returns: (
    string uri,
    uint256 maxSupply,
    uint256 currentSupply,
    address creator,
    uint256 price,
    uint256 royaltyPercentage
)

Function: getListing(address collection, uint256 tokenId, address seller)
Returns: (
    address seller,
    uint256 price,
    uint256 quantity
)
```

This documentation provides a comprehensive overview of the NFT marketplace functionality. Developers can use this as a reference for integrating with the platform, understanding the available features, and handling various scenarios.