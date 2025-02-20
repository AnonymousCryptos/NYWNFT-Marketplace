require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("@nomicfoundation/hardhat-network-helpers");

module.exports = {
    solidity: {
        version: "0.8.17",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        hardhat: {
            chainId: 1337,
            allowUnlimitedContractSize: true
        }
    },
    mocha: {
        timeout: 100000
    }
};