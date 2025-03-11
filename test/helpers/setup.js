const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployTestContracts() {
    const [owner, creator, buyer, seller] = await ethers.getSigners();

    // Deploy Mock ERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("NEW YORK WORLD NFT", "NYWNFT", 3, ethers.utils.parseEther("1000000"), seller.address, 0);
    await token.deployed();

    // Deploy NFTMarketplace
    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    const marketplace = await NFTMarketplace.deploy(
        token.address,    // designated token
        25,              // primaryFee (2.5%)
        10,              // secondaryFee (1%)
    );
    await marketplace.deployed();

    // Deploy BaseCollection implementation
    const BaseCollection = await ethers.getContractFactory("BaseCollection");
    const baseCollectionImpl = await BaseCollection.deploy();
    await baseCollectionImpl.deployed();

    // Deploy Drop implementation
    const Drop = await ethers.getContractFactory("Drop");
    const dropImpl = await Drop.deploy();
    await dropImpl.deployed();

    // Deploy CollectionFactory
    const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
    const factory = await CollectionFactory.deploy(
        baseCollectionImpl.address,
        dropImpl.address,
        marketplace.address
    );
    await factory.deployed();

    // Set factory in marketplace
    await marketplace.setCollectionFactory(factory.address);

    // Setup initial token balances
    await token.transfer(creator.address, ethers.utils.parseEther("100000"));
    await token.transfer(buyer.address, ethers.utils.parseEther("100000"));
    await token.transfer(seller.address, ethers.utils.parseEther("100000"));

    return {
        token,
        marketplace,
        factory,
        owner,
        creator,
        buyer,
        seller
    };
}

module.exports = {
    deployTestContracts
};