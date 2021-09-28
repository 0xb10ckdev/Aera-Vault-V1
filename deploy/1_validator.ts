import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const { deploy } = deployments;

  const { admin } = await hre.getNamedAccounts();

  await deploy("Validator", {
    contract: "PermissiveWithdrawalValidator",
    from: admin,
    log: true,
  });
};
export default func;
func.tags = ["validator"];
