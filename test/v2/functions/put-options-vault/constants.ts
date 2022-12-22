import { toUnit, toWei } from "../../utils";

export const DEFAULT_OPTION_PREMIUM_DISCOUNT = toWei(0.05); // Discount for option premium, when buying/selling option from/to the broker
export const DEFAULT_ITM_OPTION_PRICE_RATIO = toWei(0.99); // ITM option price ratio which is applied after option is expired, but before price is finalized

export const EXPIRY_DELTA_MIN = 3600;
export const EXPIRY_DELTA_MAX = 7200;

export const STRIKE_MULTIPLIER_MIN = 0.7;
export const STRIKE_MULTIPLIER_MAX = 0.99;

export const MIN_ORDER_ACTIVE = 60 * 60 * 24 * 3; // 3 days

export const O_TOKEN_DECIMALS = 8;
export const USDC_DECIMALS = 6;
export const PRICER_DECIMALS = 8;

export const DEFAULT_SPOT_PRICE = toUnit(1000, USDC_DECIMALS);
export const DEFAULT_PREMIUM = toUnit(140, PRICER_DECIMALS);
