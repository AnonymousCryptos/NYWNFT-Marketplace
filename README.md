# NFT Marketplace

A decentralized NFT marketplace built on Ethereum that supports ERC1155 tokens, auctions, offers, and time-based drops.

![Solidity](https://img.shields.io/badge/solidity-^0.8.17-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)

## Features

- 🎨 ERC1155 NFT Collections
- ⏰ Time-based NFT Drops
- 💰 Fixed Price Trading
- 🔨 English Auctions
- 💫 Offer System
- 💸 Configurable Fees & Royalties
- 📦 Batch Operations

## Prerequisites

- [Node.js](https://nodejs.org/en/) >= 14.0.0
- [Hardhat](https://hardhat.org/) >= 2.0.0
- [npm](https://www.npmjs.com/) >= 6.0.0

## Installation

1. Clone the repository:
```bash
git clone https://github.com/AnonymousCryptos/NYWNFT-Marketplace.git
cd nft-marketplace
```

2. Install dependencies:
```bash
npm install
```

## Smart Contract Testing

Run all tests:
```bash
npx hardhat test
```

Run specific test file:
```bash
npx hardhat test test/unit/BaseCollection.test.js
```

Generate coverage report:
```bash
npx hardhat coverage
```

## Project Structure

```
NYWNFT-Marketplace/
├── contracts/
│   ├── core/
│   │   ├── BaseCollection.sol
│   │   ├── Drop.sol
│   │   └── CollectionFactory.sol
│   ├── interfaces/
│   │   ├── ICollection.sol
│   │   └── IDrop.sol
│   └── marketplace/
│       └── NFTMarketplace.sol
├── test/
│   ├── unit/
│   │   ├── BaseCollection.test.js
│   │   ├── Drop.test.js
│   │   └── CollectionFactory.test.js
│   ├── integration/
│   │   └── CompleteFlow.test.js
│   └── helpers/
│       ├── setup.js
│       └── commonFunctions.js
└── docs/
    └── Document.md

Current gas estimates:
- Collection Deployment: ~2.5M gas
- NFT Creation: ~150K gas
- Trading Operations: ~100K-200K gas

## Security

- Contracts use OpenZeppelin's secure implementations
- ReentrancyGuard for all value transfer functions
- Comprehensive access control
- 100% test coverage

## Contributing

1. Fork the repository
2. Create your feature branch:
```bash
git checkout -b feature/my-new-feature
```
3. Commit your changes:
```bash
git commit -am 'Add some feature'
```
4. Push to the branch:
```bash
git push origin feature/my-new-feature
```
5. Submit a pull request


## Documentation

- [Technical Documentation](docs/Document.md)

## Acknowledgments

- OpenZeppelin for secure contract implementations
- Hardhat for development framework
- Ethers.js for testing framework
