import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { parseEther } from "@ethersproject/units";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const { deploy } = deployments;

  const { admin } = await hre.getNamedAccounts();

  await deploy("DAI", {
    contract: "ERC20Mock",
    from: admin,
    args: ["TST_0", "TST_0", 18, parseEther("1000000000")],
    log: true,
  });

  await deploy("WETH", {
    contract: "ERC20Mock",
    from: admin,
    args: ["TST_1", "TST_1", 18, parseEther("1000000000")],
    log: true,
  });
};
export default func;
func.tags = ["test"];
