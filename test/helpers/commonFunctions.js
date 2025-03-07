const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
async function primarySale(collection, marketplace, creator, tokenId, token, buyer, buyAmount, maxAmount, nftPrice) {
    let initialBalance = await collection.balanceOf(buyer.address, tokenId);
    let initialBalanceCreator = await collection.balanceOf(creator.address, tokenId);
    await collection.connect(creator).setApprovalForAll(marketplace.address, true);
        await marketplace.connect(creator).listNFT(
            collection.address,
            tokenId,
            nftPrice,
            buyAmount
        );
        await token.connect(buyer).approve(marketplace.address, ethers.utils.parseEther("10000"));
        await marketplace.connect(buyer).buyListedNFT(
            collection.address,
            tokenId,
            creator.address,
            buyAmount
        );
        expect(await collection.balanceOf(creator.address, tokenId)).to.equal(initialBalanceCreator-buyAmount);
        expect(await collection.balanceOf(buyer.address, tokenId)).to.equal(initialBalance/1 + buyAmount/1);
}
module.exports = {
    primarySale
}