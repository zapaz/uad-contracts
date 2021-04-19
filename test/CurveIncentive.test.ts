import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
import { DebtCouponManager } from "../artifacts/types/DebtCouponManager";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { CouponsForDollarsCalculator } from "../artifacts/types/CouponsForDollarsCalculator";
import { DollarMintingCalculator } from "../artifacts/types/DollarMintingCalculator";
import { MockAutoRedeemToken } from "../artifacts/types/MockAutoRedeemToken";
import { ExcessDollarsDistributor } from "../artifacts/types/ExcessDollarsDistributor";
import { CurveIncentive } from "../artifacts/types/CurveIncentive";

describe("CurveIncentive", () => {
  let metaPool: IMetaPool;
  let couponsForDollarsCalculator: CouponsForDollarsCalculator;
  let manager: UbiquityAlgorithmicDollarManager;
  let debtCouponMgr: DebtCouponManager;
  let curveIncentive: CurveIncentive;
  let twapOracle: TWAPOracle;
  let debtCoupon: DebtCoupon;
  let admin: Signer;
  let secondAccount: Signer;
  let treasury: Signer;
  let uGOVFund: Signer;
  let lpReward: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let crvToken: ERC20;
  // let sablier: string;
  // let USDC: string;
  // let DAI: string;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let curveWhale: Signer;
  let dollarMintingCalculator: DollarMintingCalculator;
  let mockAutoRedeemToken: MockAutoRedeemToken;
  let excessDollarsDistributor: ExcessDollarsDistributor;
  const oneETH = ethers.utils.parseEther("1");
  // const swap3CRVtoUAD = async (
  //   amount: BigNumber,
  //   signer: Signer
  // ): Promise<BigNumber> => {
  //   const dy3CRVtouAD = await metaPool["get_dy(int128,int128,uint256)"](
  //     1,
  //     0,
  //     amount
  //   );
  //   const expectedMinuAD = dy3CRVtouAD.div(100).mul(99);

  //   // signer need to approve metaPool for sending its coin
  //   await crvToken.connect(signer).approve(metaPool.address, amount);
  //   // secondAccount swap   3CRV=> x uAD
  //   await metaPool
  //     .connect(signer)
  //     ["exchange(int128,int128,uint256,uint256)"](1, 0, amount, expectedMinuAD);
  //   return dy3CRVtouAD;
  // };
  const swapUADto3CRV = async (
    amount: BigNumber,
    signer: Signer
  ): Promise<BigNumber> => {
    const dyuADto3CRV = await metaPool["get_dy(int128,int128,uint256)"](
      0,
      1,
      amount
    );
    const expectedMin3CRV = dyuADto3CRV.div(100).mul(99);

    // signer need to approve metaPool for sending its coin
    await uAD.connect(signer).approve(metaPool.address, amount);
    // secondAccount swap   3CRV=> x uAD
    await metaPool
      .connect(signer)
      ["exchange(int128,int128,uint256,uint256)"](
        0,
        1,
        amount,
        expectedMin3CRV
      );
    return dyuADto3CRV;
  };

  const couponLengthBlocks = 100;
  beforeEach(async () => {
    // list of accounts
    ({
      // sablier,
      // USDC,
      // DAI,
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [
      admin,
      secondAccount,
      treasury,
      uGOVFund,
      lpReward,
    ] = await ethers.getSigners();

    // deploy manager
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
    await manager.setuADTokenAddress(uAD.address);

    // set twap Oracle Address
    crvToken = (await ethers.getContractAt("ERC20", curve3CrvToken)) as ERC20;

    // to deploy the stableswap pool we need 3CRV and uAD
    // kindly ask a whale to give us some 3CRV
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });
    curveWhale = ethers.provider.getSigner(curveWhaleAddress);
    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));
    // just mint som uAD
    // mint 10000 uAD each for admin, manager and secondAccount
    const mintings = [await secondAccount.getAddress(), manager.address].map(
      async (signer): Promise<ContractTransaction> =>
        uAD.mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    console.log(
      `CurveFactory:${curveFactory}

         curve3CrvBasePool: ${curve3CrvBasePool}
         crvToken:${crvToken.address}`
    );
    await manager.deployStableSwapPool(
      curveFactory,
      curve3CrvBasePool,
      crvToken.address,
      10,
      4000000
    );
    // setup the oracle
    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
    metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;
    console.log(
      `
         crvToken:${metaPoolAddr}`
    );
    const TWAPOracleFactory = await ethers.getContractFactory("TWAPOracle");
    twapOracle = (await TWAPOracleFactory.deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken
    )) as TWAPOracle;

    await manager.setTwapOracleAddress(twapOracle.address);
    // set coupon for dollar Calculator
    const couponsForDollarsCalculatorFactory = await ethers.getContractFactory(
      "CouponsForDollarsCalculator"
    );
    couponsForDollarsCalculator = (await couponsForDollarsCalculatorFactory.deploy(
      manager.address
    )) as CouponsForDollarsCalculator;

    await manager.setCouponCalculatorAddress(
      couponsForDollarsCalculator.address
    );
    // set Dollar Minting Calculator
    const dollarMintingCalculatorFactory = await ethers.getContractFactory(
      "DollarMintingCalculator"
    );
    dollarMintingCalculator = (await dollarMintingCalculatorFactory.deploy(
      manager.address
    )) as DollarMintingCalculator;
    await manager.setDollarCalculatorAddress(dollarMintingCalculator.address);

    // set debt coupon token
    const dcManagerFactory = await ethers.getContractFactory(
      "DebtCouponManager"
    );
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      manager.address
    )) as DebtCoupon;

    await manager.setDebtCouponAddress(debtCoupon.address);
    debtCouponMgr = (await dcManagerFactory.deploy(
      manager.address,
      couponLengthBlocks
    )) as DebtCouponManager;

    // debtCouponMgr should have the COUPON_MANAGER role to mint debtCoupon
    const COUPON_MANAGER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("COUPON_MANAGER")
    );
    // debtCouponMgr should have the UBQ_MINTER_ROLE to mint uAD for debtCoupon Redeem
    const UBQ_MINTER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
    );
    // debtCouponMgr should have the UBQ_BURNER_ROLE to burn uAD when minting debtCoupon
    const UBQ_BURNER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_BURNER_ROLE")
    );
    await manager.grantRole(COUPON_MANAGER_ROLE, debtCouponMgr.address);
    await manager.grantRole(UBQ_MINTER_ROLE, debtCouponMgr.address);
    await manager.grantRole(UBQ_BURNER_ROLE, debtCouponMgr.address);

    // Incentive
    const incentiveFactory = await ethers.getContractFactory("CurveIncentive");
    curveIncentive = (await incentiveFactory.deploy(
      manager.address
    )) as CurveIncentive;
    // curveIncentive should have the UBQ_BURNER_ROLE to burn uAD during incentive
    await manager.grantRole(UBQ_BURNER_ROLE, curveIncentive.address);
    // set the incentive contract to act upon transfer from and to the curve pool
    await manager.setIncentiveToUAD(metaPool.address, curveIncentive.address);

    // to calculate the totalOutstanding debt we need to take into account autoRedeemToken.totalSupply
    const mockAutoRedeemTokenFactory = await ethers.getContractFactory(
      "MockAutoRedeemToken"
    );
    mockAutoRedeemToken = (await mockAutoRedeemTokenFactory.deploy(
      0
    )) as MockAutoRedeemToken;

    await manager.setAutoRedeemPoolTokenAddress(mockAutoRedeemToken.address);

    // when the debtManager mint uAD it there is too much it distribute the excess to
    // ????TODO
    const excessDollarsDistributorFactory = await ethers.getContractFactory(
      "ExcessDollarsDistributor"
    );
    excessDollarsDistributor = (await excessDollarsDistributorFactory.deploy(
      manager.address
    )) as ExcessDollarsDistributor;

    await manager.setExcessDollarsDistributor(
      debtCouponMgr.address,
      excessDollarsDistributor.address
    );

    // set treasury,uGOVFund and lpReward address needed for excessDollarsDistributor
    await manager.setTreasuryAddress(await treasury.getAddress());
    await manager.setuGovFundAddress(await uGOVFund.getAddress());
    await manager.setLpRewardsAddress(await lpReward.getAddress());
  });

  it("Curve sell Incentive should be call when swapping uAD for 3CRV or underlying when uAD <1$", async () => {
    // Price must be below 1
    // Exchange (swap)
    await swapUADto3CRV(ethers.utils.parseEther("2000"), secondAccount);
    await twapOracle.update();
    //  await swap3CRVtoUAD(BigNumber.from(1), curveWhale);

    const uADPrice = await twapOracle.consult(uAD.address);
    expect(uADPrice).to.be.lt(oneETH);

    // TODO Check that the incentive is applied
  });
});
