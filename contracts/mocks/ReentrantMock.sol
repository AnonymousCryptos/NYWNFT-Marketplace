pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../marketplace/NFTMarketplace.sol";

contract ReentrantTokenMock is ERC20 {
    NFTMarketplace public marketplace;
    address public collection;
    uint256 public tokenId;
    uint256 public reentryFunction; // 1: buyNFT, 2: placeBid

    constructor() ERC20("Mock Token", "MTK") {
        _mint(msg.sender, 1000000 * 10**18);
    }

    function setMarketplace(address _marketplace) public {
        marketplace = NFTMarketplace(_marketplace);
    }

    function setReentrantParams(address _collection, uint256 _tokenId, uint256 _function) external {
        collection = _collection;
        tokenId = _tokenId;
        reentryFunction = _function;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        bool success = super.transferFrom(sender, recipient, amount);
        
        if(recipient == address(marketplace)) {
            if(reentryFunction == 1) {
                marketplace.buyNFT(collection, tokenId, 1);
            } else if(reentryFunction == 2) {
                marketplace.placeBid(1, 2 ether);
            } else if(reentryFunction == 3) {
                marketplace.buyListedNFT(collection, tokenId, msg.sender, 1);
            } else if(reentryFunction == 4) {
                marketplace.settleAuction(1);
            } else if(reentryFunction == 5) {
                marketplace.cancelAuction(1);
            } else if(reentryFunction == 6) {
                marketplace.createAuction(collection, tokenId, 1, 1 ether, 0.1 ether, 3600);
            }
        }
        
        return success;
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        bool success = super.transfer(recipient, amount);
        
        if(recipient != address(marketplace) && reentryFunction == 2) {
            marketplace.placeBid(1, 2 ether);
        } else if(reentryFunction == 2) {
            marketplace.placeBid(1, 2 ether);
        } else if(reentryFunction == 3) {
            marketplace.buyListedNFT(collection, tokenId, msg.sender, 1);
        } else if(reentryFunction == 4) {
            marketplace.settleAuction(1);
        } else if(reentryFunction == 5) {
            marketplace.cancelAuction(1);
        } else if(reentryFunction == 6) {
            marketplace.createAuction(collection, tokenId, 1, 1 ether, 0.1 ether, 3600);
        }
        
        return success;
    }
}