import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@primitivefi/hardhat-dodoc";
import "@typechain/hardhat";
import { config as dotenvConfig } from "dotenv";
import "hardhat-contract-sizer";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import { resolve } from "path";
import "solidity-coverage";
import "./tasks/clean";
import "./tasks/deploy";
import "./tasks/manager-whitelist-factory-address";

dotenvConfig({ path: resolve(__dirname, "./.env") });

export const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
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
if (!infuraApiKey && !alchemyApiKey) {
  throw new Error(
    "Please set your INFURA_API_KEY or ALCHEMY_API_KEY in a .env file",
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
  let urlPrefix = `eth-${network}`;
  if (network === "polygon") {
    urlPrefix = "polygon-mainnet.g";
  } else if (network === "mumbai") {
    urlPrefix = "polygon-mumbai.g";
  }
  return `https://${urlPrefix}.alchemyapi.io/v2/${alchemyApiKey}`;
}

const forkUrl = process.env.HARDHAT_FORK
  ? alchemyApiKey
    ? createAlchemyUrl(process.env.HARDHAT_FORK)
    : createInfuraUrl(process.env.HARDHAT_FORK)
  : "";

// use mnemonic for deployment
function createTestnetConfig(
  network: keyof typeof chainIds,
): NetworkUserConfig {
  const url = createInfuraUrl(network);
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
  const url = createAlchemyUrl(network);
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
    mainnet: createTestnetConfig("mainnet"),
    goerli: createTestnetConfig("goerli"),
    kovan: createTestnetPrivateKeyConfig("kovan"),
    rinkeby: createTestnetConfig("rinkeby"),
    ropsten: createTestnetConfig("ropsten"),
    polygon: createTestnetPrivateKeyConfig("polygon"),
    mumbai: createTestnetPrivateKeyConfig("mumbai"),
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
    compilers: [
      {
        // these settings are for Balancer contracts
        version: "0.7.1",
        settings: {
          optimizer: {
            enabled: true,
            // ref: https://github.com/balancer-labs/balancer-v2-monorepo/blob/ec4400150df04ad127dbd42caacb9f7a9faeefdb/pvt/common/hardhat-base-config.ts#L48
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
    overrides: {
      "contracts/v1/dependencies/balancer-labs/pool-weighted/contracts/WeightedPool.sol":
        {
          version: "0.7.1",
          settings: {
            optimizer: {
              enabled: true,
              runs: 200,
            },
          },
        },
    },
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
    exclude: [
      "AccessControl",
      "AccessControlEnumerable",
      "Address",
      "Context",
      "EnumerableSet",
      "ERC20",
      "ERC20Burnable",
      "ERC20Mock",
      "ERC20Pausable",
      "ERC20PresetMinterPauser",
      "ERC165",
      "ERC165Checker",
      "IAccessControl",
      "IAccessControlEnumerable",
      "IBManagedPoolFactory",
      "IERC20",
      "IERC20Metadata",
      "IERC165",
      "Math",
      "Ownable",
      "Pausable",
      "ReentrancyGuard",
      "SafeERC20",
      "Strings",
    ],
  },
  mocha: {
    timeout: 30000,
  },
};

export default config;
