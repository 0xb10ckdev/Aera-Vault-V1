import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import "./tasks/clean";
import "./tasks/deploy";

import { resolve } from "path";

import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
};

// Ensure that we have all the environment variables we need.
const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

// Collect testnet private key
const testnetPrivateKey = process.env.TESTNET_PRIVATE_KEY;
if (!testnetPrivateKey) {
  throw new Error("Please set your TESTNET_PRIVATE_KEY in a .env file");
}

// Collect Etherscan API key (for contract verification)
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
if (!etherscanApiKey) {
  throw new Error("Please set your ETHERSCAN_API_KEY in a .env file");
}

const infuraApiKey = process.env.INFURA_API_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;
if (!infuraApiKey && !alchemyApiKey) {
  throw new Error(
    "Please set your INFURA_API_KEY or ALCHEMY_API_KEY in a .env file",
  );
}

const forkUrl = alchemyApiKey
  ? `https://eth-${process.env.HARDHAT_FORK}.alchemyapi.io/v2/${alchemyApiKey}`
  : `https://${process.env.HARDHAT_FORK}.infura.io/v3/${infuraApiKey}`;

// use mnemonic for deployment
function createTestnetConfig(
  network: keyof typeof chainIds,
): NetworkUserConfig {
  const url: string = "https://" + network + ".infura.io/v3/" + infuraApiKey;
  return {
    accounts: {
      count: 10,
      initialIndex: 0,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[network],
    url,
  };
}

// use private key for deployment rather than mnemonic
function createTestnetPrivateKeyConfig(
  network: keyof typeof chainIds,
): NetworkUserConfig {
  const url: string = "https://" + network + ".infura.io/v3/" + infuraApiKey;
  return {
    // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
    accounts: [testnetPrivateKey!],
    chainId: chainIds[network],
    url,
  };
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  contractSizer: {
    runOnCompile: process.env.REPORT_SIZE ? true : false,
    disambiguatePaths: false,
  },
  namedAccounts: {
    admin: 0,
    manager: 1,
    user: 2,
    stranger: 3,
  },
  networks: {
    hardhat: {
      accounts: { mnemonic },
      initialBaseFeePerGas: 0,
      forking: process.env.HARDHAT_FORK
        ? {
            url: forkUrl,
            blockNumber: process.env.HARDHAT_FORK_NUMBER
              ? parseInt(process.env.HARDHAT_FORK_NUMBER)
              : undefined,
          }
        : undefined,
      allowUnlimitedContractSize: true,
      chainId: chainIds.hardhat,
    },
    goerli: createTestnetConfig("goerli"),
    kovan: createTestnetPrivateKeyConfig("kovan"),
    rinkeby: createTestnetConfig("rinkeby"),
    ropsten: createTestnetConfig("ropsten"),
  },
  etherscan: {
    apiKey: etherscanApiKey,
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: process.env.TEST_PATH || "./test",
  },
  solidity: {
    version: "0.8.7",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/solidity-template/issues/31
        bytecodeHash: "none",
      },
      // You should disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  external: process.env.HARDHAT_FORK
    ? {
        deployments: {
          // process.env.HARDHAT_FORK will specify the network that the fork is made from.
          // these lines allow it to fetch the deployments from the network being forked from both for node and deploy task
          hardhat: ["deployments/" + process.env.HARDHAT_FORK],
          localhost: ["deployments/" + process.env.HARDHAT_FORK],
        },
      }
    : undefined,
};

export default config;
