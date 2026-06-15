import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    // NOTE: `overrides` is only honored in the multi-compiler form
    // ({ compilers, overrides }); the { version, settings, overrides } shorthand
    // silently drops overrides.
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
    // VeriChainXGovernance is feature-heavy and exceeds the 24,576-byte EIP-170
    // limit at runs=200. Compile it for size (runs=1, strip revert strings) so it
    // stays deployable; governance calls are infrequent, so the trade-off is fine.
    overrides: {
      "contracts/VeriChainXGovernance.sol": {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          debug: {
            revertStrings: "strip",
          },
        },
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    "hedera-testnet": {
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      gas: 10000000,
      gasPrice: 10000000000, // 10 gwei
    },
    "hedera-mainnet": {
      url: "https://mainnet.hashio.io/api",
      chainId: 295,
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      gas: 10000000,
      gasPrice: 10000000000,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      chainId: 5,
      accounts: process.env.ETHEREUM_PRIVATE_KEY ? [process.env.ETHEREUM_PRIVATE_KEY] : [],
    },
    "polygon-mumbai": {
      url: "https://rpc-mumbai.maticvigil.com",
      chainId: 80001,
      accounts: process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 60000,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
};

export default config;