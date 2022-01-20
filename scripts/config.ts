import { chainIds } from "../hardhat.config";

// Addresses are taken from https://dev.balancer.fi/references/contracts/contract-addresses
export const getConfig = (chainId: number): { bVault: string } => {
  switch (chainId) {
    case chainIds.mainnet:
    case chainIds.polygon:
    case chainIds.kovan:
    case chainIds.hardhat:
    case chainIds.rinkeby:
    case chainIds.goerli:
      return {
        bVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      };
    default:
      throw "unsupported chain ID";
  }
};

export const getChainId = (network?: string): number => {
  return network
    ? chainIds[network as keyof typeof chainIds]
    : chainIds.hardhat;
};

export const DEFAULT_NOTICE_PERIOD = 3600;
