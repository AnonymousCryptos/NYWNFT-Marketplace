# NFT Marketplace Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Features](#features)
3. [Contract Architecture](#contract-architecture)
4. [Contract Details](#contract-details)
5. [Integration Guidelines](#integration-guidelines)
6. [Events Reference](#events-reference)

## System Overview

The NFT Marketplace is a comprehensive platform for trading ERC1155 tokens with multiple trading mechanisms and configurable fees.

### Supported Standards
- NFTs: ERC1155 (Multi-token standard)
- Payment: Any ERC20 token (configurable during deployment)

### Key Components
- Collection Management
- Time-based Drops
- Fixed Price Trading
- Auction System
- Offer Mechanism
- Configurable Fees
- Royalty Distribution

## Features

### 1. Collection Management

#### Standard Collections
- Create unlimited NFT types within a collection
- Configure royalties per NFT
- Set maximum supply per NFT
- Custom metadata URI per NFT
- Immediate minting capability
- Ownership management

#### Time-based Drops
- Schedule NFT releases
- Configurable start time
- Modifiable release schedule
- Time-locked minting
- All standard collection features
- Automatic time validation

### 2. Trading Mechanisms

#### Fixed Price Listings
- List NFTs at fixed prices
- Partial quantity listings
- Multiple active listings per NFT
- Batch purchase support
- Automatic fee distribution
- Listing management

#### Auction System
Features:
- English auction style
- Configurable duration
- Minimum bid increments
- Automatic time extensions
- Bid refund mechanism
- Settlement and cancellation options

States:
- ACTIVE: Ongoing auction
- ENDED: Completed auction
- CANCELLED: Terminated auction

#### Offer System
Features:
- Make offers on any NFT
- Partial quantity offers
- Multiple active offers
- Offer expiration handling
- Automatic payment handling

States:
- PENDING: Active offer
- ACCEPTED: Completed offer
- REJECTED: Declined offer
- CANCELLED: Withdrawn offer

### 3. Fee Structure

All fees are configurable.

#### Platform Fees
- Primary Sales
- Secondary Sales
- Fee recipient: Marketplace owner
- Configurable by: Marketplace owner
- Update frequency: Anytime

#### Creator Royalties
- Configurable per NFT
- Applied to all sales
- Automatic distribution
- Set during NFT creation
- Non-modifiable after creation

## Contract Architecture

```
CollectionFactory
├── BaseCollection
│   └── NFT Management
└── Drop
    └── Time-based Features

NFTMarketplace
├── Trading Functions
├── Auction System
└── Offer Management
```

### Contract Relationships

1. **CollectionFactory**
- Deploys and tracks collections
- Manages collection verification
- Interfaces with the marketplace
```solidity
CollectionFactory {
    address collectionImplementation;
    address dropImplementation;
    address marketplace;
    mapping(address => bool) isCollectionCreatedByUs;
}
```

2. **BaseCollection**
- ERC1155 NFT implementation
- Handles NFT creation and metadata
- Manages royalties
```solidity
BaseCollection {
    string name;
    string description;
    address marketplace;
    mapping(uint256 => NFTDetails) nftDetails;
}
```

3. **Drop**
- Extends BaseCollection
- Adds time-lock functionality
- Controls minting schedule
```solidity
Drop {
    uint256 startTime;
    // Inherits BaseCollection
}
```

4. **NFTMarketplace**
- Manages listings and trades
- Handles auctions and offers
- Processes fees and royalties
```solidity
NFTMarketplace {
    uint256 primaryFee;      // Default 2.5%
    uint256 secondaryFee;    // Default 1%
    mapping(address => bool) registeredCollections;
    mapping(...) listings;
    mapping(...) auctions;
    mapping(...) offers;
}
```

### Security Features

1. **Access Control**
- OwnableUpgradeable for admin functions
- ReentrancyGuard for trading functions
- Marketplace authorization checks

2. **Validations**
- Address checks
- Amount verification
- Time validations
- Balance checks

3. **Fee Management**
- Configurable platform fees (0-10%)
- Royalty enforcement
- Secure fund distribution

### Dependencies
- OpenZeppelin Upgradeable Contracts
- ERC1155 and ERC20 standards
- Custom interfaces for collection types

## Contract Details

### BaseCollection

#### Key Functions

1. **Collection Management**
```solidity
function initialize(string _name, string _description, address _owner, address _marketplace)
```
- Initializes collection with basic details
- Sets owner and authorized marketplace

```solidity
function createNFT(string _tokenURI, uint256 maxSupply, uint256 royaltyPercentage) returns (uint256)
```
- Creates a new NFT type
- Returns tokenId
- Mints full supply to the creator

2. **View Functions**
```solidity
function nftDetails(uint256 tokenId) returns (NFTDetails)
function uri(uint256 tokenId) returns (string)
```

### Drop

#### Key Functions

```solidity
function initialize(..., uint256 _startTime)
```
- Extends BaseCollection initialization
- Adds time-lock feature

```solidity
function setStartTime(uint256 _startTime)
```
- Updates release schedule
- Only the owner can call

### NFTMarketplace

#### Trading Functions

1. **Fixed Price Trading**
```solidity
function listNFT(address collection, uint256 tokenId, uint256 price, uint256 quantity)
function buyListedNFT(address collection, uint256 tokenId, address seller, uint256 quantity)
function removeListing(address collection, uint256 tokenId)
```

2. **Auction System**
```solidity
function createAuction(
    address collection,
    uint256 tokenId,
    uint256 quantity,
    uint256 startPrice,
    uint256 minBidIncrement,
    uint256 duration
) returns (uint256 auctionId)

function placeBid(uint256 auctionId, uint256 bidAmount)
function settleAuction(uint256 auctionId)
function cancelAuction(uint256 auctionId)
```

3. **Offer System**
```solidity
function makeOffer(
    address collection,
    uint256 tokenId,
    address seller,
    uint256 quantity,
    uint256 price
) returns (uint256 offerId)

function acceptOffer(uint256 offerId)
function rejectOffer(uint256 offerId)
function cancelOffer(uint256 offerId)
```

4. **Fee Management**
```solidity
function setPrimaryFee(uint256 _fee)     // 0-1000 (0-10%)
function setSecondaryFee(uint256 _fee)   // 0-1000 (0-10%)
function withdrawFees()                   // Owner only
```

## Events Reference

### Collection Events
```solidity
event NFTCreated(uint256 indexed tokenId, address indexed creator, uint256 maxSupply)
event StartTimeUpdated(uint256 newStartTime)  // Drop only
```

### Marketplace Events
```solidity
event NFTListed(address collection, uint256 tokenId, address seller, uint256 price, uint256 quantity)
event NFTSold(address collection, uint256 tokenId, address seller, address buyer, uint256 price)
event AuctionCreated(uint256 auctionId, /* auction details */)
event BidPlaced(uint256 auctionId, address bidder, uint256 amount)
event OfferCreated(uint256 offerId, /* offer details */)
```

## Integration Guidelines

### Collection Creation
1. Deploy via Factory
2. Create NFTs after deployment
3. For drops, set the appropriate start time

### Trading Flow
1. Approve the marketplace for NFT transfer
2. Approve the marketplace for ERC20 transfer
3. Choose trading method:
   - Fixed price listing
   - Auction
   - Make an offer

### Fee Calculations
- Primary Sale: price * primaryFee / 10000
- Secondary Sale: price * secondaryFee / 10000
- Royalty: price * royaltyPercentage / 10000

### Error Handling
- Check approval status
- Verify sufficient balances
- Handle transaction failures
- Monitor events for confirmation
