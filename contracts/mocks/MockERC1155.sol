pragma solidity ^0.8.17;
import "../marketplace/NFTMarketplace.sol";
contract MockReentrantERC1155 {
    address public marketplace;
    uint256 public reentryFunction;
    constructor(address _marketPlace) {
       marketplace = _marketPlace;
    }

    function setReentryFunction(uint256 _function) external {
        reentryFunction = _function;
    }
    
    function balanceOf(address account, uint256 id) public returns(uint256){
        if(reentryFunction == 1) {
            NFTMarketplace(marketplace).listNFT(address(this),1,1,1);
        }
        return 1000;
    }
}