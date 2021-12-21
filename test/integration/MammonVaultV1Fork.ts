import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import {
  IERC20,
  MammonPoolFactoryV1,
  MammonPoolFactoryV1__factory,
  MammonVaultV1Mainnet,
  MammonVaultV1Mainnet__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../typechain";
import { setupTokens } from "../fixtures";
import { deployFactory, deployVault, toWei, valueArray } from "../utils";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";
import {
  ONE,
  MIN_WEIGHT,
  MIN_SWAP_FEE,
  MAX_SWAP_FEE,
  ZERO_ADDRESS,
  MAX_NOTICE_PERIOD,
  BALANCER_ERRORS,
} from "../constants";

describe("Mammon Vault V1 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: MammonPoolFactoryV1;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let unsortedTokens: string[];

  it("should be reverted to deploy vault", async () => {
    ({ admin, manager } = await ethers.getNamedSigners());

    ({ tokens, sortedTokens, unsortedTokens } = await setupTokens());

    await deployments.deploy("Validator", {
      contract: "WithdrawalValidatorMock",
      from: admin.address,
      log: true,
    });
    validator = WithdrawalValidatorMock__factory.connect(
      (await deployments.get("Validator")).address,
      admin,
    );

    await deployments.deploy("InvalidValidator", {
      contract: "InvalidValidatorMock",
      from: admin.address,
      log: true,
    });

    factory = await deployFactory(admin);

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        [...sortedTokens, tokens[0].address],
        validWeights,
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
      ),
    ).to.be.revertedWith("Mammon__LengthIsNotSame");
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
        MAX_NOTICE_PERIOD + 1,
      ),
    ).to.be.revertedWith("Mammon__NoticePeriodIsAboveMax");
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        manager.address,
      ),
    ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        (
          await deployments.get("InvalidValidator")
        ).address,
      ),
    ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        unsortedTokens,
        validWeights,
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith(BALANCER_ERRORS.UNSORTED_ARRAY);
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MAX_SWAP_FEE.add(1).toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MIN_SWAP_FEE.sub(1).toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        valueArray(MIN_WEIGHT, tokens.length),
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MIN_SWAP_FEE.toString(),
        ONE.add(1).toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith(BALANCER_ERRORS.MAX_MANAGEMENT_SWAP_FEE_PERCENTAGE);
  });
});

describe("Mammon Vault V1 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MammonVaultV1Mainnet;
  let validator: WithdrawalValidatorMock;
  let factory: MammonPoolFactoryV1;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let snapshot: unknown;

  const getStates = async () => {
    const holdings = await Promise.all(tokens.map((_, i) => vault.holding(i)));
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(admin.address)),
    );

    return {
      holdings,
      balances,
    };
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);
    ({ admin, manager, user } = await ethers.getNamedSigners());

    ({ tokens, sortedTokens } = await setupTokens());

    await deployments.deploy("Validator", {
      contract: "WithdrawalValidatorMock",
      from: admin.address,
      log: true,
    });
    validator = WithdrawalValidatorMock__factory.connect(
      (await deployments.get("Validator")).address,
      admin,
    );

    await hre.run("deploy:factory");
    factory = MammonPoolFactoryV1__factory.connect(
      (await deployments.get("MammonPoolFactoryV1")).address,
      admin,
    );

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);
    await hre.run("deploy:vault", {
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens.join(","),
      weights: validWeights.join(","),
      swapFee: MIN_SWAP_FEE.toString(),
      managementSwapFee: ONE.toString(),
      manager: manager.address,
      validator: validator.address,
      noticePeriod: DEFAULT_NOTICE_PERIOD.toString(),
    });

    vault = MammonVaultV1Mainnet__factory.connect(
      (await deployments.get("MammonVaultV1Mainnet")).address,
      admin,
    );
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("when Vault not initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        tokens[i].approve(vault.address, ONE);
      }
    });

    it("should be reverted to call functions", async () => {
      await expect(
        vault.deposit(valueArray(ONE, tokens.length)),
      ).to.be.revertedWith("Mammon__VaultNotInitialized");

      await expect(
        vault.withdraw(valueArray(ONE, tokens.length)),
      ).to.be.revertedWith("Mammon__VaultNotInitialized");

      const blocknumber = await ethers.provider.getBlockNumber();
      await expect(
        vault
          .connect(manager)
          .updateWeightsGradually(
            MIN_WEIGHT,
            MIN_WEIGHT,
            blocknumber + 1,
            blocknumber + 1000,
          ),
      ).to.be.revertedWith("Mammon__VaultNotInitialized");

      await expect(vault.initializeFinalization()).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
      );

      await expect(
        vault.connect(manager).setPublicSwap(true),
      ).to.be.revertedWith("VaultNotInitialized");
    });

    it("should be reverted to initialize the vault", async () => {
      const validAmounts = valueArray(ONE, tokens.length - 1);

      await expect(
        vault.initialDeposit([ONE.add(1), ...validAmounts]),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      await expect(
        vault.initialDeposit([...validAmounts, ONE.add(1)]),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      await expect(
        vault.initialDeposit([0, ...validAmounts]),
      ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);

      await expect(
        vault.initialDeposit([...validAmounts, 0]),
      ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
    });

    it("should be possible to initialize the vault", async () => {
      const { balances } = await getStates();

      expect(
        await vault.estimateGas.initialDeposit(valueArray(ONE, tokens.length)),
      ).to.below(800000);
      await vault.initialDeposit(valueArray(ONE, tokens.length));

      const { balances: newBalances } = await getStates();
      for (let i = 0; i < tokens.length; i++) {
        expect(newBalances[i]).to.equal(balances[i].sub(ONE));
        expect(await tokens[i].balanceOf(await vault.bVault())).to.equal(ONE);
      }
    });

    it("should be reverted to initialize the vault again", async () => {
      await vault.initialDeposit(valueArray(ONE, tokens.length));

      await expect(
        vault.initialDeposit(valueArray(ONE, tokens.length)),
      ).to.be.revertedWith("Mammon__VaultIsAlreadyInitialized");
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100));
      }
      await vault.initialDeposit(valueArray(ONE, tokens.length));
    });

    describe("when depositing to Vault", () => {
      it("should be reverted to deposit tokens", async () => {
        await expect(
          vault.connect(user).deposit(valueArray(ONE, tokens.length)),
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
          vault.deposit(valueArray(toWei(100), tokens.length)),
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      });

      it("should be possible to deposit one token", async () => {
        for (let i = 0; i < tokens.length; i++) {
          const { holdings, balances } = await getStates();

          const amounts = tokens.map((_, index) =>
            index == i ? toWei(5) : toWei(0),
          );
          await vault.deposit(amounts);

          const { holdings: newHoldings, balances: newBalances } =
            await getStates();
          for (let j = 0; j < tokens.length; j++) {
            expect(newHoldings[j]).to.equal(holdings[j].add(amounts[j]));
            expect(newBalances[j]).to.equal(balances[j].sub(amounts[j]));
          }
        }
      });

      it("should be possible to deposit tokens", async () => {
        const { holdings, balances } = await getStates();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100000)),
        );
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
        }
        await vault.deposit(amounts);

        const { holdings: newHoldings, balances: newBalances } =
          await getStates();
        for (let i = 0; i < tokens.length; i++) {
          expect(newHoldings[i]).to.equal(holdings[i].add(amounts[i]));
          expect(newBalances[i]).to.equal(balances[i].sub(amounts[i]));
        }
      });

      it("should be possible to withdraw one token", async () => {
        await vault.deposit(valueArray(toWei(5), tokens.length));

        for (let i = 0; i < tokens.length; i++) {
          const { holdings, balances } = await getStates();

          const amounts = tokens.map((_, index) =>
            index == i ? toWei(5) : toWei(0),
          );
          await vault.withdraw(amounts);

          const { holdings: newHoldings, balances: newBalances } =
            await getStates();
          for (let j = 0; j < tokens.length; j++) {
            expect(newHoldings[j]).to.equal(holdings[j].sub(amounts[j]));
            expect(newBalances[j]).to.equal(balances[j].add(amounts[j]));
          }
        }
      });

      it("should be possible to withdraw tokens", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }
        await vault.deposit(valueArray(toWei(100000), tokens.length));

        const { holdings, balances } = await getStates();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100000)),
        );
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
        }
        await vault.withdraw(amounts);

        const { holdings: newHoldings, balances: newBalances } =
          await getStates();
        for (let i = 0; i < tokens.length; i++) {
          expect(newHoldings[i]).to.equal(holdings[i].sub(amounts[i]));
          expect(newBalances[i]).to.equal(balances[i].add(amounts[i]));
        }
      });
    });
  });

  describe("Update Elements", () => {
    describe("Update Manager", () => {
      it("should be reverted to change manager", async () => {
        await expect(vault.setManager(ZERO_ADDRESS)).to.be.revertedWith(
          "Mammon__ManagerIsZeroAddress",
        );

        await expect(
          vault.connect(manager).setManager(ZERO_ADDRESS),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should be possible to change manager", async () => {
        expect(await vault.estimateGas.setManager(manager.address)).to.below(
          35000,
        );
        await vault.setManager(manager.address);

        expect(await vault.manager()).to.equal(manager.address);
      });
    });
  });
});
