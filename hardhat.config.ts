import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@primitivefi/hardhat-dodoc";
import "@typechain/hardhat";
import { config as dotenvConfig } from "dotenv";
import "hardhat-contract-sizer";
import * as tdly from "@tenderly/hardhat-tenderly";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import { resolve } from "path";
import "solidity-coverage";
import "./tasks/accounts";
import "./tasks/clean";
import "./tasks/deploy";
import "./tasks/guardian-whitelist-factory-address";

dotenvConfig({ path: resolve(__dirname, "./.env") });

tdly.setup();

export const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 31337,
  // kovan: 42, unsupported
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
  polygon: 137,
  mumbai: 80001,
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
const alchemyApiUrl = process.env.ALCHEMY_API_URL;
if (!infuraApiKey && !alchemyApiKey && !alchemyApiUrl) {
  throw new Error(
    "Please set your INFURA_API_KEY or ALCHEMY_API_KEY or ALCHEMY_API_URL in a .env file",
  );
}

// validate Infura API key and create access URL
function createInfuraUrl(network: string) {
  if (!infuraApiKey || infuraApiKey.includes("zzzz")) {
    console.log(
      "Warning: Please set your INFURA_API_KEY in the env file if doing a deployment",
    );
  }
  return "https://" + network + ".infura.io/v3/" + infuraApiKey;
}

function createAlchemyUrl(network: string) {
  if (!alchemyApiKey || alchemyApiKey.includes("zzzz")) {
    console.log(
      "Warning: Please set your ALCHEMY_API_KEY in the env file if doing a deployment",
    );
  }

  const supported_networks = [
    "mainnet",
    "rinkeby",
    "ropsten",
    "goerli",
    "mumbai",
    "polygon",
  ];
  let urlPrefix = `eth-${network}`;
  if (network === "polygon") {
    urlPrefix = "polygon-mainnet";
  } else if (network === "mumbai") {
    urlPrefix = "polygon-mumbai";
  } else if (!supported_networks.includes("mainnet")) {
    throw new Error("Alchemy does not support network: " + network);
  }
  return `https://${urlPrefix}.g.alchemy.com/v2/${alchemyApiKey}`;
}

function getNetworkUrl(network: string) {
  if (alchemyApiUrl) {
    return alchemyApiUrl;
  } else if (alchemyApiKey) {
    return createAlchemyUrl(network);
  } else if (infuraApiKey) {
    return createInfuraUrl(network);
  }
  return "";
}

const forkUrl = process.env.HARDHAT_FORK
  ? getNetworkUrl(process.env.HARDHAT_FORK)
  : "";

// use mnemonic for deployment
function createNetworkConfig(
  network: keyof typeof chainIds,
): NetworkUserConfig {
  return {
    accounts: {
      count: 10,
      initialIndex: 0,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[network],
    url: getNetworkUrl(network),
  };
}

// use private key for deployment rather than mnemonic
function createNetworkPrivateKeyConfig(
  network: keyof typeof chainIds,
): NetworkUserConfig {
  const url = getNetworkUrl(network);
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
    guardian: 1,
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
    mainnet: createNetworkConfig("mainnet"),
    goerli: createNetworkConfig("goerli"),
    rinkeby: createNetworkConfig("rinkeby"),
    ropsten: createNetworkConfig("ropsten"),
    polygon: createNetworkPrivateKeyConfig("polygon"),
    mumbai: createNetworkPrivateKeyConfig("mumbai"),
  },
  etherscan: {
    apiKey: etherscanApiKey,
  },
  tenderly: {
    project: "AeraV1Test",
    username: "nickborg@gauntlet.network",
    forkNetwork: "80001",
    privateVerification: true,
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: process.env.TEST_PATH || "./test",
  },
  solidity: {
    compilers: [
      {
        // these settings are for Balancer contracts
        version: "0.7.1",
        settings: {
          optimizer: {
            enabled: true,
            // ref: https://github.com/balancer-labs/balancer-v2-monorepo/blob/3caf66978d3e5f3bb2af050bd8131983c83d9844/pvt/common/hardhat-base-config.ts#L48
            runs: 9999,
          },
        },
      },
      {
        // these settings are for Aera contracts
        version: "0.8.11",
        settings: {
          // You should disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
    ],
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/solidity-template/issues/31
        bytecodeHash: "none",
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
  dodoc: {
    runOnCompile: false,
    include: ["PermissiveWithdrawalValidator", "AeraVaultV1"],
  },
  mocha: {
    timeout: 30000,
  },
};

export default config;
