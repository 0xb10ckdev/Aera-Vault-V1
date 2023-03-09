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
  }
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

function getGasPrice(chainId: number, options: { gasPrice?: number | string | undefined} | undefined): BigNumber | string | undefined {
  const default_gas_prices = {
    [chainIds.hardhat]: BigNumber.from(100000000000)
  }
  if (options === undefined) {
    options = {};
  }
  let defaultPrice: BigNumber | string | undefined = undefined;
  if (default_gas_prices[chainId] !== undefined) {
    defaultPrice = default_gas_prices[chainId];
  }
  let gasPrice = options.gasPrice? options.gasPrice: defaultPrice;
  if (typeof gasPrice === "number" || typeof gasPrice == "string") {
    gasPrice = BigNumber.from(gasPrice);
  }
  return gasPrice;
}

function getGasLimit(chainId: number, options: { gasLimit?: number | string | undefined} | undefined): number | string | undefined{
  const default_gas_limits = {
    [chainIds.hardhat]: 3000000,
    [chainIds.mumbai]: 1100000
  }
  if (options === undefined) {
    options = {};
  }
  let defaultLimit: number | string | undefined = undefined;
  if (default_gas_limits[chainId] !== undefined) {
    defaultLimit = default_gas_limits[chainId];
  }
  return options.gasLimit? options.gasLimit: defaultLimit;
}

export const DEFAULT_NOTICE_PERIOD = 3600;

export const getChainId = (network?: string): number => {
  return network
    ? chainIds[network as keyof typeof chainIds]
    : chainIds.hardhat;
};

export const getConfig = (
  chainId: number,
  options?: { gasPrice?: number; gasLimit?: number },
): {
  bVault: string; // Balancer Vault address
  merkleOrchard?: string;
  gasPrice: string | BigNumber | undefined;
  gasLimit: string | number | undefined;
} => {
  if (!(Object.values(chainIds).includes(chainId))) {
      throw "unsupported chain ID";
  }
  return {
    bVault: getBVault(chainId),
    merkleOrchard: getMerkleOrchard(chainId),
    gasPrice: getGasPrice(chainId, options),
    gasLimit: getGasLimit(chainId, options),
  };
};
