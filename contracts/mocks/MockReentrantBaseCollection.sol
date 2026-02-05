import "../core/BaseCollection.sol";
import "../marketplace/NFTMarketplace.sol";

contract MockReentrantBaseCollection is BaseCollection {
    uint256 public reentryFunction;
    
    constructor(address _marketPlace) {
        super.initialize("name","sym",msg.sender,_marketPlace,true);
    }

    function setReentryFunction(uint256 _function) external {
        reentryFunction = _function;
    }
    // malicious function to test reentrancy attack cases
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
        } else if(reentryFunction == 4) {
            NFTMarketplace(marketplace).removeListing(address(this), 1);
        } else if(reentryFunction == 9) {
            NFTMarketplace.BatchPurchaseParams[] memory params = new NFTMarketplace.BatchPurchaseParams[](1);
            params[0] = NFTMarketplace.BatchPurchaseParams({
                collection:address(this),
                tokenId:1,
                seller:address(0),
                quantity:1
            });
            NFTMarketplace(marketplace).batchBuyListedNFTs(params);
        }
    }
    function balanceOf(address account, uint256 id) public view override returns(uint256){
        return 1000;
    }

    function nftDetails(uint256 tokenId) external override view returns (NFTDetails memory) {
        return NFTDetails({
            name: "name",
            description: "desc",
            uri: "",
            maxSupply: 100,
            creator: msg.sender
        });

    }
}
