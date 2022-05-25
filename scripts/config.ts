import { chainIds } from "../hardhat.config";

// Addresses are taken from https://dev.balancer.fi/references/contracts/contract-addresses
// Shouldn't change the gas price and gas limit.
// Otherwise the deployment address will be changed.

export const getConfig = (
  chainId: number,
): {
  bVault: string; // Balancer Vault address
  merkleOrchard?: string;
  proxyDeployGasPrice: number;
  proxyDeployGasLimit: number;
} => {
  const merkleOrchards = {
    [chainIds.mainnet]: "0xdAE7e32ADc5d490a43cCba1f0c736033F2b4eFca",
    [chainIds.polygon]: "0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e",
    [chainIds.kovan]: "0xc33e0fE411322009947931c32d2273ee645cDb5B",
    [chainIds.rinkeby]: "0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e",
  };

  switch (chainId) {
    case chainIds.mainnet:
    case chainIds.polygon:
    case chainIds.kovan:
    case chainIds.rinkeby:
    case chainIds.goerli:
      return {
        bVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
        merkleOrchard: merkleOrchards[chainId],
        proxyDeployGasPrice: 100000000000,
        proxyDeployGasLimit: 1100000,
      };
    case chainIds.hardhat:
      return {
        bVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
        proxyDeployGasPrice: 100000000000,
        proxyDeployGasLimit: 3000000,
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
