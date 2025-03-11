// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../interfaces/ICollection.sol";

contract BaseCollection is 
    ERC1155Upgradeable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    ICollection 
{
    string public name;
    string public symbol;
    address public marketplace;
    uint16 internal royaltyPercentage;
    bool public isDrop;
    
    uint256 private _tokenIds;
    mapping(uint256 => NFTDetails) private _nftDetails;

    function initialize(
        string memory _name,
        string memory _symbol,
        address _owner,
        address _marketplace,
        bool _isDrop
    ) public initializer {
        require(bytes(_name).length > 0, "Invalid name");
        require(bytes(_symbol).length > 0, "Invalid symbol");
        require(_owner != address(0), "Invalid owner");
        require(_marketplace != address(0), "Invalid marketplace");

        __ERC1155_init("");
        __Ownable_init();
        __ReentrancyGuard_init();
        
        name = _name;
        symbol = _symbol;
        marketplace = _marketplace;
        isDrop = _isDrop;
        
        transferOwnership(_owner);
    }

    function createNFT(
        string memory _name,
        string memory _description,
        string memory _tokenURI,
        uint256 maxSupply
    ) public virtual override onlyOwner returns (uint256) {
        require(bytes(_name).length > 0, "Invalid name");
        require(bytes(_description).length > 0, "Invalid description");
        require(maxSupply > 0, "Invalid max supply");

        _tokenIds++;
        uint256 newTokenId = _tokenIds;

        _nftDetails[newTokenId] = NFTDetails({
            name: _name,
            description: _description,
            uri: _tokenURI,
            maxSupply: maxSupply,
            creator: msg.sender
        });

        // Mint all NFTs to creator immediately
        _mint(msg.sender, newTokenId, maxSupply, "");

        emit NFTCreated(_name, _description, newTokenId, msg.sender, maxSupply);
        return newTokenId;
    }

    function nftDetails(uint256 tokenId) external view virtual returns (NFTDetails memory) {
        return _nftDetails[tokenId];
    }

    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        return _nftDetails[tokenId].uri;
    }

    function updateRoyaltyPercentage(uint16 _royaltyPercentage) onlyOwner external {
        require(_royaltyPercentage <= 100, "Royalty too high");
        royaltyPercentage = _royaltyPercentage;
    }

    function getRoyaltyPercentage() external view returns(uint16) {
        return royaltyPercentage;
    }
}