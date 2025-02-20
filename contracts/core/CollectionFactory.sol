// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../interfaces/ICollection.sol";
import "../interfaces/IDrop.sol";
import "../marketplace/NFTMarketplace.sol";

contract CollectionFactory is Ownable {
    using Clones for address;

    address public immutable collectionImplementation;
    address public immutable dropImplementation;
    address public marketplace;
    
    mapping(address => address[]) public userCollections;
    mapping(address => bool) public isCollectionCreatedByUs;
    
    event CollectionCreated(address indexed collection, address indexed owner, bool isDrop);
    event MarketplaceUpdated(address indexed newMarketplace);
    
    constructor(
        address _collectionImpl,
        address _dropImpl,
        address _marketplace
    ) {
        require(_collectionImpl != address(0), "Invalid collection implementation");
        require(_dropImpl != address(0), "Invalid drop implementation");
        require(_marketplace != address(0), "Invalid marketplace");
        
        collectionImplementation = _collectionImpl;
        dropImplementation = _dropImpl;
        marketplace = _marketplace;
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        require(_marketplace != address(0), "Invalid marketplace address");
        marketplace = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }
    
    function createCollection(
        string memory name,
        string memory description,
        bool isDrop,
        uint256 startTime
    ) external returns (address) {
        require(bytes(name).length > 0, "Invalid name");
        require(bytes(description).length > 0, "Invalid description");
        address implementation = isDrop ? dropImplementation : collectionImplementation;
        address clone = Clones.clone(implementation);
        
        if (isDrop) {
            IDrop(clone).initialize(
                name,
                description,
                msg.sender,
                marketplace,
                startTime
            );
        } else {
            ICollection(clone).initialize(
                name,
                description,
                msg.sender,
                marketplace
            );
        }
        
        userCollections[msg.sender].push(clone);
        isCollectionCreatedByUs[clone] = true;
        
        NFTMarketplace(marketplace).registerCollection(clone);
        
        emit CollectionCreated(clone, msg.sender, isDrop);
        return clone;
    }

    function verifyCollection(address collection) external view returns (bool) {
        return isCollectionCreatedByUs[collection];
    }
    
    function getUserCollections(address user) external view returns (address[] memory) {
        return userCollections[user];
    }
}