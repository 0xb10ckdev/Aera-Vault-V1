// Addresses are taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses
export const getConfig = (
  chainId: number,
): { vault: string; poolManager: string; bFactory: string } => {
  switch (chainId) {
    case 1:
      return {
        vault: "MammonVaultV0Mainnet",
        poolManager: "0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4",
        bFactory: "0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd",
      };
    case 42:
      return {
        vault: "MammonVaultV0Kovan",
        poolManager: "0x8DBB8C9bFEb7689f16772c85136993cDA0c05eA4",
        bFactory: "0x8f7F78080219d4066A8036ccD30D588B416a40DB",
      };
    case 31337:
      return {
        vault: "MammonVaultV0Mainnet",
        poolManager: "0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4",
        bFactory: "0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd",
      };
    default:
      throw "unsupported chain ID";
  }
};

export const getChainId = (network: string | undefined): number => {
  switch (network) {
    case "ganache":
      return 1337;
    case "goerli":
      return 5;
    case "hardhat":
      return 31337;
    case "kovan":
      return 42;
    case "mainnet":
      return 1;
    case "rinkeby":
      return 4;
    case "ropsten":
      return 3;
    default:
      return 31337;
  }
};

export const DEFAULT_NOTICE_PERIOD = 3600;
