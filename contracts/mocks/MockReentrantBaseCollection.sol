import "../core/BaseCollection.sol";

contract MockReentrantBaseCollection is BaseCollection {
    modifier onlyMarketplace() override {
        // First call mint
        this.mintNFT(1, 1);
        // Then proceed with the actual mint
        _;
    }
    constructor(address _marketPlace) {
        super.initialize("name","desc",msg.sender,_marketPlace);
    }
}