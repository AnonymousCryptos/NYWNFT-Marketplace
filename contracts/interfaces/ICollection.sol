// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ICollection {
    struct NFTDetails {
        string name;
        string description;
        string uri;
        uint256 maxSupply;
        address creator;
    }

    event NFTCreated(string name, string description,uint256 indexed tokenId, address indexed creator, uint256 maxSupply);

    function initialize(
        string memory name,
        string memory symbol,
        address owner,
        address marketplace,
        bool isDrop
    ) external;

    function createNFT(
        string memory name,
        string memory description,
        string memory _tokenURI,
        uint256 maxSupply
    ) external returns (uint256);

    function nftDetails(uint256 tokenId) external view returns (NFTDetails memory);

    function getRoyaltyPercentage() external view returns(uint16);
}