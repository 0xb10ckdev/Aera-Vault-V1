// We require the Hardhat Runtime Environment explicitly here. This is optional but useful for running the
// script in a standalone fashion through `node <script>`. When running the script with `hardhat run <script>`,
// you'll find the Hardhat Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD, getConfig } from "../scripts/config";
import {
  MammonVaultV0,
  MammonVaultV0__factory,
  PermissiveWithdrawalValidator,
  PermissiveWithdrawalValidator__factory,
} from "../typechain";

async function main(): Promise<void> {
  if (!process.env.TOKEN0) {
    console.log("--token0 parameter is not specified");
    return;
  }
  if (!process.env.TOKEN1) {
    console.log("--token1 parameter is not specified");
    return;
  }

  const token0 = process.env.TOKEN0;
  const token1 = process.env.TOKEN1;
  const manager = process.env.MANAGER || ethers.constants.AddressZero;

  console.log("Deploying vault with");
  console.log(`Token0: ${token0}`);
  console.log(`Token1: ${token1}`);
  console.log(`Manager: ${manager}`);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const config = getConfig(chainId);

  const validatorFactory: PermissiveWithdrawalValidator__factory =
    await ethers.getContractFactory("PermissiveWithdrawalValidator");
  const validator = <PermissiveWithdrawalValidator>(
    await validatorFactory.deploy()
  );

  const VaultFactory: MammonVaultV0__factory = await ethers.getContractFactory(
    "MammonVaultV0",
    {
      libraries: {
        "contracts/libraries/SmartPoolManager.sol:SmartPoolManager":
          config.poolManager,
      },
    },
  );
  const vault = <MammonVaultV0>(
    await VaultFactory.deploy(
      config.bFactory,
      token0,
      token1,
      manager,
      validator.address,
      DEFAULT_NOTICE_PERIOD,
    )
  );
  console.log("Vault deployed to: ", vault.address);
}

// We recommend this pattern to be able to use async/await everywhere and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
