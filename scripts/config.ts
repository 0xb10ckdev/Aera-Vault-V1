// Addresses are taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses
export const getConfig = (
  chainId: number,
): { vault: string; factory: string; bVault: string } => {
  switch (chainId) {
    case 1:
      return {
        vault: "MammonVaultV1",
        factory: "0x48767F9F868a4A7b86A90736632F6E44C2df7fa9",
        bVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      };
    case 42:
      return {
        vault: "MammonVaultV1",
        factory: "0xb08E16cFc07C684dAA2f93C70323BAdb2A6CBFd2",
        bVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      };
    case 31337:
      return {
        vault: "MammonVaultV1",
        factory: "0x48767F9F868a4A7b86A90736632F6E44C2df7fa9",
        bVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
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
