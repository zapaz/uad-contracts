// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC1155Supply.sol";

import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/ISablier.sol";
import "./interfaces/ITWAPOracle.sol";
import "./interfaces/IBondingShare.sol";
import "./utils/CollectableDust.sol";

contract Bonding is CollectableDust {
    using SafeERC20 for IERC20;

    uint16 id = 42;
    bytes data = "";

    UbiquityAlgorithmicDollarManager public manager;

    uint256 public constant TARGET_PRICE = 1 ether; // 3Crv has 18 decimals
    // Initially set at $1,000,000 to avoid interference with growth.
    uint256 public maxBondingPrice = uint256(1 ether) * 1000000;
    ISablier public sablier;
    uint256 public bondingDiscountMultiplier = 0;
    uint256 public redeemStreamTime = 86400; // 1 day in seconds

    event MaxBondingPriceUpdated(uint256 _maxBondingPrice);
    event SablierUpdated(address _sablier);
    event BondingDiscountMultiplierUpdated(uint256 _bondingDiscountMultiplier);
    event RedeemStreamTimeUpdated(uint256 _redeemStreamTime);

    modifier onlyBondingManager() {
        require(
            manager.hasRole(manager.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _;
    }

    constructor(address _manager, address _sablier) CollectableDust() {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        sablier = ISablier(_sablier);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /// Collectable Dust
    function addProtocolToken(address _token)
        external
        override
        onlyBondingManager
    {
        _addProtocolToken(_token);
    }

    function removeProtocolToken(address _token)
        external
        override
        onlyBondingManager
    {
        _removeProtocolToken(_token);
    }

    function sendDust(
        address _to,
        address _token,
        uint256 _amount
    ) external override onlyBondingManager {
        _sendDust(_to, _token, _amount);
    }

    function setMaxBondingPrice(uint256 _maxBondingPrice)
        external
        onlyBondingManager
    {
        maxBondingPrice = _maxBondingPrice;
        emit MaxBondingPriceUpdated(_maxBondingPrice);
    }

    function setSablier(address _sablier) external onlyBondingManager {
        sablier = ISablier(_sablier);
        emit SablierUpdated(_sablier);
    }

    function setBondingDiscountMultiplier(uint256 _bondingDiscountMultiplier)
        external
        onlyBondingManager
    {
        bondingDiscountMultiplier = _bondingDiscountMultiplier;
        emit BondingDiscountMultiplierUpdated(_bondingDiscountMultiplier);
    }

    function setRedeemStreamTime(uint256 _redeemStreamTime)
        external
        onlyBondingManager
    {
        redeemStreamTime = _redeemStreamTime;
        emit RedeemStreamTimeUpdated(_redeemStreamTime);
    }

    function bondTokens(uint256 _amount) public {
        _updateOracle();
        uint256 currentPrice = currentTokenPrice();
        require(
            currentPrice < maxBondingPrice,
            "Bonding: Current price is too high"
        );
        IERC20(manager.uADTokenAddress()).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        _bond(_amount, currentPrice);
    }

    function redeemShares(uint256 _sharesAmount) public {
        _updateOracle();

        require(
            IERC20(manager.bondingShareAddress()).balanceOf(msg.sender) >=
                _sharesAmount,
            "Bonding: Caller does not have enough shares"
        );

        IBondingShare(manager.bondingShareAddress()).burn(
            msg.sender,
            id,
            _sharesAmount
        );

        uint256 tokenAmount =
            (_sharesAmount * currentShareValue()) / TARGET_PRICE;

        if (redeemStreamTime == 0) {
            IERC20(manager.uADTokenAddress()).safeTransfer(
                msg.sender,
                tokenAmount
            );
        } else {
            // The transaction must be processed by the Ethereum blockchain before
            // the start time of the stream, or otherwise the sablier contract
            // reverts with a "start time before block.timestamp" message.
            uint256 streamStart = block.timestamp + 60; // tx mining + 60 seconds

            uint256 streamStop = streamStart + redeemStreamTime;
            // The deposit must be a multiple of the difference between the stop
            // time and the start time
            uint256 streamDuration = streamStop - streamStart;
            tokenAmount = (tokenAmount / streamDuration) * streamDuration;

            IERC20(manager.uADTokenAddress()).safeApprove(address(sablier), 0);
            IERC20(manager.uADTokenAddress()).safeApprove(
                address(sablier),
                tokenAmount
            );

            sablier.createStream(
                msg.sender,
                tokenAmount,
                manager.uADTokenAddress(),
                streamStart,
                streamStop
            );
        }
    }

    function redeemAllShares() public {
        redeemShares(
            IERC20(manager.bondingShareAddress()).balanceOf(msg.sender)
        );
    }

    function currentShareValue() public view returns (uint256 pricePerShare) {
        uint256 totalShares =
            IERC1155Supply(manager.bondingShareAddress()).totalSupply(id);

        pricePerShare = totalShares == 0
            ? TARGET_PRICE
            : (IERC20(manager.uADTokenAddress()).balanceOf(address(this)) *
                TARGET_PRICE) / totalShares;
    }

    function currentTokenPrice() public view returns (uint256) {
        /* uint256[2] memory prices =
            IMetaPool(manager.stableSwapMetaPoolAddress())
                .get_price_cumulative_last();
        return prices[0]; */
        return
            ITWAPOracle(manager.twapOracleAddress()).consult(
                manager.uADTokenAddress()
            );
    }

    function _bond(uint256 _amount, uint256 currentPrice) internal {
        uint256 shareValue = currentShareValue();
        uint256 numberOfShares = (_amount / shareValue) * TARGET_PRICE;

        if (bondingDiscountMultiplier != 0) {
            uint256 bonus =
                ((TARGET_PRICE - currentPrice) *
                    numberOfShares *
                    bondingDiscountMultiplier) / (TARGET_PRICE * TARGET_PRICE);
            numberOfShares = numberOfShares + bonus;
        }

        IBondingShare(manager.bondingShareAddress()).mint(
            msg.sender,
            id,
            numberOfShares,
            data
        );
    }

    function _updateOracle() internal {
        ITWAPOracle(manager.twapOracleAddress()).update();
    }
}
