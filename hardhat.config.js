require("@nomiclabs/hardhat-waffle");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.7.6",

  namedAccounts: {
    sablier: "0xA4fc358455Febe425536fd1878bE67FfDBDEC59a",
  },

  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 11695522,
      },
      accounts: [
        {
          privateKey: process.env.TREASURY_PRIV_KEY,
          balance: "10000000000000000000000",
        },
        {
          privateKey: process.env.SECOND_ACC_PRIV_KEY,
          balance: "10000000000000000000000",
        },
      ],
    },
  },
};
