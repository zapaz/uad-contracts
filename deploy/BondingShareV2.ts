import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, ethers } = hre;
  const [admin] = await ethers.getSigners();
  deployments.log("admin address :", admin.address);

  const opts = {
    from: admin.address,
    log: true,
  };
  const manager = await deployments.deploy("UbiquityAlgorithmicDollarManager", {
    args: [admin.address],
    ...opts,
  });
  const uri = `{
    "name": "Bonding Share",
    "description": "Ubiquity Bonding Share V2",
    "image": "https://ubq.fi/image/logos/april-2021/jpg/ubq-logo-waves.jpg"
  }`;
  const uAD = await deployments.deploy("BondingShareV2", {
    args: [manager.address, uri],
    ...opts,
  });
  deployments.log("BondingShareV2 deployed at:", uAD.address);
};
export default func;
func.tags = ["BondingShareV2"];
