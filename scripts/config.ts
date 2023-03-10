import { chainIds } from "../hardhat.config";
import { BigNumber } from "ethers";

// Addresses are taken from https://dev.balancer.fi/references/contracts/deployment-addresses
// Shouldn't change the gas price and gas limit
// Otherwise the deployment address will be changed.

export function getBVault(chainId: number): string {
  const BVAULTS = {
    [chainIds.mainnet]: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    [chainIds.polygon]: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    [chainIds.mumbai]: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  };
  const defaultBVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  let bVault = BVAULTS[chainId];
  if (bVault === undefined) {
    bVault = defaultBVault;
  }
  return bVault;
}

export function getMerkleOrchard(chainId: number): string | undefined {
  const merkle_orchards = {
    [chainIds.mainnet]: "0xdAE7e32ADc5d490a43cCba1f0c736033F2b4eFca",
    [chainIds.polygon]: "0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e",
    [chainIds.rinkeby]: "0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e",
  };
  return merkle_orchards[chainId];
}

export function getGasPrice(
  chainId: number,
  maybeGasPrice?: number | string | undefined,
): BigNumber | undefined {
  const default_gas_prices = {
    [chainIds.hardhat]: BigNumber.from(100000000000),
  };
  let defaultPrice: BigNumber | string | undefined = undefined;
  if (default_gas_prices[chainId] !== undefined) {
    defaultPrice = default_gas_prices[chainId];
  }
  let gasPrice = maybeGasPrice ? maybeGasPrice : defaultPrice;
  if (typeof gasPrice === "number" || typeof gasPrice == "string") {
    gasPrice = BigNumber.from(gasPrice);
  }
  return gasPrice;
}

export function getGasLimit(
  chainId: number,
  maybeGasLimit?: number | undefined,
): number | undefined {
  const default_gas_limits = {
    [chainIds.hardhat]: 3000000,
    [chainIds.mumbai]: 1100000,
  };
  let defaultLimit: number | undefined = undefined;
  if (default_gas_limits[chainId] !== undefined) {
    defaultLimit = default_gas_limits[chainId];
  }
  return maybeGasLimit ? maybeGasLimit : defaultLimit;
}

export const DEFAULT_NOTICE_PERIOD = 3600;

export const getChainId = (network?: string): number => {
  return network
    ? chainIds[network as keyof typeof chainIds]
    : chainIds.hardhat;
};

export const getConfig = (
  chainId: number,
  options?: {
    gasPrice?: number | string | undefined;
    gasLimit?: number | undefined;
  },
): {
  bVault: string; // Balancer Vault address
  merkleOrchard?: string;
  gasPrice: BigNumber | undefined;
  gasLimit: number | undefined;
} => {
  if (!Object.values(chainIds).includes(chainId)) {
    throw "unsupported chain ID";
  }
  return {
    bVault: getBVault(chainId),
    merkleOrchard: getMerkleOrchard(chainId),
    gasPrice: getGasPrice(chainId, options ? options.gasPrice : undefined),
    gasLimit: getGasLimit(chainId, options ? options.gasLimit : undefined),
  };
};
