// Addresses are taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses
export const getConfig = (
  chainId: number,
): { vault: string; poolManager: string } => {
  switch (chainId) {
    case 1:
      return {
        vault: "MammonVaultV0Mainnet",
        poolManager: "0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4",
      };
    case 42:
      return {
        vault: "MammonVaultV0Kovan",
        poolManager: "0x8DBB8C9bFEb7689f16772c85136993cDA0c05eA4",
      };
    case 31337:
      return {
        vault: "MammonVaultV0Mainnet",
        poolManager: "0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4",
      };
    default:
      throw "unsupported chain ID";
  }
};

export const DEFAULT_NOTICE_PERIOD = 3600;
