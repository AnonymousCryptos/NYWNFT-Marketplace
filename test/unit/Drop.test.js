const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTestContracts } = require("../helpers/setup");
const { primarySale } = require("../helpers/commonFunctions")

describe("Drop", function () {
    let token, factory, marketplace;
    let owner, creator, buyer, seller;
    let drop;
    
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

    describe("Drop Creation", function () {
        it("Should create a drop", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;

            const tx = await factory.connect(creator).createCollection(
                "Test Drop",
                "Test Symbol",
                true,
                startTime
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            drop = await ethers.getContractAt("Drop", event.args.collection);
            
            expect(await drop.name()).to.equal("Test Drop");
            expect(await drop.symbol()).to.equal("Test Symbol");
            expect(await drop.owner()).to.equal(creator.address);
            expect(await drop.startTime()).to.equal(startTime);
        });

        it("Should revert with past start time", async function () {
            const currentTime = await time.latest();
            await expect(
                factory.connect(creator).createCollection(
                    "Test Drop",
                    "Test Symobol",
                    true,
                    currentTime - 3600
                )
            ).to.be.revertedWith("Invalid start time");
        });
    });

    describe("Drop Management", function () {
        let startTime;

        beforeEach(async function () {
            const currentTime = await time.latest();
            startTime = currentTime + 3600;

            const tx = await factory.connect(creator).createCollection(
                "Test Drop",
                "Test Symbol",
                true,
                startTime
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            drop = await ethers.getContractAt("Drop", event.args.collection);
        });

        it("Should update start time", async function () {
            const newStartTime = startTime + 3600;
            await drop.connect(creator).setStartTime(newStartTime);
            expect(await drop.startTime()).to.equal(newStartTime);
        });

        it("Should revert when non-owner updates start time", async function () {
            const newStartTime = startTime + 3600;
            await expect(
                drop.connect(buyer).setStartTime(newStartTime)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should revert with past start time update", async function () {
            const currentTime = await time.latest();
            await expect(
                drop.connect(creator).setStartTime(currentTime - 3600)
            ).to.be.revertedWith("Invalid start time");
        });
    });

    describe("NFT Creation and Minting", function () {
        let startTime;
        let tokenId;

        beforeEach(async function () {
            const currentTime = await time.latest();
            startTime = currentTime + 3600;

            const tx = await factory.connect(creator).createCollection(
                "Test Drop",
                "Test Symbol",
                true,
                startTime
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            drop = await ethers.getContractAt("Drop", event.args.collection);

        });

        it("Should not able to create NFT before start time", async function () {
            await expect(drop.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            )).to.be.revertedWith("Drop not started");
        });

        it("Should create NFT before start time", async function () {
            await time.increaseTo(startTime + 1);
            const tx = await drop.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test2",
                100
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "NFTCreated");
            tokenId = 1;
            expect(event.args.tokenId).to.equal(1);
        });

        it("Should mint after start time", async function () {
            await time.increaseTo(startTime + 1);
            const tx = await drop.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test2",
                100
            );
            const receipt = await tx.wait();
            tokenId = 1;
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(drop, marketplace, creator, tokenId, token, buyer, 1, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(drop.address, tokenId, 1);
            expect(await drop.balanceOf(buyer.address, tokenId)).to.equal(1);
        });

        it("Should handle multiple mints after start", async function () {
            await time.increaseTo(startTime + 1);
            const tx = await drop.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test2",
                100
            );
            const receipt = await tx.wait();
            tokenId = 1;
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("100"));
            
            // await marketplace.connect(buyer).buyNFT(drop.address, tokenId, 2);
            await primarySale(drop, marketplace, creator, tokenId, token, buyer, 2, 100, ethers.utils.parseEther("1"));
            expect(await drop.balanceOf(buyer.address, tokenId)).to.equal(2);
            
            // await marketplace.connect(buyer).buyNFT(drop.address, tokenId, 3);
            await primarySale(drop, marketplace, creator, tokenId, token, buyer, 3, 98, ethers.utils.parseEther("2"));
            expect(await drop.balanceOf(buyer.address, tokenId)).to.equal(5);
        });
    });

    describe("Secondary Market", function () {
        let startTime;
        let tokenId;

        beforeEach(async function () {
            const currentTime = await time.latest();
            startTime = currentTime + 3600;

            const tx = await factory.connect(creator).createCollection(
                "Test Drop",
                "Test Symbol",
                true,
                startTime
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            drop = await ethers.getContractAt("Drop", event.args.collection);
            await time.increaseTo(startTime + 1);

            await drop.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;

            
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            // await marketplace.connect(buyer).buyNFT(drop.address, tokenId, 2);
            await primarySale(drop, marketplace, creator, tokenId, token, buyer, 2, 100, ethers.utils.parseEther("1"));
        });

        it("Should list and trade after mint", async function () {
            await drop.connect(buyer).setApprovalForAll(marketplace.address, true);
            await marketplace.connect(buyer).listNFT(
                drop.address,
                tokenId,
                ethers.utils.parseEther("2"),
                1
            );

            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
            await marketplace.connect(seller).buyListedNFT(
                drop.address,
                tokenId,
                buyer.address,
                1
            );

            expect(await drop.balanceOf(seller.address, tokenId)).to.equal(1);
            expect(await drop.balanceOf(buyer.address, tokenId)).to.equal(1);
        });

        it("Should handle multiple secondary trades", async function () {
            await drop.connect(buyer).setApprovalForAll(marketplace.address, true);
            await marketplace.connect(buyer).listNFT(
                drop.address,
                tokenId,
                ethers.utils.parseEther("2"),
                2
            );

            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
            await marketplace.connect(seller).buyListedNFT(
                drop.address,
                tokenId,
                buyer.address,
                1
            );

            const listing = await marketplace.getListing(drop.address, tokenId, buyer.address);
            expect(listing.quantity).to.equal(1);
        });
    });

    describe("Initialization", function () {
        it("Should revert when initializing with invalid parameters", async function () {
            const Drop = await ethers.getContractFactory("Drop");
            const dropImpl = await Drop.deploy();
            await dropImpl.deployed();
    
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
    
            // Test with invalid start time
            await expect(
                factory.connect(creator).createCollection(
                    "Test Drop",
                    "Test Symbol",
                    true,
                    currentTime - 3600 // past time
                )
            ).to.be.revertedWith("Invalid start time");
    
            // Test with invalid marketplace
            const Factory = await ethers.getContractFactory("CollectionFactory");
            const newFactory = await Factory.deploy(
                dropImpl.address,
                dropImpl.address,
                marketplace.address
            );
            await marketplace.connect(owner).setCollectionFactory(newFactory.address);
    
            // Test with empty name
            await expect(
                factory.connect(creator).createCollection(
                    "",
                    "Test Symbol",
                    true,
                    startTime
                )
            ).to.be.revertedWith("Invalid name");
    
            // Test with empty description
            await expect(
                factory.connect(creator).createCollection(
                    "Test Drop",
                    "",
                    true,
                    startTime
                )
            ).to.be.revertedWith("Invalid description");
        });
    });
    describe("Drop Initialization", function () {
        let dropImplementation;
    
        beforeEach(async function () {
            // Deploy a fresh Drop implementation
            const Drop = await ethers.getContractFactory("Drop");
            dropImplementation = await Drop.deploy();
            await dropImplementation.deployed();
        });
    
        it("Should initialize with valid parameters", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
    
            const tx = await factory.connect(creator).createCollection(
                "Test Drop",
                "Test Symbol",
                true,
                startTime
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            const dropInstance = await ethers.getContractAt("Drop", event.args.collection);
    
            expect(await dropInstance.name()).to.equal("Test Drop");
            expect(await dropInstance.symbol()).to.equal("Test Symbol");
            expect(await dropInstance.owner()).to.equal(creator.address);
            expect(await dropInstance.startTime()).to.equal(startTime);
        });
    
        it("Should revert when initializing with past time", async function () {
            const currentTime = await time.latest();
            const pastTime = currentTime - 3600; // 1 hour in the past
    
            await expect(
                factory.connect(creator).createCollection(
                    "Test Drop",
                    "Test Symbol",
                    true,
                    pastTime
                )
            ).to.be.revertedWith("Invalid start time");
        });
    
        it("Should revert with empty name", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
    
            await expect(
                factory.connect(creator).createCollection(
                    "",
                    "Test Symbol",
                    true,
                    startTime
                )
            ).to.be.revertedWith("Invalid name");
        });
    
        it("Should revert with empty description", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
    
            await expect(
                factory.connect(creator).createCollection(
                    "Test Drop",
                    "",
                    true,
                    startTime
                )
            ).to.be.revertedWith("Invalid description");
        });
    });
});