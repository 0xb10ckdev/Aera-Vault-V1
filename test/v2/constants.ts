import { toWei } from "./utils";
export * from "../v1/constants";

export const PRICE_DEVIATION = 1e15; // Deviation of oracle prices in wei
export const MIN_RELIABLE_VAULT_VALUE = toWei(1); // Minimum reliable vault TVL in base token
