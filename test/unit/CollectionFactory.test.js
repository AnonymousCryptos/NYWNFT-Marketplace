const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTestContracts } = require("../helpers/setup");

describe("CollectionFactory", function () {
    let token, factory, marketplace;
    let owner, creator, buyer, seller;
    
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

    describe("Factory Setup", function () {
        it("Should have correct implementation addresses", async function () {
            expect(await factory.collectionImplementation()).to.not.equal(ethers.constants.AddressZero);
            expect(await factory.dropImplementation()).to.not.equal(ethers.constants.AddressZero);
        });

        it("Should have marketplace set", async function () {
            expect(await factory.marketplace()).to.equal(marketplace.address);
        });

        it("Should allow owner to update marketplace", async function () {
            await factory.connect(owner).setMarketplace(seller.address);
            expect(await factory.marketplace()).to.equal(seller.address);
        });

        it("Should revert when non-owner tries to update marketplace", async function () {
            await expect(
                factory.connect(buyer).setMarketplace(seller.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Collection Creation", function () {
        it("Should create regular collection", async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            
            expect(event.args.owner).to.equal(creator.address);
            expect(event.args.isDrop).to.equal(false);
            expect(await factory.isCollectionCreatedByUs(event.args.collection)).to.equal(true);

            const collection = await ethers.getContractAt("BaseCollection", event.args.collection);
            expect(await collection.name()).to.equal("Test Collection");
            expect(await collection.symbol()).to.equal("Test Symbol");
            expect(await collection.owner()).to.equal(creator.address);
        });

        it("Should create drop collection", async function () {
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
            
            expect(event.args.owner).to.equal(creator.address);
            expect(event.args.isDrop).to.equal(true);
            expect(await factory.isCollectionCreatedByUs(event.args.collection)).to.equal(true);

            const drop = await ethers.getContractAt("Drop", event.args.collection);
            expect(await drop.startTime()).to.equal(startTime);
        });

        it("Should register collection in marketplace", async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            const collectionAddress = event.args.collection;
            
            expect(await marketplace.registeredCollections(collectionAddress)).to.equal(true);
        });

        it("Should track user collections", async function () {
            await factory.connect(creator).createCollection(
                "Test Collection 1",
                "Test Symbol",
                false,
                0
            );

            await factory.connect(creator).createCollection(
                "Test Collection 2",
                "Test Symbol",
                false,
                0
            );

            const collections = await factory.getUserCollections(creator.address);
            expect(collections.length).to.equal(2);
        });

        it("Should revert with empty name", async function () {
            await expect(
                factory.connect(creator).createCollection(
                    "",
                    "Test Description",
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

    describe("Collection Verification", function () {
        it("Should verify created collections", async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "CollectionCreated");
            const collectionAddress = event.args.collection;
            
            expect(await factory.verifyCollection(collectionAddress)).to.equal(true);
            expect(await factory.verifyCollection(ethers.constants.AddressZero)).to.equal(false);
        });

        it("Should track multiple collections per user", async function () {
            const collections = [];
            
            for(let i = 0; i < 3; i++) {
                const tx = await factory.connect(creator).createCollection(
                    `Test Collection ${i}`,
                    "Test Symbol",
                    false,
                    0
                );
                const receipt = await tx.wait();
                const event = receipt.events.find(e => e.event === "CollectionCreated");
                collections.push(event.args.collection);
            }

            const userCollections = await factory.getUserCollections(creator.address);
            expect(userCollections.length).to.equal(3);
            
            for(let i = 0; i < 3; i++) {
                expect(userCollections[i]).to.equal(collections[i]);
                expect(await factory.verifyCollection(collections[i])).to.equal(true);
            }
        });
    });
    describe("Edge cases", function () {
        it("Should revert for empty marketplace address", async function () {
            await expect(factory.connect(owner).setMarketplace(ethers.constants.AddressZero)).to.be.revertedWith("Invalid marketplace address");
        });
        it("Should revert for empty collection address", async function () {
            const Factory = await ethers.getContractFactory("CollectionFactory");
            const newFactory = await expect(Factory.deploy(
                ethers.constants.AddressZero,
                await factory.dropImplementation(),
                marketplace.address
            )).to.be.revertedWith("Invalid collection implementation");
        });
        it("Should revert for empty collection address", async function () {
            const Factory = await ethers.getContractFactory("CollectionFactory");
            const newFactory = await expect(Factory.deploy(
                await factory.collectionImplementation(),
                ethers.constants.AddressZero,
                marketplace.address
            )).to.be.revertedWith("Invalid drop implementation");
        });
        it("Should revert for empty collection address", async function () {
            const Factory = await ethers.getContractFactory("CollectionFactory");
            const newFactory = await expect(Factory.deploy(
                await factory.collectionImplementation(),
                await factory.dropImplementation(),
                ethers.constants.AddressZero
            )).to.be.revertedWith("Invalid marketplace");
        });
    });
});