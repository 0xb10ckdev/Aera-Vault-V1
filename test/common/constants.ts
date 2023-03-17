import { BigNumber, constants, utils } from "ethers";

export const toWei = (value: number | string): BigNumber => {
  return utils.parseEther(value.toString());
};

export const ONE = toWei("1");
export const MIN_WEIGHT = toWei("0.01");
export const MIN_SWAP_FEE = toWei("0.000001");
export const MAXIMUM_SWAP_FEE_PERCENT_CHANGE = toWei("0.005");
export const SWAP_FEE_COOLDOWN_PERIOD = 60; // 1 minute
export const ZERO_ADDRESS = constants.AddressZero;
export const MAX_MANAGEMENT_FEE = toWei("0.000000001"); // 60 days in seconds
export const MAX_WEIGHT_CHANGE_RATIO = 1e16; // Maximum weight change ratio
export const MINIMUM_WEIGHT_CHANGE_DURATION = 14400; // 4 hours in seconds
export const DEVIATION = 1e10; // Deviation of weights in wei

export const BALANCER_ERRORS = {
  // Math
  ADD_OVERFLOW: "BAL#000",
  SUB_OVERFLOW: "BAL#001",
  SUB_UNDERFLOW: "BAL#002",
  MUL_OVERFLOW: "BAL#003",
  ZERO_DIVISION: "BAL#004",
  DIV_INTERNAL: "BAL#005",
  X_OUT_OF_BOUNDS: "BAL#006",
  Y_OUT_OF_BOUNDS: "BAL#007",
  PRODUCT_OUT_OF_BOUNDS: "BAL#008",
  INVALID_EXPONENT: "BAL#009",

  // Input
  OUT_OF_BOUNDS: "BAL#100",
  UNSORTED_ARRAY: "BAL#101",
  UNSORTED_TOKENS: "BAL#102",
  INPUT_LENGTH_MISMATCH: "BAL#103",
  ZERO_TOKEN: "BAL#104",

  // Shared pools
  MIN_TOKENS: "BAL#200",
  MAX_TOKENS: "BAL#201",
  MAX_SWAP_FEE_PERCENTAGE: "BAL#202",
  MIN_SWAP_FEE_PERCENTAGE: "BAL#203",
  MINIMUM_BPT: "BAL#204",
  CALLER_NOT_VAULT: "BAL#205",
  UNINITIALIZED: "BAL#206",
  BPT_IN_MAX_AMOUNT: "BAL#207",
  BPT_OUT_MIN_AMOUNT: "BAL#208",
  EXPIRED_PERMIT: "BAL#209",
  NOT_TWO_TOKENS: "BAL#210",

  // Pools
  MIN_AMP: "BAL#300",
  MAX_AMP: "BAL#301",
  MIN_WEIGHT: "BAL#302",
  MAX_STABLE_TOKENS: "BAL#303",
  MAX_IN_RATIO: "BAL#304",
  MAX_OUT_RATIO: "BAL#305",
  MIN_BPT_IN_FOR_TOKEN_OUT: "BAL#306",
  MAX_OUT_BPT_FOR_TOKEN_IN: "BAL#307",
  NORMALIZED_WEIGHT_INVARIANT: "BAL#308",
  INVALID_TOKEN: "BAL#309",
  UNHANDLED_JOIN_KIND: "BAL#310",
  ZERO_INVARIANT: "BAL#311",
  ORACLE_INVALID_SECONDS_QUERY: "BAL#312",
  ORACLE_NOT_INITIALIZED: "BAL#313",
  ORACLE_QUERY_TOO_OLD: "BAL#314",
  ORACLE_INVALID_INDEX: "BAL#315",
  ORACLE_BAD_SECS: "BAL#316",
  AMP_END_TIME_TOO_CLOSE: "BAL#317",
  AMP_ONGOING_UPDATE: "BAL#318",
  AMP_RATE_TOO_HIGH: "BAL#319",
  AMP_NO_ONGOING_UPDATE: "BAL#320",
  STABLE_INVARIANT_DIDNT_CONVERGE: "BAL#321",
  STABLE_GET_BALANCE_DIDNT_CONVERGE: "BAL#322",
  RELAYER_NOT_CONTRACT: "BAL#323",
  BASE_POOL_RELAYER_NOT_CALLED: "BAL#324",
  REBALANCING_RELAYER_REENTERED: "BAL#325",
  GRADUAL_UPDATE_TIME_TRAVEL: "BAL#326",
  SWAPS_DISABLED: "BAL#327",
  CALLER_IS_NOT_LBP_OWNER: "BAL#328",
  PRICE_RATE_OVERFLOW: "BAL#329",
  INVALID_JOIN_EXIT_KIND_WHILE_SWAPS_DISABLED: "BAL#330",
  WEIGHT_CHANGE_TOO_FAST: "BAL#331",
  LOWER_GREATER_THAN_UPPER_TARGET: "BAL#332",
  UPPER_TARGET_TOO_HIGH: "BAL#333",
  UNHANDLED_BY_LINEAR_POOL: "BAL#334",
  OUT_OF_TARGET_RANGE: "BAL#335",
  UNHANDLED_EXIT_KIND: "BAL#336",
  UNAUTHORIZED_EXIT: "BAL#337",
  MAX_MANAGEMENT_SWAP_FEE_PERCENTAGE: "BAL#338",
  UNHANDLED_BY_INVESTMENT_POOL: "BAL#339",
  UNHANDLED_BY_PHANTOM_POOL: "BAL#340",
  TOKEN_DOES_NOT_HAVE_RATE_PROVIDER: "BAL#341",

  // Lib
  REENTRANCY: "BAL#400",
  SENDER_NOT_ALLOWED: "BAL#401",
  PAUSED: "BAL#402",
  PAUSE_WINDOW_EXPIRED: "BAL#403",
  MAX_PAUSE_WINDOW_DURATION: "BAL#404",
  MAX_BUFFER_PERIOD_DURATION: "BAL#405",
  INSUFFICIENT_BALANCE: "BAL#406",
  INSUFFICIENT_ALLOWANCE: "BAL#407",
  ERC20_TRANSFER_FROM_ZERO_ADDRESS: "BAL#408",
  ERC20_TRANSFER_TO_ZERO_ADDRESS: "BAL#409",
  ERC20_MINT_TO_ZERO_ADDRESS: "BAL#410",
  ERC20_BURN_FROM_ZERO_ADDRESS: "BAL#411",
  ERC20_APPROVE_FROM_ZERO_ADDRESS: "BAL#412",
  ERC20_APPROVE_TO_ZERO_ADDRESS: "BAL#413",
  ERC20_TRANSFER_EXCEEDS_ALLOWANCE: "BAL#414",
  ERC20_DECREASED_ALLOWANCE_BELOW_ZERO: "BAL#415",
  ERC20_TRANSFER_EXCEEDS_BALANCE: "BAL#416",
  ERC20_BURN_EXCEEDS_ALLOWANCE: "BAL#417",
  SAFE_ERC20_CALL_FAILED: "BAL#418",
  ADDRESS_INSUFFICIENT_BALANCE: "BAL#419",
  ADDRESS_CANNOT_SEND_VALUE: "BAL#420",
  SAFE_CAST_VALUE_CANT_FIT_INT256: "BAL#421",
  GRANT_SENDER_NOT_ADMIN: "BAL#422",
  REVOKE_SENDER_NOT_ADMIN: "BAL#423",
  RENOUNCE_SENDER_NOT_ALLOWED: "BAL#424",
  BUFFER_PERIOD_EXPIRED: "BAL#425",
  CALLER_IS_NOT_OWNER: "BAL#426",
  NEW_OWNER_IS_ZERO: "BAL#427",
  CODE_DEPLOYMENT_FAILED: "BAL#428",
  CALL_TO_NON_CONTRACT: "BAL#429",
  LOW_LEVEL_CALL_FAILED: "BAL#430",

  // Vault
  INVALID_POOL_ID: "BAL#500",
  CALLER_NOT_POOL: "BAL#501",
  SENDER_NOT_ASSET_MANAGER: "BAL#502",
  USER_DOESNT_ALLOW_RELAYER: "BAL#503",
  INVALID_SIGNATURE: "BAL#504",
  EXIT_BELOW_MIN: "BAL#505",
  JOIN_ABOVE_MAX: "BAL#506",
  SWAP_LIMIT: "BAL#507",
  SWAP_DEADLINE: "BAL#508",
  CANNOT_SWAP_SAME_TOKEN: "BAL#509",
  UNKNOWN_AMOUNT_IN_FIRST_SWAP: "BAL#510",
  MALCONSTRUCTED_MULTIHOP_SWAP: "BAL#511",
  INTERNAL_BALANCE_OVERFLOW: "BAL#512",
  INSUFFICIENT_INTERNAL_BALANCE: "BAL#513",
  INVALID_ETH_INTERNAL_BALANCE: "BAL#514",
  INVALID_POST_LOAN_BALANCE: "BAL#515",
  INSUFFICIENT_ETH: "BAL#516",
  UNALLOCATED_ETH: "BAL#517",
  ETH_TRANSFER: "BAL#518",
  CANNOT_USE_ETH_SENTINEL: "BAL#519",
  TOKENS_MISMATCH: "BAL#520",
  TOKEN_NOT_REGISTERED: "BAL#521",
  TOKEN_ALREADY_REGISTERED: "BAL#522",
  TOKENS_ALREADY_SET: "BAL#523",
  TOKENS_LENGTH_MUST_BE_2: "BAL#524",
  NONZERO_TOKEN_BALANCE: "BAL#525",
  BALANCE_TOTAL_OVERFLOW: "BAL#526",
  POOL_NO_TOKENS: "BAL#527",
  INSUFFICIENT_FLASH_LOAN_BALANCE: "BAL#528",

  // Fees
  SWAP_FEE_PERCENTAGE_TOO_HIGH: "BAL#600",
  FLASH_LOAN_FEE_PERCENTAGE_TOO_HIGH: "BAL#601",
  INSUFFICIENT_FLASH_LOAN_FEE_AMOUNT: "BAL#602",
};
