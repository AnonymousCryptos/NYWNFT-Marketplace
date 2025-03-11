const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTestContracts } = require("../helpers/setup");
const { primarySale } = require("../helpers/commonFunctions")

describe("Complete Flow", function () {
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

    it("Should execute complete flow: create, mint, list, and trade", async function () {
        // Create Collection
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        const receipt = await tx.wait();
        const event = receipt.events.find(e => e.event === "CollectionCreated");
        const collection = await ethers.getContractAt("BaseCollection", event.args.collection);

        // Create NFT
        await collection.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            100
        );
        const tokenId = 1;
        expect(await collection.balanceOf(creator.address, tokenId)).to.equal(100);

        // Primary Sale
        await primarySale(collection, marketplace, creator, tokenId, token, buyer, 2, 100, ethers.utils.parseEther("2"));

        // Secondary Sale Setup
        await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        await marketplace.connect(buyer).listNFT(
            collection.address,
            tokenId,
            ethers.utils.parseEther("2"),
            1
        );

        await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
        await marketplace.connect(seller).buyListedNFT(
            collection.address,
            tokenId,
            buyer.address,
            1
        );

        // Verify states
        expect(await collection.balanceOf(seller.address, tokenId)).to.equal(1);
        expect(await collection.balanceOf(buyer.address, tokenId)).to.equal(1);

        // Platform fees
        const initialOwnerBalance = await token.balanceOf(owner.address);
        await marketplace.connect(owner).withdrawFees();
        expect(await token.balanceOf(owner.address)).to.be.gt(initialOwnerBalance);
    });

    it("Should execute complete flow with scheduled drop", async function () {
        const currentTime = await time.latest();
        const startTime = currentTime + 3600; // 1 hour from now

        // Create Drop
        const tx = await factory.connect(creator).createCollection(
            "Test Drop",
            "Test Symbol",
            true,
            startTime
        );
        const receipt = await tx.wait();
        const event = receipt.events.find(e => e.event === "CollectionCreated");
        const drop = await ethers.getContractAt("Drop", event.args.collection);
        // Should not be able to create nft before start time.
        await expect(
            drop.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100)
            
        ).to.be.revertedWith("Drop not started");

        // Buy after start time
        await time.increaseTo(startTime + 1);
        drop.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            100)
        const tokenId = 1;
        // Primary Sale
        await primarySale(drop, marketplace, creator, tokenId, token, buyer, 1,100,ethers.utils.parseEther("2"));

        expect(await drop.balanceOf(buyer.address, tokenId)).to.equal(1);

        // Secondary sale
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
        expect(await drop.balanceOf(buyer.address, tokenId)).to.equal(0);
    });

    it("Should handle multiple trades and listings", async function () {
        // Create Collection
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        const receipt = await tx.wait();
        const collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);

        // Create NFTs
        await collection.connect(creator).createNFT("Token 1","Desc 1","ipfs://test1", 100);
        await collection.connect(creator).createNFT("Token 2","Desc 2","ipfs://test2", 50);

        // Buy NFTs
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("100"));
        await primarySale(collection, marketplace, creator, 1, token, buyer, 3, 100, ethers.utils.parseEther("2"));
        await primarySale(collection, marketplace, creator, 2, token, buyer, 2, 50, ethers.utils.parseEther("2"));

        // List NFTs
        await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        await marketplace.connect(buyer).listNFT(
            collection.address,
            1,
            ethers.utils.parseEther("2"),
            2
        );
        await marketplace.connect(buyer).listNFT(
            collection.address,
            2,
            ethers.utils.parseEther("3"),
            1
        );

        // Partial purchase
        await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("100"));
        await marketplace.connect(seller).buyListedNFT(
            collection.address,
            1,
            buyer.address,
            1
        );

        const listing = await marketplace.getListing(collection.address, 1, buyer.address);
        expect(listing.quantity).to.equal(1);

        // Remove listing
        await marketplace.connect(buyer).removeListing(collection.address, 2);
        const removedListing = await marketplace.getListing(collection.address, 2, buyer.address);
        expect(removedListing.quantity).to.equal(0);

        // Verify balances
        expect(await collection.balanceOf(buyer.address, 1)).to.equal(2);
        expect(await collection.balanceOf(seller.address, 1)).to.equal(1);
        expect(await collection.balanceOf(buyer.address, 2)).to.equal(2);
    });

    it("Should execute complete auction flow with multiple bids and extension", async function () {
        // Create Collection and NFT
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        const receipt = await tx.wait();
        const collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);

        await collection.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            100
        );
        const tokenId = 1;

        // Buy NFTs
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
        // await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
        // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);

        // Create auction
        await collection.connect(creator).setApprovalForAll(marketplace.address, true);
        const auctionTx = await marketplace.connect(creator).createAuction(
            collection.address,
            tokenId,
            2,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("0.1"),
            3600 // 1 hour duration
        );
        const auctionReceipt = await auctionTx.wait();
        const auctionId = auctionReceipt.events.find(e => e.event === "AuctionCreated").args.auctionId;

        // Place multiple bids
        await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
        await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));

        await token.connect(owner).approve(marketplace.address, ethers.utils.parseEther("10"));
        await marketplace.connect(owner).placeBid(auctionId, ethers.utils.parseEther("1.5"));

        // Move time close to end
        await ethers.provider.send("evm_increaseTime", [3500]); // 100 seconds before end
        await ethers.provider.send("evm_mine");

        // Place bid near end to trigger extension
        await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
        await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("2.0"));

        // Verify auction was extended
        const auction = await marketplace.auctions(auctionId);
        expect(auction.endTime).to.be.gt(auction.startTime/1 + 3600);

        // Move time past extended end
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine");

        // Settle auction
        await marketplace.connect(creator).settleAuction(auctionId);

        // Verify final states
        expect(await collection.balanceOf(seller.address, tokenId)).to.equal(2); // Winner gets NFTs
        expect(await collection.balanceOf(creator.address, tokenId)).to.equal(98); // Seller keeps remaining

        // Verify auction status
        const finalAuction = await marketplace.auctions(auctionId);
        expect(finalAuction.status).to.equal(1); // ENDED
        expect(finalAuction.highestBidder).to.equal(seller.address);
    });

    it("Should execute auction cancellation flow when no bids placed", async function () {
        // Create Collection and NFT
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        const receipt = await tx.wait();
        const collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);

        await collection.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            100
        );
        const tokenId = 1;

        // Buy NFTs
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
        await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));

        // Create auction
        await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        const auctionTx = await marketplace.connect(buyer).createAuction(
            collection.address,
            tokenId,
            2,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("0.1"),
            3600
        );
        const auctionReceipt = await auctionTx.wait();
        const auctionId = auctionReceipt.events.find(e => e.event === "AuctionCreated").args.auctionId;

        // Cancel auction
        await marketplace.connect(buyer).cancelAuction(auctionId);

        // Verify final states
        expect(await collection.balanceOf(buyer.address, tokenId)).to.equal(5); // NFTs returned to seller
        
        // Verify auction status
        const finalAuction = await marketplace.auctions(auctionId);
        expect(finalAuction.status).to.equal(2); // CANCELLED

        // Verify listing removed
        const listing = await marketplace.listings(collection.address, tokenId, buyer.address);
        expect(listing.quantity).to.equal(0);
    });

    it("Should handle auction and offer interactions correctly", async function () {
        // Create Collection and NFT
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        const receipt = await tx.wait();
        const collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);

        await collection.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            100
        );
        const tokenId = 1;

        // Buy NFTs
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
        // await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));

        // Create auction
        await collection.connect(creator).setApprovalForAll(marketplace.address, true);
        const auctionTx = await marketplace.connect(creator).createAuction(
            collection.address,
            tokenId,
            2,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("0.1"),
            3600
        );
        const auctionReceipt = await auctionTx.wait();
        const auctionId = auctionReceipt.events.find(e => e.event === "AuctionCreated").args.auctionId;

        // Try to make offer while auction is active
        await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
        await marketplace.connect(seller).makeOffer(
            collection.address,
            tokenId,
            creator.address,
            1,
            ethers.utils.parseEther("1.5")
        );

        // Try to accept offer while auction is active
        const offerTx = await marketplace.connect(seller).makeOffer(
            collection.address,
            tokenId,
            creator.address,
            1,
            ethers.utils.parseEther("1.5")
        );
        const offerReceipt = await offerTx.wait();
        const offerId = offerReceipt.events.find(e => e.event === "OfferCreated").args.offerId;

        await expect(
            marketplace.connect(creator).acceptOffer(offerId)
        ).to.be.revertedWith("Active auction exists");

        // Cancel auction and then accept offer
        await marketplace.connect(creator).cancelAuction(auctionId);
        await marketplace.connect(creator).acceptOffer(offerId);

        // Verify final states
        expect(await collection.balanceOf(seller.address, tokenId)).to.equal(1);
        expect(await collection.balanceOf(creator.address, tokenId)).to.equal(99);
    });

    it("Should execute complete offer flow", async function () {
        // Create Collection and NFT
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        const receipt = await tx.wait();
        const collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);

        await collection.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            100
        );
        const tokenId = 1;

        // Buy NFTs
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
        await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));

        // Create listing
        await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        await marketplace.connect(buyer).listNFT(
            collection.address,
            tokenId,
            ethers.utils.parseEther("2"),
            3
        );

        // Make offer
        await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("3"));
        const offerTx = await marketplace.connect(seller).makeOffer(
            collection.address,
            tokenId,
            buyer.address,
            2,
            ethers.utils.parseEther("1.5")
        );
        const offerReceipt = await offerTx.wait();
        const offerId = offerReceipt.events.find(e => e.event === "OfferCreated").args.offerId;

        // Accept offer
        await marketplace.connect(buyer).acceptOffer(offerId);

        // Verify final states
        expect(await collection.balanceOf(seller.address, tokenId)).to.equal(2);
        expect(await collection.balanceOf(buyer.address, tokenId)).to.equal(3);

        const listing = await marketplace.listings(collection.address, tokenId, buyer.address);
        expect(listing.quantity).to.equal(3); // Should be 3 because:
        // Initial listing: 3
        // Total balance: 5
        // Unlisted: 2 (5-3)
        // Offer quantity: 2
        // Uses: 2 from unlisted first
        // So listing remains unchanged at 3
    });
    it("Should be able to purchase multiple listed nfts across various collections and sellers in single call",async function () {
        // create 2 collections with different owners
        const tx1 = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Description",
            false,
            0
        );
        let receipt = await tx1.wait();
        let event = receipt.events.find(e => e.event === "CollectionCreated");
        let collection1 = await ethers.getContractAt("BaseCollection", event.args.collection);
        const tx2 = await factory.connect(seller).createCollection(
            "Test Collection",
            "Test Symbol",
            false,
            0
        );
        receipt = await tx2.wait();
        event = receipt.events.find(e => e.event === "CollectionCreated");
        let collection2 = await ethers.getContractAt("BaseCollection", event.args.collection);

        // Create nfts across various collections

        await collection1.connect(creator).createNFT(
            "Token 1",
            "Desc 1",
            "ipfs://test",
            10
        );
        await collection1.connect(creator).createNFT(
            "Token 2",
            "Desc 2",
            "ipfs://test",
            30
        );
        await collection2.connect(seller).createNFT(
            "Token 3",
            "Desc 3",
            "ipfs://test",
            11
        );
        // list and buy 1 nft to test secondary sale also
        await primarySale(collection1, marketplace, creator, 1, token, seller, 10, 100, ethers.utils.parseEther("1"));

        // List all nfts for sale
        await marketplace.connect(seller).listNFT(
            collection1.address,
            1,
            ethers.utils.parseEther("1"),
            10
        );
        
        await marketplace.connect(creator).listNFT(
            collection1.address,
            2,
            ethers.utils.parseEther("1"),
            20
        );
        
        await marketplace.connect(seller).listNFT(
            collection2.address,
            1,
            ethers.utils.parseEther("1"),
            5
        );
        
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("100"))
        await collection1.connect(creator).setApprovalForAll(marketplace.address, true);
        await collection1.connect(seller).setApprovalForAll(marketplace.address, true);
        await collection2.connect(seller).setApprovalForAll(marketplace.address, true);

        await collection2.connect(seller).updateRoyaltyPercentage(100);

        await marketplace.connect(buyer).batchBuyListedNFTs([
            {
                collection:collection1.address,
                tokenId:1,
                seller:seller.address,
                quantity:1
            },
            {
                collection:collection1.address,
                tokenId:2,
                seller:creator.address,
                quantity:5
            },
            {
                collection:collection2.address,
                tokenId:1,
                seller:seller.address,
                quantity:5
            }
    ]);
        
    });
});
