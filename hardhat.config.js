require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    arcMainnet: {
      url: process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts,
    },
  },
};
