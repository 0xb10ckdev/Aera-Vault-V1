import { AggregatorV2V3Interface } from "./../../typechain/AggregatorV2V3Interface.d";
// eslint-disable @typescript-eslint/no-explicit-any
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { Fixture } from "ethereum-waffle";
import { BigNumber } from "ethers";
import {
  AddressBookInterface,
  AeraVaultV2Mock,
  ERC4626Mock,
  IERC20,
  IPutOptionsPricer,
  IVolatilitySurfaceOracle,
  ManagedPoolFactory,
  MockAddressBook,
  MockGammaOracle,
  MockOTokenController,
  MockVolatilitySurfaceOracle,
  MockWhitelist,
  OracleMock,
  PermissiveWithdrawalValidator,
  PremiaOptionsPricer,
  PutOptionsPricerMock,
  PutOptionsVault,
  WithdrawalValidatorMock,
} from "../../typechain";

declare module "mocha" {
  interface Context {
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    getUserBalances: (address: string) => Promise<BigNumber[]>;
    getGuardiansFeeTotal: () => Promise<BigNumber[]>;
    getState: (
      guardianAddress?: string,
      adminAddress?: string,
    ) => Promise<{
      holdings: BigNumber[];
      adminBalances: BigNumber[];
      guardianBalances: BigNumber[];
    }>;

    signers: Signers;
    mocks: Mocks;
    tokenAddresses: string[];
    sortedTokens: string[];
    oracleAddresses: string[];
    unsortedTokens: string[];
    underlyingIndexes: number[];
    opynAddressBook: AddressBookInterface;
    putOptionsVault: PutOptionsVault;
    pricer: IPutOptionsPricer;
    premiaPricer: PremiaOptionsPricer;
    vault: AeraVaultV2Mock;
    validator: WithdrawalValidatorMock;
    usdc: IERC20;
    weth: IERC20;
    chainlinkOracle: AggregatorV2V3Interface;
    volatilitySurfaceOracle: IVolatilitySurfaceOracle;
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
  guardian: SignerWithAddress;
  user: SignerWithAddress;
  stranger: SignerWithAddress;
}

export interface Mocks {
  pricer: PutOptionsPricerMock;
  oTokenController: MockOTokenController;
  gammaOracle: MockGammaOracle;
  addressBook: MockAddressBook;
  whitelist: MockWhitelist;
  oracle: OracleMock;
  volatilitySurfaceOracle: MockVolatilitySurfaceOracle;
}
