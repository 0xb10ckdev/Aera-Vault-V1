import { HardhatUserConfig } from "hardhat/config";
import common from "./hardhat.config";

const config: HardhatUserConfig = {
  ...common,
  paths: {
    artifacts: "./artifacts/v4",
    cache: "./cache/v4",
    sources: "./contracts/v4",
    tests: process.env.TEST_PATH || "./test/v4",
  },
};

export default config;
