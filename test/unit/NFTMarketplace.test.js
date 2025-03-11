const { expect } = require("chai");
const { ethers } = require("hardhat");
const { network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTestContracts } = require("../helpers/setup");
const { primarySale } = require("../helpers/commonFunctions")

describe("NFTMarketplace", function () {
    let token, factory, marketplace;
    let owner, creator, buyer, seller;
    let collection;
    let tokenId;
    
    beforeEach(async function () {
        const contracts = await deployTestContracts();
        token = contracts.token;
        factory = contracts.factory;
        marketplace = contracts.marketplace;
        owner = contracts.owner;
        creator = contracts.creator;
        buyer = contracts.buyer;
        seller = contracts.seller;

        // Create a collection and NFT for testing
        const tx = await factory.connect(creator).createCollection(
            "Test Collection",
            "Test Symbol",
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

    describe("Initial Setup", function () {
        it("Should have correct initial fees", async function () {
            expect(await marketplace.primaryFee()).to.equal(25);
            expect(await marketplace.secondaryFee()).to.equal(10);
        });

        it("Should have correct designated token", async function () {
            expect(await marketplace.designatedToken()).to.equal(token.address);
        });

        it("Should allow owner to update fees", async function () {
            await marketplace.connect(owner).setPrimaryFee(30);
            await marketplace.connect(owner).setSecondaryFee(15);
            expect(await marketplace.primaryFee()).to.equal(30);
            expect(await marketplace.secondaryFee()).to.equal(15);
        });

        it("Should revert when setting invalid fees", async function () {
            await expect(
                marketplace.connect(owner).setPrimaryFee(1001)
            ).to.be.revertedWith("Fee too high");
            
            await expect(
                marketplace.connect(owner).setSecondaryFee(1001)
            ).to.be.revertedWith("Fee too high");
        });

        it("Should revert when non-owner updates fees", async function () {
            await expect(
                marketplace.connect(buyer).setPrimaryFee(30)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            
            await expect(
                marketplace.connect(buyer).setSecondaryFee(15)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should revert when initializing with zero address token", async function () {
            const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
            await expect(
                NFTMarketplace.deploy(
                    ethers.constants.AddressZero,
                    25,
                    10
                )
            ).to.be.revertedWith("Invalid token address");
        });
        it("Should revert when initializing with high primary fee", async function () {
            const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
            await expect(
                NFTMarketplace.deploy(
                    token.address,
                    1001,
                    10
                )
            ).to.be.revertedWith("Primary fee too high");
        });
        it("Should revert when initializing with high Secondary fee", async function () {
            const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
            await expect(
                NFTMarketplace.deploy(
                    token.address,
                    25,
                    1001
                )
            ).to.be.revertedWith("Secondary fee too high");
        });
    });

    describe("Collection Registration", function () {
        let tempContract;
        let tempSigner;
    
        beforeEach(async function () {
            // Create a temporary contract that will act as factory
            tempContract = await (await ethers.getContractFactory("BaseCollection")).deploy();
            await tempContract.deployed();
            
            // Set it as the factory
            await marketplace.connect(owner).setCollectionFactory(tempContract.address);
            
            // Create a signer with the contract's address
            await network.provider.request({
                method: "hardhat_setBalance",
                params: [tempContract.address, "0x1000000000000000000"],
            });
            
            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [tempContract.address],
            });
            
            tempSigner = await ethers.getSigner(tempContract.address);
        });
    
        afterEach(async function () {
            await network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [tempContract.address],
            });
        });
    
        it("Should revert when non-factory tries to register collection", async function () {
            await expect(
                marketplace.connect(owner).registerCollection(collection.address)
            ).to.be.revertedWith("Only factory can register");
        });
    
        it("Should revert when registering zero address", async function () {
            await expect(
                marketplace.connect(tempSigner).registerCollection(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid collection address");
        });
    
        it("Should revert when registering already registered collection", async function () {
            // Create a new collection address to test with
            const newCollection = await (await ethers.getContractFactory("BaseCollection")).deploy();
            await newCollection.deployed();
    
            // First registration
            await marketplace.connect(tempSigner).registerCollection(newCollection.address);
            
            // Try to register again
            await expect(
                marketplace.connect(tempSigner).registerCollection(newCollection.address)
            ).to.be.revertedWith("Already registered");
        });
    });

    describe("Primary Market", function () {
        beforeEach(async function () {
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
        });

        it("Should buy NFT", async function () {
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 1);
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 1, 100, ethers.utils.parseEther("1"));
            expect(await collection.balanceOf(buyer.address, tokenId)).to.equal(1);
        });

        it("Should distribute fees correctly", async function () {
            const initialCreatorBalance = await token.balanceOf(creator.address);
            const initialMarketplaceBalance = await token.balanceOf(marketplace.address);

            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 1);
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 1, 100, ethers.utils.parseEther("1"));

            const finalCreatorBalance = await token.balanceOf(creator.address);
            const finalMarketplaceBalance = await token.balanceOf(marketplace.address);

            expect(finalCreatorBalance).to.be.gt(initialCreatorBalance);
            expect(finalMarketplaceBalance).to.be.gt(initialMarketplaceBalance);
        });
    });

    describe("Secondary Market", function () {
        beforeEach(async function () {
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 2);
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 2, 100, ethers.utils.parseEther("1"));
            await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        });

        it("Should list NFT", async function () {
            await marketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("2"),
                1
            );

            const listing = await marketplace.getListing(collection.address, tokenId, buyer.address);
            expect(listing.seller).to.equal(buyer.address);
            expect(listing.price).to.equal(ethers.utils.parseEther("2"));
            expect(listing.quantity).to.equal(1);
        });

        it("Should revert if tries to buy more than listed Nft", async function () {
            await marketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("2"),
                1
            );
            await expect(
                marketplace.connect(seller).buyListedNFT(
                    collection.address,
                    tokenId,
                    buyer.address,
                    100
                )
            ).to.be.revertedWith("Insufficient quantity");
        });

        it("Should buy listed NFT", async function () {
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

            expect(await collection.balanceOf(seller.address, tokenId)).to.equal(1);
        });

        it("Should revert if tries to buy from incorrect seller", async function () {
            await expect(
                marketplace.connect(seller).buyListedNFT(
                    collection.address,
                    tokenId,
                    owner.address,
                    1
                )
            ).to.be.revertedWith("Invalid listing");
        });

        it("Should distribute fees correctly in secondary sale", async function () {
            await marketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("2"),
                1
            );
            await collection.connect(creator).updateRoyaltyPercentage(100);

            const initialCreatorBalance = await token.balanceOf(creator.address);
            const initialSellerBalance = await token.balanceOf(buyer.address);
            const initialMarketplaceBalance = await token.balanceOf(marketplace.address);

            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
            await marketplace.connect(seller).buyListedNFT(
                collection.address,
                tokenId,
                buyer.address,
                1
            );

            const finalCreatorBalance = await token.balanceOf(creator.address);
            const finalSellerBalance = await token.balanceOf(buyer.address);
            const finalMarketplaceBalance = await token.balanceOf(marketplace.address);

            expect(finalCreatorBalance).to.be.gt(initialCreatorBalance);
            expect(finalSellerBalance).to.be.gt(initialSellerBalance);
            expect(finalMarketplaceBalance).to.be.gt(initialMarketplaceBalance);
        });

        it("Should remove listing", async function () {
            await marketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("2"),
                1
            );

            await marketplace.connect(buyer).removeListing(collection.address, tokenId);
            const listing = await marketplace.getListing(collection.address, tokenId, buyer.address);
            expect(listing.quantity).to.equal(0);
        });
    });

    describe("Collection Management", function () {
        it("Should track registered collections", async function () {
            const collections = await marketplace.getRegisteredCollections(0, 10);
            expect(collections[0]).to.equal(collection.address);
        });

        it("Should get collections by owner", async function () {
            const [collections, total] = await marketplace.getCollectionsByOwner(creator.address, 0, 10);
            expect(collections[0]).to.equal(collection.address);
            expect(total).to.equal(1);
        });

        it("Should handle pagination in getRegisteredCollections", async function () {
            // Create multiple collections
            for(let i = 0; i < 3; i++) {
                await factory.connect(creator).createCollection(
                    `Test Collection ${i}`,
                    "Test Symbol",
                    false,
                    0
                );
            }

            const collections1 = await marketplace.getRegisteredCollections(0, 2);
            expect(collections1.length).to.equal(2);

            const collections2 = await marketplace.getRegisteredCollections(2, 2);
            expect(collections2.length).to.equal(2);
        });

        it("Should handle pagination in getCollectionsByOwner", async function () {
            // Create multiple collections
            for(let i = 0; i < 3; i++) {
                await factory.connect(creator).createCollection(
                    `Test Collection ${i}`,
                    "Test Symbol",
                    false,
                    0
                );
            }

            const [collections1, total1] = await marketplace.getCollectionsByOwner(creator.address, 0, 2);
            expect(collections1.length).to.equal(2);
            expect(total1).to.equal(4); // Including the one created in beforeEach

            const [collections2, total2] = await marketplace.getCollectionsByOwner(creator.address, 2, 2);
            expect(collections2.length).to.equal(2);
            expect(total2).to.equal(4);
        });

        it("Should handle invalid offset in getRegisteredCollections", async function () {
            await expect(
                marketplace.getRegisteredCollections(1000, 10)
            ).to.be.revertedWith("Invalid offset");
        });

        it("Should handle invalid offset in getCollectionsByOwner", async function () {
            await expect(
                marketplace.getCollectionsByOwner(creator.address, 1000, 10)
            ).to.be.revertedWith("Invalid offset");
        });

        it("Should get collections by only owner", async function () {
            for(let i = 0; i < 3; i++) {
                await factory.connect(buyer).createCollection(
                    `Test Collection ${i}`,
                    "Test Symbol",
                    false,
                    0
                );
            }
            const [collections, total] = await marketplace.getCollectionsByOwner(buyer.address, 0, 10);
            // expect(collections[0]).to.equal(collection.address);
            expect(total).to.equal(3);
        });

        it("Should handle zero limit in pagination", async function () {
            const collections = await marketplace.getRegisteredCollections(0, 0);
            expect(collections.length).to.equal(0);

            const [ownerCollections, total] = await marketplace.getCollectionsByOwner(creator.address, 0, 0);
            expect(ownerCollections.length).to.equal(0);
        });
    });

    describe("Fee Management", function () {
        it("Should withdraw platform fees", async function () {
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 1);
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 1, 100, ethers.utils.parseEther("1"));

            const initialBalance = await token.balanceOf(owner.address);
            await marketplace.connect(owner).withdrawFees();
            const finalBalance = await token.balanceOf(owner.address);

            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should handle zero balance in withdrawFees", async function () {
            await marketplace.connect(owner).withdrawFees();
            // Should complete without reverting
        });

        it("Should revert when non-owner withdraws fees", async function () {
            await expect(
                marketplace.connect(buyer).withdrawFees()
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
    describe("Fee Management and Edge Cases", function () {
        it("Should handle zero balance withdrawal", async function () {
            await marketplace.connect(owner).withdrawFees();
            // Should not revert
        });
    
        it("Should handle pagination edge cases", async function () {
            // Test max offset
            await expect(
                marketplace.getRegisteredCollections(1000, 10)
            ).to.be.revertedWith("Invalid offset");
    
            // Test zero limit
            const collections = await marketplace.getRegisteredCollections(0, 0);
            expect(collections.length).to.equal(0);
    
            // Test offset equal to total collections
            const totalCollections = await marketplace.totalCollections();
            const result = await marketplace.getRegisteredCollections(totalCollections, 10);
            expect(result.length).to.equal(0);
        });
    
        it("Should handle owner collections pagination edge cases", async function () {
            // Test max offset
            await expect(
                marketplace.getCollectionsByOwner(owner.address, 1000, 10)
            ).to.be.revertedWith("Invalid offset");
    
            // Test zero limit
            const [collections1, total1] = await marketplace.getCollectionsByOwner(owner.address, 0, 0);
            expect(collections1.length).to.equal(0);
    
            // Create multiple collections
            for(let i = 0; i < 3; i++) {
                await factory.connect(creator).createCollection(
                    `Test Collection ${i}`,
                    "Test symbol",
                    false,
                    0
                );
            }
    
            // Test partial page
            const [collections2, total2] = await marketplace.getCollectionsByOwner(creator.address, 2, 10);
            expect(collections2.length).to.be.lt(10);
        });
    
        it("Should handle fee updates correctly", async function () {
            // Test max fee validation
            await expect(
                marketplace.connect(owner).setPrimaryFee(1001)
            ).to.be.revertedWith("Fee too high");
    
            await expect(
                marketplace.connect(owner).setSecondaryFee(1001)
            ).to.be.revertedWith("Fee too high");
    
            // Test successful updates
            await marketplace.connect(owner).setPrimaryFee(50);
            expect(await marketplace.primaryFee()).to.equal(50);
    
            await marketplace.connect(owner).setSecondaryFee(30);
            expect(await marketplace.secondaryFee()).to.equal(30);
        });
    });
    describe("Edge cases", function () {
        it("Should revert if tries to set null address as collection factory", async function () {
            await expect(marketplace.connect(owner).setCollectionFactory(ethers.constants.AddressZero)).to.be.revertedWith("Invalid factory address");
        });
        it("Should revert if tries to set more than 100 as Primary fee", async function () {
            await expect(marketplace.connect(owner).setPrimaryFee(10001)).to.be.revertedWith("Fee too high");
        });
        it("Should revert if non owner tries to set Collection Factory", async function () {
            await expect(
                marketplace.connect(buyer).setCollectionFactory(token.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("Should revert if tries to list Nft from non existent collection", async function () {
            await expect(
                marketplace.connect(buyer).listNFT(
                    ethers.constants.AddressZero,
                    tokenId,
                    ethers.utils.parseEther("2"),
                    1
                )
            ).to.be.revertedWith("Collection not registered");
        });
        it("Should revert if tries to list Nft zero tokens", async function () {
            await expect(
                marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("0"),
                    1
                )
            ).to.be.revertedWith("Invalid price");
        });
        it("Should revert if tries to list zero quantity Nft", async function () {
            await expect(
                marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("2"),
                    0
                )
            ).to.be.revertedWith("Invalid quantity");
        });
        it("Should revert if tries to list more than owned Nft", async function () {
            await expect(
                marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("2"),
                    100
                )
            ).to.be.revertedWith("Insufficient balance");
        });
        it("Should revert if tries to remove listing of non existing Nft", async function () {
            await expect(
                marketplace.connect(buyer).removeListing(ethers.constants.AddressZero, tokenId)
            ).to.be.revertedWith("No active listing");
        });
        it("Should revert if tries to buy Nft from unregistered collection", async function () {
            await expect(
                marketplace.connect(seller).buyListedNFT(
                    ethers.constants.AddressZero,
                    tokenId,
                    buyer.address,
                    1
                )
            ).to.be.revertedWith("Collection not registered");
        });
    });
    describe("Auction Functionality", function () {
        let collection, tokenId;
        
        beforeEach(async function () {
            // Create collection and NFT
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            // Mint some NFTs to seller for auction
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
        });
    
        describe("Auction Creation", function () {
            it("Should create auction successfully", async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                const tx = await marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600 // 1 hour
                );
    
                const receipt = await tx.wait();
                const event = receipt.events.find(e => e.event === "AuctionCreated");
                expect(event.args.collection).to.equal(collection.address);
                expect(event.args.tokenId).to.equal(tokenId);
                expect(event.args.quantity).to.equal(2);
            });
    
            it("Should revert with invalid duration", async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                await expect(
                    marketplace.connect(buyer).createAuction(
                        collection.address,
                        tokenId,
                        2,
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("0.1"),
                        300 // 5 minutes (too short)
                    )
                ).to.be.revertedWith("Invalid duration");
            });
    
            it("Should revert if already listed", async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                await marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("1"),
                    2
                );
    
                await expect(
                    marketplace.connect(buyer).createAuction(
                        collection.address,
                        tokenId,
                        2,
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("0.1"),
                        3600
                    )
                ).to.be.revertedWith("Already listed");
            });
        });
    
        describe("Bidding", function () {
            let auctionId;
    
            beforeEach(async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                const tx = await marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                );
                const receipt = await tx.wait();
                auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
            });
    
            it("Should place bid successfully", async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
                const auction = await marketplace.auctions(auctionId);
                expect(auction.highestBidder).to.equal(seller.address);
                expect(auction.currentPrice).to.equal(ethers.utils.parseEther("1.2"));
            });
    
            it("Should extend auction time for late bids", async function () {
                // Get initial auction end time
                const initialAuction = await marketplace.auctions(auctionId);
                const initialEndTime = initialAuction.endTime;
            
                // Move time close to end
                await ethers.provider.send("evm_increaseTime", [3500]); // 100 seconds before end
                await ethers.provider.send("evm_mine");
                
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
            
                const finalAuction = await marketplace.auctions(auctionId);
                // Simply check if auction was extended
                expect(finalAuction.endTime).to.be.gt(initialEndTime);
            });
    
            it("Should refund previous bidder", async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
                const initialBalance = await token.balanceOf(seller.address);
                
                await token.connect(creator).approve(marketplace.address, ethers.utils.parseEther("2"));
                await marketplace.connect(creator).placeBid(auctionId, ethers.utils.parseEther("1.5"));
    
                const finalBalance = await token.balanceOf(seller.address);
                expect(finalBalance).to.equal(initialBalance.add(ethers.utils.parseEther("1.2")));
            });
    
            it("Should revert with low bid", async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await expect(
                    marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.0"))
                ).to.be.revertedWith("Bid too low");
            });
        });
    
        describe("Auction Settlement", function () {
            let auctionId;
    
            beforeEach(async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                const tx = await marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                );
                const receipt = await tx.wait();
                auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
            });
    
            it("Should settle auction successfully", async function () {
                await ethers.provider.send("evm_increaseTime", [3601]);
                await marketplace.connect(buyer).settleAuction(auctionId);
    
                const auction = await marketplace.auctions(auctionId);
                expect(auction.status).to.equal(1); // ENDED
                expect(await collection.balanceOf(seller.address, tokenId)).to.equal(2);
            });
    
            it("Should distribute fees correctly", async function () {
                await collection.connect(creator).updateRoyaltyPercentage(100);
                const initialCreatorBalance = await token.balanceOf(creator.address);
                const initialSellerBalance = await token.balanceOf(buyer.address);
                
                await ethers.provider.send("evm_increaseTime", [3601]);
                await marketplace.connect(buyer).settleAuction(auctionId);
    
                const finalCreatorBalance = await token.balanceOf(creator.address);
                const finalSellerBalance = await token.balanceOf(buyer.address);
    
                expect(finalCreatorBalance).to.be.gt(initialCreatorBalance);
                expect(finalSellerBalance).to.be.gt(initialSellerBalance);
            });
    
            it("Should revert if auction not ended", async function () {
                await expect(
                    marketplace.connect(buyer).settleAuction(auctionId)
                ).to.be.revertedWith("Auction not ended");
            });
        });
    
        describe("Auction Cancellation", function () {
            let auctionId;
    
            beforeEach(async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                const tx = await marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                );
                const receipt = await tx.wait();
                auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
            });
    
            it("Should cancel auction successfully", async function () {
                await marketplace.connect(buyer).cancelAuction(auctionId);
                
                const auction = await marketplace.auctions(auctionId);
                expect(auction.status).to.equal(2); // CANCELLED
                expect(await collection.balanceOf(buyer.address, tokenId)).to.equal(5);
            });
    
            it("Should revert if not seller", async function () {
                await expect(
                    marketplace.connect(seller).cancelAuction(auctionId)
                ).to.be.revertedWith("Not seller");
            });
    
            it("Should revert if bids placed", async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
                await expect(
                    marketplace.connect(buyer).cancelAuction(auctionId)
                ).to.be.revertedWith("Bids already placed");
            });
        });
    
        describe("Admin Functions", function () {
            it("Should update auction extension interval", async function () {
                await marketplace.connect(owner).setAuctionExtensionInterval(900); // 15 minutes
                expect(await marketplace.auctionExtensionInterval()).to.equal(900);
            });
    
            it("Should revert with invalid interval", async function () {
                await expect(
                    marketplace.connect(owner).setAuctionExtensionInterval(0)
                ).to.be.revertedWith("Invalid interval");
            });
    
            it("Should revert if non-owner tries to update interval", async function () {
                await expect(
                    marketplace.connect(buyer).setAuctionExtensionInterval(900)
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });
        });
    });  
    
    describe("Auction Parameter Validation", function () {
        let collection, tokenId;
    
        beforeEach(async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
        });
    
        it("Should revert with unregistered collection", async function () {
            const unregisteredCollection = await (await ethers.getContractFactory("BaseCollection")).deploy();
            await expect(
                marketplace.connect(buyer).createAuction(
                    unregisteredCollection.address,
                    tokenId,
                    1,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                )
            ).to.be.revertedWith("Collection not registered");
        });
    
        it("Should revert with insufficient balance", async function () {
            await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    10000, // More than owned
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                )
            ).to.be.revertedWith("Insufficient balance");
        });
    
        it("Should revert when not approved", async function () {
            await collection.connect(buyer).setApprovalForAll(marketplace.address, false);
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    1,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                )
            ).to.be.revertedWith("Not approved");
        });
    
        it("Should revert with invalid duration", async function () {
            await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
            // Test duration less than minimum
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    1,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    600 // 10 minutes
                )
            ).to.be.revertedWith("Invalid duration");
    
            // Test duration more than maximum
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    1,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    31 * 24 * 3600 // 31 days
                )
            ).to.be.revertedWith("Invalid duration");
        });
    });
    
    describe("Bid Placement Edge Cases", function () {
        let collection, tokenId, auctionId;
    
        beforeEach(async function () {
            // Create collection and NFT
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            // Buy NFTs and create auction
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
            await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        });

        it("Should revert when auction is not active", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Place a valid bid first
            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
            await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
            // End auction
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine");
            await marketplace.connect(buyer).settleAuction(auctionId);
    
            // Try to bid on ended auction
            await token.connect(creator).approve(marketplace.address, ethers.utils.parseEther("2"));
            await expect(
                marketplace.connect(creator).placeBid(auctionId, ethers.utils.parseEther("1.5"))
            ).to.be.revertedWith("Auction not active");
        });
    
        it("Should revert when auction has ended", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Move time past end time
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine");
    
            // Try to bid after end time
            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
            await expect(
                marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"))
            ).to.be.revertedWith("Auction ended");
        });
    
        it("Should revert when transfer fails", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Don't approve tokens
            await expect(
                marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });
    });
    describe("Listing and Trading Edge Cases", function () {
        let collection, tokenId;
    
        beforeEach(async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
            await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
        });
    
        it("Should revert when trying to list while auction is active", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
    
            // Try to list same NFT while auction is active
            await expect(
                marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("1"),
                    1
                )
            ).to.be.revertedWith("Already listed");
        });
    
        it("Should allow listing after auction ends", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Place bid first
            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
            await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
            // End auction
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine");
            await marketplace.connect(buyer).settleAuction(auctionId);
    
            // Should now be able to list remaining NFTs
            await marketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("1"),
                1
            );
        });
    
        it("Should handle removing auction listing", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
    
            // Remove auction listing
            await marketplace.connect(buyer).removeListing(collection.address, tokenId);
        });
    
        it("Should revert when trying to buy auction listing as fixed price", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
    
            // Try to buy as fixed price
            await expect(
                marketplace.connect(seller).buyListedNFT(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1
                )
            ).to.be.revertedWith("Not a fixed price listing");
        });
    
        it("Should validate auction parameters correctly", async function () {
            // Test with zero quantity
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    0,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                )
            ).to.be.revertedWith("Invalid quantity");
    
            // Test with zero start price
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    1,
                    0,
                    ethers.utils.parseEther("0.1"),
                    3600
                )
            ).to.be.revertedWith("Invalid start price");
    
            // Test with zero min bid increment
            await expect(
                marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    1,
                    ethers.utils.parseEther("1"),
                    0,
                    3600
                )
            ).to.be.revertedWith("Invalid min bid increment");
    
            // Test successful case
            await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                1,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
        });
        
    
        it("Should revert removing listing when bids are placed", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Place bid
            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
            await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
            // Try to remove auction with bids
            await expect(
                marketplace.connect(buyer).removeListing(collection.address, tokenId)
            ).to.be.revertedWith("Bids already placed");
        });
    
        it("Should revert settling auction when not active", async function () {
            // Create and cancel auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            await marketplace.connect(buyer).cancelAuction(auctionId);
    
            // Try to settle cancelled auction
            await expect(
                marketplace.connect(buyer).settleAuction(auctionId)
            ).to.be.revertedWith("Auction not active");
        });
    
        it("Should revert settling auction with no bids", async function () {
            // Create auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Try to settle without bids
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine");
            
            await expect(
                marketplace.connect(buyer).settleAuction(auctionId)
            ).to.be.revertedWith("No bids placed");
        });
    
        it("Should revert cancelling auction when not active", async function () {
            // Create and settle auction
            const tx = await marketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Place bid and settle
            await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
            await marketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
            
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine");
            await marketplace.connect(buyer).settleAuction(auctionId);
    
            // Try to cancel settled auction
            await expect(
                marketplace.connect(buyer).cancelAuction(auctionId)
            ).to.be.revertedWith("Auction not active");
        });
    });
    describe("Auction Status Edge Cases with Mock", function () {
        let mockMarketplace, collection, tokenId, mockFactory;
        
        beforeEach(async function () {
            // Deploy mock marketplace
            const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
            mockMarketplace = await MockMarketplace.deploy(
                token.address,
                25,              // primaryFee (2.5%)
                10              // secondaryFee (1%)
            );
            await mockMarketplace.deployed();
    
            // Deploy new factory pointing to mock marketplace
            const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
            mockFactory = await CollectionFactory.deploy(
                await factory.collectionImplementation(),
                await factory.dropImplementation(),
                mockMarketplace.address
            );
            await mockFactory.deployed();
    
            // Set factory in mock marketplace
            await mockMarketplace.setCollectionFactory(mockFactory.address);
            
            // Create collection through mock factory
            const tx = await mockFactory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            // Create and mint NFT
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            // Buy NFTs
            await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await mockMarketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
            await collection.connect(buyer).setApprovalForAll(mockMarketplace.address, true);
        });
    
        it("Should revert removing listing when auction is not active", async function () {
            // Create auction
            const tx = await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Force update auction status to ENDED
            await mockMarketplace.updateAuctionStatus(auctionId,true);
    
            // Try to remove listing
            await expect(
                mockMarketplace.connect(buyer).removeListing(collection.address, tokenId)
            ).to.be.revertedWith("Auction not active");
            
        });
        it("Should be able to list the nft once the auction is ended", async function () {
            // Create auction
            const tx = await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Force update auction status to ENDED
            await mockMarketplace.updateAuctionStatus(auctionId,true);
            // Should be able to list the nft once the auction is ended
            await mockMarketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("1"),
                2
            );
            
        });
        it("Should be able to create auction again the nft once the auction is ended", async function () {
            // Create auction
            const tx = await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Force update auction status to ENDED
            await mockMarketplace.updateAuctionStatus(auctionId,true);
    
            // Try to remove listing
            await expect(
                mockMarketplace.connect(buyer).removeListing(collection.address, tokenId)
            ).to.be.revertedWith("Auction not active");
            
            // Should be able to create auction again the nft once the auction is ended
            await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            
        });
    });
    
    describe("Reentrancy Protection", function () {
        let mockMarketplace, collection, reentrantToken, reentrantNFT, tokenId;
        
        beforeEach(async function () {
            // Deploy reentrant token
            const ReentrantToken = await ethers.getContractFactory("ReentrantTokenMock");
            reentrantToken = await ReentrantToken.deploy();
            await reentrantToken.deployed();
    
            // Deploy reentrant NFT
            const ReentrantERC1155 = await ethers.getContractFactory("ReentrantERC1155Mock");
            reentrantNFT = await ReentrantERC1155.deploy();
            await reentrantNFT.deployed();
    
            // Deploy mock marketplace
            const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
            mockMarketplace = await MockMarketplace.deploy(
                reentrantToken.address,
                25,
                10
            );
            await mockMarketplace.deployed();
    
            await reentrantToken.setMarketplace(mockMarketplace.address);
            await reentrantNFT.setMarketplace(mockMarketplace.address);
    
            // Deploy new factory pointing to mock marketplace
            const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
            const mockFactory = await CollectionFactory.deploy(
                await factory.collectionImplementation(),
                await factory.dropImplementation(),
                mockMarketplace.address
            );
            await mockFactory.deployed();
    
            // Set factory in mock marketplace
            await mockMarketplace.setCollectionFactory(mockFactory.address);
            
            // Create collection through mock factory
            const tx = await mockFactory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            // Create and mint NFT
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            // Setup initial states
            await reentrantToken.transfer(buyer.address, ethers.utils.parseEther("100"));
            await reentrantToken.transfer(seller.address, ethers.utils.parseEther("100"));
            await reentrantToken.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("100"));
            await reentrantToken.connect(seller).approve(mockMarketplace.address, ethers.utils.parseEther("100"));
    
            // Mint NFTs
            await reentrantNFT.mint(seller.address, tokenId, 10);
            await reentrantNFT.connect(seller).setApprovalForAll(mockMarketplace.address, true);
        });
    
        it("Should prevent reentrant calls through placeBid", async function () {
            // Buy NFTs first
            await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await mockMarketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
    
            // Create auction
            await collection.connect(buyer).setApprovalForAll(mockMarketplace.address, true);
            const tx = await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Setup reentrant parameters
            await reentrantToken.setReentrantParams(collection.address, tokenId, 2);
            
            // Try to place bid which should trigger reentry
            await expect(
                mockMarketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"))
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("Should prevent reentrant calls through buyListedNFT", async function () {
            // Buy NFTs first
            await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await mockMarketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
    
            // Create listing
            await collection.connect(buyer).setApprovalForAll(mockMarketplace.address, true);
            await mockMarketplace.connect(buyer).listNFT(
                collection.address,
                tokenId,
                ethers.utils.parseEther("1"),
                2
            );
    
            // Setup reentrant parameters
            await reentrantToken.setReentrantParams(collection.address, tokenId, 3); // New function number for buyListedNFT
            
            // Try to buy listed NFT which should trigger reentry
            await expect(
                mockMarketplace.connect(seller).buyListedNFT(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1
                )
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
    
        it("Should prevent reentrant calls through settleAuction", async function () {
            // Buy NFTs first
            await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await mockMarketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
    
            // Create auction
            await collection.connect(buyer).setApprovalForAll(mockMarketplace.address, true);
            const tx = await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            // Place bid
            await reentrantToken.connect(seller).approve(mockMarketplace.address, ethers.utils.parseEther("2"));
            await mockMarketplace.connect(seller).placeBid(auctionId, ethers.utils.parseEther("1.2"));
    
            // Move time forward
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine");
    
            // Setup reentrant parameters
            await reentrantToken.setReentrantParams(collection.address, tokenId, 4); // New function number for settleAuction
            
            // Try to settle auction which should trigger reentry
            await expect(
                mockMarketplace.connect(buyer).settleAuction(auctionId)
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
    
        it("Should prevent reentrant calls through cancelAuction", async function () {
            // Buy NFTs first
            await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await mockMarketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
    
            // Create auction
            await collection.connect(buyer).setApprovalForAll(mockMarketplace.address, true);
            const tx = await mockMarketplace.connect(buyer).createAuction(
                collection.address,
                tokenId,
                2,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("0.1"),
                3600
            );
            const receipt = await tx.wait();
            const auctionId = receipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
    
            
            const mockBaseCollection = await ethers.getContractFactory("MockReentrantBaseCollection");
            let mockbasecoll = await mockBaseCollection.deploy(mockMarketplace.address);
            await mockbasecoll.deployed();
            // Setup reentrant parameters
            await mockbasecoll.setReentryFunction(3);
            await mockMarketplace.updateAuctionCollections(auctionId,mockbasecoll.address);
            
            // Try to cancel auction which should trigger reentry
            await expect(
                mockMarketplace.connect(buyer).cancelAuction(auctionId)
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
    
        it("Should prevent reentrant calls through createAuction", async function () {
            const mockBaseCollection = await ethers.getContractFactory("MockReentrantBaseCollection");
            let mockbasecoll = await mockBaseCollection.deploy(mockMarketplace.address);
            await mockbasecoll.deployed();
            await mockMarketplace.registerCollectionMock(mockbasecoll.address);
            // Buy NFTs first
            // await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
            // await mockMarketplace.connect(buyer).buyNFT(mockbasecoll.address, tokenId, 5);
    
            // Setup for auction creation
            await mockbasecoll.connect(buyer).setApprovalForAll(mockMarketplace.address, true);

            
            // Setup reentrant parameters
            
            // Setup reentrant parameters
            await mockbasecoll.setReentryFunction(1);
            
            // Try to create auction which should trigger reentry
            await expect(
                mockMarketplace.connect(buyer).createAuction(
                    mockbasecoll.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                )
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
        it("Should prevent reentrant calls through listNft", async function () {
            const mockBaseCollection = await ethers.getContractFactory("MockReentrantERC1155");
            let mockbasecoll = await mockBaseCollection.deploy(mockMarketplace.address);
            await mockbasecoll.deployed();
            await mockMarketplace.registerCollectionMock(mockbasecoll.address);
            // Setup reentrant parameters
            await mockbasecoll.setReentryFunction(1);
            
            // Try to create auction which should trigger reentry
            await expect(
                mockMarketplace.connect(buyer).listNFT(
                    mockbasecoll.address,
                    tokenId,
                    2,
                    1
                )
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
        it("Should prevent reentrant calls through buy batch nfts", async function () {
            const mockBaseCollection = await ethers.getContractFactory("MockReentrantBaseCollection");
            let mockbasecoll = await mockBaseCollection.deploy(mockMarketplace.address);
            await mockbasecoll.deployed();
            await mockMarketplace.registerCollectionMock(mockbasecoll.address);
            // Setup reentrant parameters
            await mockbasecoll.setReentryFunction(9);
            
            
            await mockMarketplace.connect(creator).listNFT(
                mockbasecoll.address,
                tokenId,
                ethers.utils.parseEther("1"),
                5  // List all NFTs
            );
            
           
            await token.connect(seller).approve(mockMarketplace.address,ethers.utils.parseEther("10000"));

            await expect(mockMarketplace.connect(seller).batchBuyListedNFTs([
                {
                    collection:mockbasecoll.address,
                    tokenId:tokenId,
                    seller:creator.address,
                    quantity:1
                }
            ])).to.be.revertedWith("ReentrancyGuard: reentrant call");

        });
        
    
    });
    describe("Offer System", function () {
        let collection, tokenId;
    
        beforeEach(async function () {
            // Create collection and NFT
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            // Mint some NFTs to seller
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
        });
    
        describe("Making Offers", function () {
            it("Should create offer successfully", async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    2,
                    ethers.utils.parseEther("1")
                );
    
                const receipt = await tx.wait();
                const event = receipt.events.find(e => e.event === "OfferCreated");
                expect(event.args.collection).to.equal(collection.address);
                expect(event.args.tokenId).to.equal(tokenId);
                expect(event.args.buyer).to.equal(seller.address);
                expect(event.args.seller).to.equal(buyer.address);
                expect(event.args.quantity).to.equal(2);
            });
    
            it("Should revert with invalid seller", async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                await expect(
                    marketplace.connect(seller).makeOffer(
                        collection.address,
                        tokenId,
                        ethers.constants.AddressZero,
                        2,
                        ethers.utils.parseEther("1")
                    )
                ).to.be.revertedWith("Invalid seller");
            });
    
            it("Should revert when making offer to self", async function () {
                await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("2"));
                await expect(
                    marketplace.connect(buyer).makeOffer(
                        collection.address,
                        tokenId,
                        buyer.address,
                        2,
                        ethers.utils.parseEther("1")
                    )
                ).to.be.revertedWith("Cannot make offer to self");
            });
        });
    
        describe("Managing Offers", function () {
            let offerId;
    
            beforeEach(async function () {
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    2,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
            });
    
            it("Should accept offer successfully", async function () {
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                await marketplace.connect(buyer).acceptOffer(offerId);
    
                const offer = await marketplace.getOffer(offerId);
                expect(offer.offer.status).to.equal(1); // ACCEPTED
                expect(await collection.balanceOf(seller.address, tokenId)).to.equal(2);
            });
    
            it("Should reject offer successfully", async function () {
                await marketplace.connect(buyer).rejectOffer(offerId);
    
                const offer = await marketplace.getOffer(offerId);
                expect(offer.offer.status).to.equal(2); // REJECTED
            });
    
            it("Should cancel offer successfully", async function () {
                await marketplace.connect(seller).cancelOffer(offerId);
    
                const offer = await marketplace.getOffer(offerId);
                expect(offer.offer.status).to.equal(3); // CANCELLED
            });
    
            it("Should handle listing quantity updates when accepting offer", async function () {
                // Create listing first
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                await marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("1"),
                    4
                );
                // updating royalty %
                await collection.connect(creator).updateRoyaltyPercentage(100);
                // Accept offer for 2 NFTs
                await marketplace.connect(buyer).acceptOffer(offerId);
        
                const listing = await marketplace.listings(collection.address, tokenId, buyer.address);
                expect(listing.quantity).to.equal(3); // Should be 3 because it will use 1 from unlisted (5-4=1) and 1 from listed
            });
        });
    
        describe("Offer Queries", function () {
            beforeEach(async function () {
                // Create multiple offers
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
                await token.connect(creator).approve(marketplace.address, ethers.utils.parseEther("10"));
    
                // Seller makes offers
                await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    2,
                    ethers.utils.parseEther("1.5")
                );
    
                // Creator makes offer
                await marketplace.connect(creator).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("2")
                );
            });
    
            it("Should get offers by token", async function () {
                const [offers, total] = await marketplace.getOffersByToken(
                    collection.address,
                    tokenId,
                    0,
                    10
                );
                expect(total).to.equal(3);
                expect(offers.length).to.equal(3);
            });
    
            it("Should get offers to seller", async function () {
                const [offers, total] = await marketplace.getOffersToSeller(
                    buyer.address,
                    0,
                    10
                );
                expect(total).to.equal(3);
                expect(offers.length).to.equal(3);
            });
    
            it("Should get offers by buyer", async function () {
                const [offers, total] = await marketplace.getOffersByBuyer(
                    seller.address,
                    0,
                    10
                );
                expect(total).to.equal(2);
                expect(offers.length).to.equal(2);
            });
    
            it("Should handle pagination in queries", async function () {
                const [offers, total] = await marketplace.getOffersToSeller(
                    buyer.address,
                    1,
                    2
                );
                expect(total).to.equal(3);
                expect(offers.length).to.equal(2);
            });
        });
    });
    describe("Offer System Edge Cases", function () {
        let collection, tokenId;
    
        beforeEach(async function () {
            const tx = await factory.connect(creator).createCollection(
                "Test Collection",
                "Test Symbol",
                false,
                0
            );
            const receipt = await tx.wait();
            collection = await ethers.getContractAt("BaseCollection", receipt.events.find(e => e.event === "CollectionCreated").args.collection);
    
            await collection.connect(creator).createNFT(
                "Token 1",
                "Desc 1",
                "ipfs://test",
                100
            );
            tokenId = 1;
    
            await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
            await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
            // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
        });
    
        it("Should prevent reentrancy in makeOffer", async function () {
            // Deploy reentrant token
            const ReentrantToken = await ethers.getContractFactory("ReentrantTokenMock");
            const reentrantToken = await ReentrantToken.deploy();
            await reentrantToken.deployed();
    
            // Deploy new marketplace with reentrant token
            const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
            const mockMarketplace = await MockMarketplace.deploy(
                reentrantToken.address,
                25,
                10
            );
            await mockMarketplace.deployed();
            await reentrantToken.setMarketplace(mockMarketplace.address);
            await mockMarketplace.setCollectionFactory(factory.address);
            await mockMarketplace.registerCollectionMock(collection.address);
    
            await reentrantToken.connect(seller).approve(mockMarketplace.address,ethers.utils.parseEther("1000"));
            await reentrantToken.transfer(seller.address,ethers.utils.parseEther("1000"));
            // Setup reentrant parameters
            await reentrantToken.setReentrantParams(collection.address, tokenId, 7); // New function number for makeOffer
            
    
            // Try to make offer which should trigger reentry
            await expect(
                mockMarketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                )
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
    
        it("Should revert when collection is not registered", async function () {
            const UnregisteredCollection = await ethers.getContractFactory("BaseCollection");
            const unregisteredCollection = await UnregisteredCollection.deploy();
            await unregisteredCollection.deployed();
    
            await expect(
                marketplace.connect(seller).makeOffer(
                    unregisteredCollection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                )
            ).to.be.revertedWith("Collection not registered");
        });
    
        it("Should revert with zero quantity", async function () {
            await expect(
                marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    0,
                    ethers.utils.parseEther("1")
                )
            ).to.be.revertedWith("Invalid quantity");
        });
    
        it("Should revert with zero price", async function () {
            await expect(
                marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    0
                )
            ).to.be.revertedWith("Invalid price");
        });
    
        it("Should revert when seller has insufficient balance", async function () {
            await expect(
                marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    10, // More than buyer's balance of 5
                    ethers.utils.parseEther("1")
                )
            ).to.be.revertedWith("Insufficient seller balance");
        });

        describe("Accept Offer Edge Cases", function () {
            it("Should prevent reentrancy in acceptOffer", async function () {
                // Deploy reentrant token
                const ReentrantToken = await ethers.getContractFactory("ReentrantTokenMock");
                const reentrantToken = await ReentrantToken.deploy();
                await reentrantToken.deployed();
    
                // Deploy new marketplace with reentrant token
                const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
                const mockMarketplace = await MockMarketplace.deploy(
                    reentrantToken.address,
                    25,
                    10
                );
                await mockMarketplace.deployed();
    
                await reentrantToken.setMarketplace(mockMarketplace.address);
                await mockMarketplace.setCollectionFactory(factory.address);
                await mockMarketplace.registerCollectionMock(collection.address);
    
                // Create offer
                await reentrantToken.transfer(seller.address, ethers.utils.parseEther("10"));
                await reentrantToken.connect(seller).approve(mockMarketplace.address, ethers.utils.parseEther("2"));
                await collection.connect(buyer).setApprovalForAll(mockMarketplace.address,true);
                
                const tx = await mockMarketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
    
                // Setup reentrant parameters
                await reentrantToken.setReentrantParams(collection.address, tokenId, 8); // New function number for acceptOffer
    
                // Try to accept offer which should trigger reentry
                await expect(
                    mockMarketplace.connect(buyer).acceptOffer(offerId)
                ).to.be.revertedWith("ReentrancyGuard: reentrant call");
            });
    
            it("Should revert when offer does not exist", async function () {
                await expect(
                    marketplace.connect(buyer).acceptOffer(999) // Non-existent offerId
                ).to.be.revertedWith("Offer does not exist");
            });
    
            it("Should revert when offer status is not pending", async function () {
                // Create and cancel offer first
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
    
                // Cancel the offer
                await marketplace.connect(seller).cancelOffer(offerId);
    
                // Try to accept cancelled offer
                await expect(
                    marketplace.connect(buyer).acceptOffer(offerId)
                ).to.be.revertedWith("Invalid offer status");
            });
    
            it("Should revert when caller is not the offer recipient", async function () {
                // Create offer
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
    
                // Try to accept offer from wrong address
                await expect(
                    marketplace.connect(seller).acceptOffer(offerId) // seller instead of buyer
                ).to.be.revertedWith("Not offer recipient");
            });
        });
        describe("Offer Acceptance Validations", function () {
            it("Should revert when seller balance is insufficient", async function () {
                // Create offer
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
    
                // Transfer all NFTs away from buyer to make balance insufficient
                await collection.connect(buyer).safeTransferFrom(
                    buyer.address,
                    seller.address,
                    tokenId,
                    5,
                    "0x"
                );
    
                // Try to accept offer with insufficient balance
                await expect(
                    marketplace.connect(buyer).acceptOffer(offerId)
                ).to.be.revertedWith("Insufficient balance");
            });
    
            it("Should revert when trying to accept offer during active auction", async function () {
                // Create auction first
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                const auctionTx = await marketplace.connect(buyer).createAuction(
                    collection.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600
                );
    
                // Create offer
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
    
                // Try to accept offer while auction is active
                await expect(
                    marketplace.connect(buyer).acceptOffer(offerId)
                ).to.be.revertedWith("Active auction exists");
            });
    
            it("Should delete listing when all listed NFTs are used", async function () {
                // Create listing for all NFTs
                await collection.connect(buyer).setApprovalForAll(marketplace.address, true);
                await marketplace.connect(buyer).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("1"),
                    5  // List all NFTs
                );
    
                // Create offer for all listed NFTs
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("5"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    5,  // Offer for all NFTs
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
    
                // Accept offer
                const acceptTx = await marketplace.connect(buyer).acceptOffer(offerId);
                const acceptReceipt = await acceptTx.wait();
    
                // Verify listing was deleted
                const listing = await marketplace.listings(collection.address, tokenId, buyer.address);
                expect(listing.quantity).to.equal(0);
    
                // Verify ListingRemoved event was emitted with correct reason
                const removeEvent = acceptReceipt.events.find(e => e.event === "ListingRemoved");
                expect(removeEvent.args.reason).to.equal("ZERO_QUANTITY");
            });
        });
        describe("Cancel Offer Edge Cases", function () {
            let offerId;
        
            beforeEach(async function () {
                // Create offer
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
            });
        
            it("Should prevent reentrancy in cancelOffer", async function () {
                // Deploy reentrant token
                const ReentrantToken = await ethers.getContractFactory("ReentrantTokenMock");
                const reentrantToken = await ReentrantToken.deploy();
                await reentrantToken.deployed();
        
                // Deploy new marketplace with reentrant token
                const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
                const mockMarketplace = await MockMarketplace.deploy(
                    reentrantToken.address,
                    25,
                    10
                );
                await mockMarketplace.deployed();
        
                await reentrantToken.setMarketplace(mockMarketplace.address);
                await mockMarketplace.registerCollectionMock(collection.address);
        
                // Create offer with reentrant token
                await reentrantToken.transfer(seller.address, ethers.utils.parseEther("10"));
                await reentrantToken.connect(seller).approve(mockMarketplace.address, ethers.utils.parseEther("2"));
                
                const tx = await mockMarketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const newOfferId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
        
                // Setup reentrant parameters
                await reentrantToken.setReentrantParams(collection.address, tokenId, 9); // New function number for cancelOffer
        
                // Try to cancel offer which should trigger reentry
                await expect(
                    mockMarketplace.connect(seller).cancelOffer(newOfferId)
                ).to.be.revertedWith("ReentrancyGuard: reentrant call");
            });
        
            it("Should revert when offer does not exist", async function () {
                await expect(
                    marketplace.connect(seller).cancelOffer(999) // Non-existent offerId
                ).to.be.revertedWith("Offer does not exist");
            });
        
            it("Should revert when caller is not offer creator", async function () {
                await expect(
                    marketplace.connect(buyer).cancelOffer(offerId) // buyer instead of seller
                ).to.be.revertedWith("Not offer creator");
            });
        
            it("Should revert when offer status is not pending", async function () {
                // First cancel the offer
                await marketplace.connect(seller).cancelOffer(offerId);
        
                // Try to cancel again
                await expect(
                    marketplace.connect(seller).cancelOffer(offerId)
                ).to.be.revertedWith("Invalid offer status");
            });
        });
        describe("Reject Offer Edge Cases", function () {
            let offerId;
        
            beforeEach(async function () {
                // Create offer
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
            });
        
            it("Should revert when offer does not exist", async function () {
                await expect(
                    marketplace.connect(buyer).rejectOffer(999) // Non-existent offerId
                ).to.be.revertedWith("Offer does not exist");
            });
        
            it("Should revert when offer status is not pending", async function () {
                // First reject the offer
                await marketplace.connect(buyer).rejectOffer(offerId);
        
                // Try to reject again
                await expect(
                    marketplace.connect(buyer).rejectOffer(offerId)
                ).to.be.revertedWith("Invalid offer status");
            });
        
            it("Should revert when caller is not token owner", async function () {
                // Transfer all NFTs away from buyer
                await collection.connect(buyer).safeTransferFrom(
                    buyer.address,
                    seller.address,
                    tokenId,
                    5,
                    "0x"
                );
        
                // Try to reject offer when caller has no tokens
                await expect(
                    marketplace.connect(buyer).rejectOffer(offerId)
                ).to.be.revertedWith("Not token owner");
            });
            it("Should prevent reentrancy in rejectOffer", async function () {
                // Deploy reentrant token
                const ReentrantToken = await ethers.getContractFactory("ReentrantTokenMock");
                const reentrantToken = await ReentrantToken.deploy();
                await reentrantToken.deployed();
        
                // Deploy new marketplace with reentrant token
                const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
                const mockMarketplace = await MockMarketplace.deploy(
                    reentrantToken.address,
                    25,
                    10
                );
                await mockMarketplace.deployed();

                const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
                mockFactory = await CollectionFactory.deploy(
                    await factory.collectionImplementation(),
                    await factory.dropImplementation(),
                    mockMarketplace.address
                );
                await mockFactory.deployed();
                // Set factory in mock marketplace
                await mockMarketplace.setCollectionFactory(mockFactory.address);
                const tx1 = await mockFactory.connect(creator).createCollection(
                    "Test Collection",
                    "Test Symbol",
                    false,
                    0
                );
                const receipt1 = await tx1.wait();
                collectionMock = await ethers.getContractAt("BaseCollection", receipt1.events.find(e => e.event === "CollectionCreated").args.collection);
                await collectionMock.connect(creator).createNFT(
                    "Token 1",
                    "Desc 1",
                    "ipfs://test",
                    100
                );
                tokenId = 1;
                await reentrantToken.setMarketplace(mockMarketplace.address);
                await mockMarketplace.registerCollectionMock(collectionMock.address);
                await reentrantToken.transfer(buyer.address,ethers.utils.parseEther("100"))
                // Buy NFTs first
                await reentrantToken.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
                await primarySale(collectionMock, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
                // await mockMarketplace.connect(buyer).buyNFT(collectionMock.address, tokenId, 5);
                // Create offer with reentrant token
                await reentrantToken.transfer(seller.address, ethers.utils.parseEther("10"));
                await reentrantToken.connect(seller).approve(mockMarketplace.address, ethers.utils.parseEther("2"));
                
                const tx = await mockMarketplace.connect(seller).makeOffer(
                    collectionMock.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const newOfferId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
        
                // Setup reentrant parameters
                await reentrantToken.setReentrantParams(collectionMock.address, tokenId, 10); // New function number for rejectOffer
        
                // Try to reject offer which should trigger reentry
                await expect(
                    mockMarketplace.connect(buyer).rejectOffer(newOfferId)
                ).to.be.revertedWith("ReentrancyGuard: reentrant call");
            });
            it("Should prevent reentrancy in removeListing", async function () {
                // Deploy reentrant token
                const ReentrantToken = await ethers.getContractFactory("ReentrantTokenMock");
                const reentrantToken = await ReentrantToken.deploy();
                await reentrantToken.deployed();
        
                // Deploy new marketplace with reentrant token
                const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
                const mockMarketplace = await MockMarketplace.deploy(
                    reentrantToken.address,
                    25,
                    10
                );
                await mockMarketplace.deployed();
                const mockBaseCollection = await ethers.getContractFactory("MockReentrantBaseCollection");
                let mockbasecoll = await mockBaseCollection.deploy(mockMarketplace.address);
                await mockbasecoll.deployed();
                // Setup reentrant parameters
                await mockbasecoll.setReentryFunction(3);
            

                
                 tokenId = 1;
    
                await mockbasecoll.setReentryFunction(4);
                await mockMarketplace.connect(buyer).updateListing(mockbasecoll.address,tokenId,buyer.address);
                await mockMarketplace.connect(buyer).updateAuction(1);
                // Try to remove listing which should trigger reentry
                await expect(
                    mockMarketplace.connect(buyer).removeListing(mockbasecoll.address, tokenId)
                ).to.be.revertedWith("ReentrancyGuard: reentrant call");
            });
        
            it("Should revert when accepting offer without approval", async function () {
                // Create offer
                await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("2"));
                const tx = await marketplace.connect(seller).makeOffer(
                    collection.address,
                    tokenId,
                    buyer.address,
                    1,
                    ethers.utils.parseEther("1")
                );
                const receipt = await tx.wait();
                const offerId = receipt.events.find(e => e.event === "OfferCreated").args.offerId;
        
                // Remove approval
                await collection.connect(buyer).setApprovalForAll(marketplace.address, false);
        
                // Try to accept offer without approval
                await expect(
                    marketplace.connect(buyer).acceptOffer(offerId)
                ).to.be.revertedWith("Not approved");
            });
        
            describe("Offer Queries Edge Cases", function () {
                it("Should return empty array when no offers exist", async function () {
                    const [offers, total] = await marketplace.getOffersByToken(
                        collection.address,
                        999, // Non-existent token
                        0,
                        10
                    );
                    expect(offers.length).to.equal(0);
                    expect(total).to.equal(0);
                });
        
                it("Should return empty array when offset exceeds total", async function () {
                    // Create a few offers first
                    await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
                    await token.transfer(creator.address,ethers.utils.parseEther("1000"));
                    await collection.connect(creator).createNFT(
                        "Token 1",
                        "Desc 1",
                        "ipfs://test",
                        100
                    );
                    tokenId = 2;
                    await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
                    await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
                    // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
                    const tx = await marketplace.connect(seller).makeOffer(
                        collection.address,
                        tokenId,
                        buyer.address,
                        1,
                        ethers.utils.parseEther("1")
                    );
            
                    // Get offers with large offset
                    const [offers, total] = await marketplace.getOffersByToken(
                        collection.address,
                        tokenId,
                        10, // Offset larger than total offers
                        10
                    );
            
                    // Verify empty result but correct total
                    expect(offers.length).to.equal(0);
                    expect(total).to.equal(1);
                });
            
                it("Should count only valid offers", async function () {
                    // Create first offer and cancel it
                    await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10"));
                    await token.transfer(creator.address,ethers.utils.parseEther("1000"));
                    await collection.connect(creator).createNFT(
                        "Token 1",
                        "Desc 1",
                        "ipfs://test",
                        100
                    );
                    tokenId = 2;
                    await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10"));
                    await primarySale(collection, marketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
                    // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 5);
                    const tx1 = await marketplace.connect(seller).makeOffer(
                        collection.address,
                        tokenId,
                        buyer.address,
                        1,
                        ethers.utils.parseEther("1")
                    );
                    const receipt1 = await tx1.wait();
                    const offerId1 = receipt1.events.find(e => e.event === "OfferCreated").args.offerId;
                    
                    // Cancel first offer
                    await marketplace.connect(seller).cancelOffer(offerId1);
            
                    // Create second offer (will remain pending)
                    await marketplace.connect(seller).makeOffer(
                        collection.address,
                        tokenId,
                        buyer.address,
                        1,
                        ethers.utils.parseEther("1")
                    );
            
                    // Get offers and verify only pending ones are counted
                    const [offers, total] = await marketplace.getOffersByToken(
                        collection.address,
                        tokenId,
                        0,
                        10
                    );
            
                    // Should only count the pending offer
                    expect(offers.length).to.equal(1);
                    expect(total).to.equal(1);
                });
                it("Should revert when getting non-existent offer", async function () {
                    await expect(
                        marketplace.getOffer(999) // Non-existent offerId
                    ).to.be.revertedWith("Offer does not exist");
                });
            
                it("Should limit results when size exceeds limit", async function () {
                    // Create multiple offers
                    await token.connect(seller).approve(marketplace.address, ethers.utils.parseEther("10000"));
                    await token.transfer(creator.address,ethers.utils.parseEther("100000"));
                    await collection.connect(creator).createNFT(
                        "Token 1",
                        "Desc 1",
                        "ipfs://test",
                        100
                    );
                    tokenId = 2;
                    await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10000"));
                    await primarySale(collection, marketplace, creator, tokenId, token, buyer, 35, 100, ethers.utils.parseEther("1"));
                    // await marketplace.connect(buyer).buyNFT(collection.address, tokenId, 35);
                    // Create 5 offers
                    for(let i = 0; i < 5; i++) {
                        await marketplace.connect(seller).makeOffer(
                            collection.address,
                            tokenId,
                            buyer.address,
                            1,
                            ethers.utils.parseEther("1")
                        );
                    }
                    // Get offers with small limit
                    const [offers, total] = await marketplace.getOffersByToken(
                        collection.address,
                        tokenId,
                        0,
                        3  // Limit smaller than total offers
                    );
            
                    expect(offers.length).to.equal(3); // Should be limited to 3
                    expect(total).to.equal(5); // Total should still show all offers
                });
                it("Should accept offer when auction listing exists but is not active", async function () {
                    // Deploy mock marketplace
                    const MockMarketplace = await ethers.getContractFactory("NFTMarketplaceMock");
                    const mockMarketplace = await MockMarketplace.deploy(
                        token.address,
                        25,
                        10
                    );
                    await mockMarketplace.deployed();
                    const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
                    mockFactory = await CollectionFactory.deploy(
                        await factory.collectionImplementation(),
                        await factory.dropImplementation(),
                        mockMarketplace.address
                    );
                    await mockFactory.deployed();
                    // Set factory in mock marketplace
                    await mockMarketplace.setCollectionFactory(mockFactory.address);
                    const tx1 = await mockFactory.connect(creator).createCollection(
                        "Test Collection",
                        "Test Symbol",
                        false,
                        0
                    );
                    const receipt1 = await tx1.wait();
                    collectionMock = await ethers.getContractAt("BaseCollection", receipt1.events.find(e => e.event === "CollectionCreated").args.collection);
                    await collectionMock.connect(creator).createNFT(
                        "Token 1",
                        "Desc 1",
                        "ipfs://test",
                        100
                    );
                    tokenId = 1;
            
                    // Setup mock marketplace
                    await mockMarketplace.registerCollectionMock(collectionMock.address);
            
                    // Buy NFTs first
                    await token.connect(buyer).approve(mockMarketplace.address, ethers.utils.parseEther("10"));
                    await primarySale(collectionMock, mockMarketplace, creator, tokenId, token, buyer, 5, 100, ethers.utils.parseEther("1"));
                    // await mockMarketplace.connect(buyer).buyNFT(collectionMock.address, tokenId, 5);
            
                    // Create auction
                    await collectionMock.connect(buyer).setApprovalForAll(mockMarketplace.address, true);
                    const auctionTx = await mockMarketplace.connect(buyer).createAuction(
                        collectionMock.address,
                        tokenId,
                        2,
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("0.1"),
                        3600
                    );
                    const auctionReceipt = await auctionTx.wait();
                    const auctionId = auctionReceipt.events.find(e => e.event === "AuctionCreated").args.auctionId;
            
                    // Create offer
                    await token.connect(seller).approve(mockMarketplace.address, ethers.utils.parseEther("2"));
                    const offerTx = await mockMarketplace.connect(seller).makeOffer(
                        collectionMock.address,
                        tokenId,
                        buyer.address,
                        1,
                        ethers.utils.parseEther("1")
                    );
                    const offerReceipt = await offerTx.wait();
                    const offerId = offerReceipt.events.find(e => e.event === "OfferCreated").args.offerId;
            
                    // Force auction status to ENDED
                    await mockMarketplace.updateAuctionStatus(auctionId, true); // true = ENDED
            
                    // Accept offer - should work now as auction is not active
                    await mockMarketplace.connect(buyer).acceptOffer(offerId);
            
                    // Verify offer was accepted
                    const offer = await mockMarketplace.offers(collectionMock.address, tokenId, offerId);
                    expect(offer.status).to.equal(1); // ACCEPTED
                });
            });
        });
        describe("Negative cases for Batch Buy listed nfts", function() {
            it("Should revert if try to send empty array",async function() {
                await expect(
                    marketplace.batchBuyListedNFTs([])
                ).to.be.revertedWith("Empty batch");
            });
            it("Should revert if try to buy from unregistered collection",async function() {
                await expect(
                    marketplace.batchBuyListedNFTs([
                        {
                            collection:creator.address,
                            tokenId:1,
                            seller:seller.address,
                            quantity:1
                        }
                    ])
                ).to.be.revertedWith("Collection not registered");
            });
            it("Should revert if try to buy from invalid listing",async function() {
                await expect(
                    marketplace.batchBuyListedNFTs([
                        {
                            collection:collection.address,
                            tokenId:1,
                            seller:seller.address,
                            quantity:1
                        }
                    ])
                ).to.be.revertedWith("Invalid listing");
            });
            it("Should revert if try to buy from auctioned nft",async function() {
                // create auction
                await collection.connect(creator).createNFT(
                    "Token 1",
                    "Desc 1",
                    "ipfs://test",
                    100
                );
                tokenId = 1;
                const tx = await marketplace.connect(creator).createAuction(
                    collection.address,
                    tokenId,
                    2,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("0.1"),
                    3600 // 1 hour
                );
                const receipt = await tx.wait();
                await expect(
                    marketplace.batchBuyListedNFTs([
                        {
                            collection:collection.address,
                            tokenId:1,
                            seller:creator.address,
                            quantity:1
                        }
                    ])
                ).to.be.revertedWith("Not a fixed price listing");
            });
            it("Should revert if try to buy more than listed",async function() {
                // create auction
                await collection.connect(creator).createNFT(
                    "Token 1",
                    "Desc 1",
                    "ipfs://test",
                    100
                );
                tokenId = 1;
                await marketplace.connect(creator).listNFT(
                    collection.address,
                    tokenId,
                    ethers.utils.parseEther("1"),
                    5  // List all NFTs
                );
                await expect(
                    marketplace.batchBuyListedNFTs([
                        {
                            collection:collection.address,
                            tokenId:1,
                            seller:creator.address,
                            quantity:6
                        }
                    ])
                ).to.be.revertedWith("Insufficient quantity");
            });

        });
    });
});