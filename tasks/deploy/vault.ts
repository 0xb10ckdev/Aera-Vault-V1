import { DEFAULT_NOTICE_PERIOD, getConfig } from "../../scripts/config";
import { task } from "hardhat/config";
import { MammonVaultV0, MammonVaultV0__factory } from "../../typechain";

task("deploy:Vault")
  .addOptionalParam("token0", "Token0's address")
  .addOptionalParam("token1", "Token1's address")
  .addOptionalParam("manager", "Manager's address")
  .addOptionalParam("validator", "Validator's address")
  .setAction(async (taskArgs, { deployments, ethers }) => {
    const token0 = taskArgs.token0;
    const token1 = taskArgs.token1;
    const manager = taskArgs.manager || ethers.constants.AddressZero;
    const validator =
      taskArgs.validator || (await deployments.get("Validator"))?.address;

    if (!token0) {
      console.log("--token0 parameter is not specified");
      return;
    }
    if (!token1) {
      console.log("--token1 parameter is not specified");
      return;
    }
    if (!validator) {
      console.log("--validator parameter is not specified");
      return;
    }

    console.log("Deploying vault with");
    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);
    console.log(`Manager: ${manager}`);
    console.log(`Validator: ${validator}`);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = getConfig(chainId);

    const VaultFactory: MammonVaultV0__factory =
      await ethers.getContractFactory("MammonVaultV0", {
        libraries: {
          "contracts/libraries/SmartPoolManager.sol:SmartPoolManager":
            config.poolManager,
        },
      });
    const vault = <MammonVaultV0>(
      await VaultFactory.deploy(
        config.bFactory,
        token0,
        token1,
        manager,
        validator,
        DEFAULT_NOTICE_PERIOD,
      )
    );
    console.log("Vault is deployed to: ", vault.address);
  });
