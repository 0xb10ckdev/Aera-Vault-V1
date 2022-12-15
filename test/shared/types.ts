// eslint-disable @typescript-eslint/no-explicit-any
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { Fixture } from "ethereum-waffle";
import { BigNumber } from "ethers";
import {
  AeraVaultV2Mock,
  ERC4626Mock,
  IERC20,
  ManagedPoolFactory,
  OracleMock,
  PermissiveWithdrawalValidator,
  WithdrawalValidatorMock,
} from "../../typechain";

declare module "mocha" {
  interface Context {
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    getUserBalances: (address: string) => Promise<BigNumber[]>;
    getManagersFeeTotal: () => Promise<BigNumber[]>;
    getState: (
      managerAddress?: string,
      adminAddress?: string,
    ) => Promise<{
      holdings: BigNumber[];
      adminBalances: BigNumber[];
      managerBalances: BigNumber[];
    }>;

    signers: Signers;
    tokenAddresses: string[];
    sortedTokens: string[];
    oracleAddresses: string[];
    unsortedTokens: string[];
    underlyingIndexes: number[];
    vault: AeraVaultV2Mock;
    validator: WithdrawalValidatorMock;
    permissiveValidator: PermissiveWithdrawalValidator;
    factory: ManagedPoolFactory;
    poolTokens: IERC20[];
    tokens: IERC20[];
    yieldTokens: ERC4626Mock[];
    oracles: OracleMock[];
    isForkTest: boolean;
  }
}

export interface Signers {
  admin: SignerWithAddress;
  manager: SignerWithAddress;
  user: SignerWithAddress;
}
