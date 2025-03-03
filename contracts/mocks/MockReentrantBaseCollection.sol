import "../core/BaseCollection.sol";
import "../marketplace/NFTMarketplace.sol";

contract MockReentrantBaseCollection is BaseCollection {
    uint256 public reentryFunction;
    modifier onlyMarketplace() override {
        // First call mint
        this.mintNFT(1, 1);
        // Then proceed with the actual mint
        _;
    }
    constructor(address _marketPlace) {
        super.initialize("name","desc",msg.sender,_marketPlace);
    }

    function setReentryFunction(uint256 _function) external {
        reentryFunction = _function;
    }
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        
        if(reentryFunction == 1) {
            NFTMarketplace(marketplace).createAuction(address(this), id, 1, 1 ether, 0.1 ether, 3600);
        } else if(reentryFunction == 2) {
            NFTMarketplace(marketplace).settleAuction(1);
        } else if(reentryFunction == 3) {
            NFTMarketplace(marketplace).cancelAuction(1);
        }
    }
    function balanceOf(address account, uint256 id) public view override returns(uint256){
        return 1000;
    }
}