pragma solidity ^0.8.17;

import "../core/BaseCollection.sol";

contract TestCaller {
    function testInitialize(
        address implementation,
        string memory name,
        string memory description,
        address owner,
        address marketplace
    ) external {
        BaseCollection(implementation).initialize(
            name,
            description,
            owner,
            marketplace
        );
    }
}