import { HardhatUserConfig } from "hardhat/config";
import common from "./hardhat.config";

const config: HardhatUserConfig = {
  ...common,
  paths: {
    artifacts: "./artifacts/v1",
    cache: "./cache/v1",
    sources: "./contracts/v1",
    tests: process.env.TEST_PATH || "./test/v1",
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
};

export default config;
