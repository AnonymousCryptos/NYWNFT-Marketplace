// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IDrop {
    function initialize(
        string memory name,
        string memory symbol,
        address owner,
        address marketplace,
        uint256 startTime,
        bool isDrop
    ) external;

    function setStartTime(uint256 _startTime) external;
}