// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ICollection {
    struct NFTDetails {
        string uri;
        uint256 maxSupply;
        uint256 currentSupply;
        address creator;
        uint256 price;
        uint256 royaltyPercentage;
    }

    event NFTCreated(uint256 indexed tokenId, address indexed creator, uint256 maxSupply, uint256 price);
    event NFTMinted(uint256 indexed tokenId, address indexed buyer, uint256 quantity);

    function initialize(
        string memory name,
        string memory description,
        address owner,
        address marketplace
    ) external;

    function createNFT(
        string memory uri,
        uint256 maxSupply,
        uint256 price,
        uint256 royaltyPercentage
    ) external returns (uint256);

    function mintNFT(uint256 tokenId, uint256 quantity) external;
    function nftDetails(uint256 tokenId) external view returns (NFTDetails memory);
}