// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/interfaces/IUserAPI.sol";
import "../../v1/interfaces/IMultiAssetVault.sol";
import "../dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./IProtocolAPI.sol";
import "./IProtocolAPIV2.sol";
import "./IManagerAPI.sol";
import "./IManagerAPIV2.sol";

/// @title Interface for v2 vault.
interface IAeraVaultV2 is
    IUserAPI,
    IManagerAPI,
    IMultiAssetVault,
    IProtocolAPI,
    IManagerAPIV2,
    IProtocolAPIV2
{
    // Use struct parameter to avoid stack too deep error.
    // factory: Balancer Managed Pool Factory address.
    // name: Name of Pool Token.
    // symbol: Symbol of Pool Token.
    // tokens: Token addresses.
    // weights: Token weights.
    // oracles: Chainlink oracle addresses.
    //          All oracles should be in reference to the same asset.
    // numeraireAssetIndex: Index of base token for oracles.
    // swapFeePercentage: Pool swap fee.
    // manager: Vault manager address.
    // validator: Withdrawal validator contract address.
    // minReliableVaultValue: Minimum reliable vault TVL.
    //                        It will be measured in base token terms.
    // minSignificantDepositValue: Minimum significant deposit value.
    //                             It will be measured in base token terms.
    // maxOracleSpotDivergence: Maximum oracle spot price divergence.
    // maxOracleDelay: Maximum update delay of oracles.
    // minFeeDuration: Minimum period to charge management fee.
    // managementFee: Management fee earned proportion per second.
    // merkleOrchard: Balancer Merkle Orchard address.
    // description: Simple vault text description.
    struct NewVaultParams {
        address factory;
        string name;
        string symbol;
        IERC20[] tokens;
        uint256[] weights;
        AggregatorV2V3Interface[] oracles;
        uint256 numeraireAssetIndex;
        uint256 swapFeePercentage;
        address manager;
        address validator;
        uint256 minReliableVaultValue;
        uint256 minSignificantDepositValue;
        uint256 maxOracleSpotDivergence;
        uint256 maxOracleDelay;
        uint256 minFeeDuration;
        uint256 managementFee;
        address merkleOrchard;
        string description;
    }

    // Price types.
    // DETERMINED: It means prices should be determined.
    // ORACLE: Use oracle prices.
    // SPOT: Use spot prices.
    enum PriceType {
        DETERMINED,
        ORACLE,
        SPOT
    }
}
