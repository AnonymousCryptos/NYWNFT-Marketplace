// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./BaseCollection.sol";
import "../interfaces/IDrop.sol";

contract Drop is BaseCollection, IDrop {
    uint256 public startTime;
    
    event StartTimeUpdated(uint256 newStartTime);

    function initialize(
        string memory _name,
        string memory _description,
        address _owner,
        address _marketplace,
        uint256 _startTime
    ) public override {
        require(_startTime > block.timestamp, "Invalid start time");
        
        BaseCollection.initialize(
            _name,
            _description,
            _owner,
            _marketplace
        );
        
        startTime = _startTime;
    }

    function _mintNFT(uint256 tokenId, uint256 quantity) 
        internal 
        virtual 
        override
    {
        require(block.timestamp >= startTime, "Drop not started");
        super._mintNFT(tokenId, quantity);
    }

    function setStartTime(uint256 _startTime) external onlyOwner {
        require(_startTime > block.timestamp, "Invalid start time");
        startTime = _startTime;
        emit StartTimeUpdated(_startTime);
    }
}