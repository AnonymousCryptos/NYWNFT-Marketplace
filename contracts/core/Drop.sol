// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./BaseCollection.sol";
import "../interfaces/IDrop.sol";

contract Drop is BaseCollection, IDrop {
    uint256 public startTime;
    
    event StartTimeUpdated(uint256 newStartTime);

    function initialize(
        string memory _name,
        string memory _symbol,
        address _owner,
        address _marketplace,
        uint256 _startTime,
        bool _isDrop
    ) public override {
        require(_startTime > block.timestamp, "Invalid start time");
        
        BaseCollection.initialize(
            _name,
            _symbol,
            _owner,
            _marketplace,
            _isDrop
        );
        
        startTime = _startTime;
    }

    function createNFT(
        string memory _name,
        string memory _description,
        string memory _tokenURI,
        uint256 maxSupply
    ) public virtual override returns (uint256) {
        require(block.timestamp >= startTime, "Drop not started");
        return super.createNFT(_name, _description, _tokenURI, maxSupply);
    }

    function setStartTime(uint256 _startTime) external onlyOwner {
        require(_startTime > block.timestamp, "Invalid start time");
        startTime = _startTime;
        emit StartTimeUpdated(_startTime);
    }
}