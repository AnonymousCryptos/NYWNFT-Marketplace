const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTestContracts } = require("../helpers/setup");

describe("BaseCollection", function () {
    let token, factory, marketplace;
    let owner, creator, buyer, seller;
    let collection;
    
    beforeEach(async function () {
        const contracts = await deployTestContracts();
        token = contracts.token;
        factory = contracts.factory;
        marketplace = contracts.marketplace;
        owner = contracts.owner;
        creator = contracts.creator;
        buyer = contracts.buyer;
        seller = contracts.seller;
    });

    describe("Collection Creation", function () {
        it("Should create a collection", async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            collection = await ethers.getContractAt("BaseCollection", event.args.collection);
            
            expect(await collection.name()).to.equal("Test Collection");
            expect(await collection.symbol()).to.equal("Test Symbol");
            expect(await collection.owner()).to.equal(creator.address);
        });

        it("Should revert with empty name", async function () {
            await expect(
                factory.connect(creator).createCollection(
                    "",
                    "Test symbol",
                    false,
                    0
                )
            ).to.be.revertedWith("Invalid name");
        });

        it("Should revert with empty description", async function () {
            await expect(
                factory.connect(creator).createCollection(
                    "Test Collection",
                    "",
                    false,
                    0
                )
            ).to.be.revertedWith("Invalid description");
        });
    });

    describe("NFT Creation", function () {
        beforeEach(async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            collection = await ethers.getContractAt("BaseCollection", event.args.collection);
        });

        it("Should create NFT", async function () {
            const tx = await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "NFTCreated");
            expect(event.args.tokenId).to.equal(1);
            expect(event.args.creator).to.equal(creator.address);
            expect(event.args.maxSupply).to.equal(100);
            expect(await collection.balanceOf(creator.address, event.args.tokenId)).to.equal(100);
        });

        it("Should revert if tries to creates NFT with empty name", async function () {
            await expect(
                collection.connect(creator).createNFT(
                    "",
                    "Desc 1",
                    "ipfs://test",
                    100
                )
            ).to.be.revertedWith("Invalid name");
        });

        it("Should revert if tries to creates NFT with description symbol", async function () {
            await expect(
                collection.connect(creator).createNFT(
                    "Token 1",
                    "",
                    "ipfs://test",
                    100
                )
            ).to.be.revertedWith("Invalid description");
        });
        
        it("Should revert when non-owner creates NFT", async function () {
            await expect(
                collection.connect(buyer).createNFT(
                    "Token 1",
                    "Desc 1",
                    "ipfs://test",
                    100
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should revert with invalid max supply", async function () {
            await expect(
                collection.connect(creator).createNFT(
                    "Token 1",
                    "Desc 1",   
                    "ipfs://test",
                    0
                )
            ).to.be.revertedWith("Invalid max supply");
        });

    });

    describe("NFT Minting", function () {
        let tokenId;

        beforeEach(async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            collection = await ethers.getContractAt("BaseCollection", event.args.collection);

            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
        });

        it("Should mint NFT directly while creation", async function () {
            expect(await collection.balanceOf(creator.address, tokenId)).to.equal(100);
        });
    });

    describe("URI Management", function () {
        beforeEach(async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            collection = await ethers.getContractAt("BaseCollection", event.args.collection);

            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
        });

        it("Should return correct URI", async function () {
            expect(await collection.uri(1)).to.equal("ipfs://test");
        });

        it("Should return empty string for non-existent token", async function () {
            expect(await collection.uri(999)).to.equal("");
        });
    });
    describe("BaseCollection Initialization", function () {
        let baseImplementation;
    
        beforeEach(async function () {
            const BaseCollection = await ethers.getContractFactory("BaseCollection");
            baseImplementation = await BaseCollection.deploy();
            await baseImplementation.deployed();
        });
    
        it("Should revert with empty name", async function () {
            await expect(
                factory.connect(creator).createCollection(
                    "", // empty name
                    "Test symbol",
                    false,
                    0
                )
            ).to.be.revertedWith("Invalid name");
        });

        it("Should revert if tries to update royalty more than permitted", async function () {
            await expect(
                collection.connect(creator).updateRoyaltyPercentage(
                    101
                )
            ).to.be.revertedWith("Royalty too high");
        });

        it("Should revert if non-owner tries to update royalty", async function () {
            await expect(
                collection.connect(buyer).updateRoyaltyPercentage(
                    10
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    
        it("Should revert with empty description", async function () {
            await expect(
                factory.connect(creator).createCollection(
                    "Test Collection",
                    "", // empty description
                    false,
                    0
                )
            ).to.be.revertedWith("Invalid description");
        });
    
        it("Should revert with zero address owner", async function () {
            // Deploy new factory with different parameters
            const Factory = await ethers.getContractFactory("CollectionFactory");
            const newFactory = await Factory.deploy(
                baseImplementation.address,
                baseImplementation.address,
                marketplace.address
            );
            await newFactory.deployed();
    
            // Create a contract that will call initialize with zero owner
            const TestCaller = await ethers.getContractFactory("TestCaller");
            const testCaller = await TestCaller.deploy();
            await testCaller.deployed();
    
            await expect(
                testCaller.testInitialize(
                    baseImplementation.address,
                    "Test",
                    "Test",
                    ethers.constants.AddressZero, // zero address owner
                    marketplace.address
                )
            ).to.be.revertedWith("Invalid owner");
        });
    
        it("Should revert with zero address marketplace", async function () {
            // Use the test caller contract
            const TestCaller = await ethers.getContractFactory("TestCaller");
            const testCaller = await TestCaller.deploy();
            await testCaller.deployed();
    
            await expect(
                testCaller.testInitialize(
                    baseImplementation.address,
                    "Test",
                    "Test",
                    owner.address,
                    ethers.constants.AddressZero // zero address marketplace
                )
            ).to.be.revertedWith("Invalid marketplace");
        });

        it("Should revert with empty name", async function () {
            // Use the test caller contract
            const TestCaller = await ethers.getContractFactory("TestCaller");
            const testCaller = await TestCaller.deploy();
            await testCaller.deployed();
    
            await expect(
                testCaller.testInitialize(
                    baseImplementation.address,
                    "",
                    "Test",
                    owner.address,
                    ethers.constants.AddressZero // zero address marketplace
                )
            ).to.be.revertedWith("Invalid name");
        });
        it("Should revert with empty symbol", async function () {
            // Use the test caller contract
            const TestCaller = await ethers.getContractFactory("TestCaller");
            const testCaller = await TestCaller.deploy();
            await testCaller.deployed();
    
            await expect(
                testCaller.testInitialize(
                    baseImplementation.address,
                    "Test",
                    "",
                    owner.address,
                    ethers.constants.AddressZero // zero address marketplace
                )
            ).to.be.revertedWith("Invalid symbol");
        });
    });
    describe("BaseCollection Edge Cases", function () {
        let baseImplementation;
        let collection;
    
        beforeEach(async function () {
            // Create collection
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            // Create NFT
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
        });
    
        it("Should revert on reinitialization (initializer modifier)", async function () {
            await expect(
                collection.initialize(
                    "New Name",
                    "New Description",
                    creator.address,
                    marketplace.address,
                    true
                )
            ).to.be.revertedWith("Initializable: contract is already initialized");
        });
    });
});