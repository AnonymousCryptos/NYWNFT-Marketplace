pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "../marketplace/NFTMarketplace.sol";

contract ReentrantERC1155Mock is ERC1155 {
    NFTMarketplace public marketplace;
    uint256 public reentryFunction;

    constructor() ERC1155("") {}

    function setMarketplace(address _marketplace) public {
        marketplace = NFTMarketplace(_marketplace);
    }

    function setReentryFunction(uint256 _function) external {
        reentryFunction = _function;
    }

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        super.safeTransferFrom(from, to, id, amount, data);
        
        if(to == address(marketplace)) {
            if(reentryFunction == 1) {
                marketplace.createAuction(address(this), id, 1, 1 ether, 0.1 ether, 3600);
            } else if(reentryFunction == 2) {
                marketplace.settleAuction(1);
            } else if(reentryFunction == 3) {
                marketplace.cancelAuction(1);
            }
        }
    }
}