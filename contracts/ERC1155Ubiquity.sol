// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import "./UbiquityAlgorithmicDollarManager.sol";

/// @title ERC1155 Ubiquity preset
/// @author Ubiquity Algorithmic Dollar
/// @notice ERC1155 with :
/// - ERC1155 minter, burner and pauser
/// - TotatSupply per id
/// - Ubiquity Manager access control
contract ERC1155Ubiquity is ERC1155, ERC1155Burnable, ERC1155Pausable {
    UbiquityAlgorithmicDollarManager public manager;

    uint256 private _totalSupply;

    // ----------- Modifiers -----------
    modifier onlyMinter() {
        require(
            manager.hasRole(manager.UBQ_MINTER_ROLE(), msg.sender),
            "UBQ token: not minter"
        );
        _;
    }

    modifier onlyBurner() {
        require(
            manager.hasRole(manager.UBQ_BURNER_ROLE(), msg.sender),
            "UBQ token: not burner"
        );
        _;
    }

    modifier onlyPauser() {
        require(
            manager.hasRole(manager.PAUSER_ROLE(), msg.sender),
            "UBQ token: not pauser"
        );
        _;
    }

    /**
     * @dev constructor
     */
    constructor(address _manager, string memory uri) ERC1155(uri) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    // @dev Creates `amount` new tokens for `to`, of token type `id`.
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual onlyMinter {
        _mint(to, id, amount, data);
        _totalSupply += amount;
    }

    /*     /// @notice burn boinding shares tokens from specified account
    /// @param account the account to burn from
    /// @param amount the amount to burn
    function burnFrom(
        address account,
        uint256 id,
        uint256 amount
    )
        public
        onlyBurner
        whenNotPaused // to suppress ? if BURNER_ROLE should do it even paused ?
    {
        _burn(account, amount);
           _totalSupply -= amount;
    } */

    // @dev xref:ROOT:erc1155.adoc#batch-operations[Batched] variant of {mint}.
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual onlyMinter whenNotPaused {
        _mintBatch(to, ids, amounts, data);
        for (uint256 i = 0; i < ids.length; ++i) {
            _totalSupply += amounts[i];
        }
    }

    /**
     * @dev Pauses all token transfers.
     *
     * See {ERC1155Pausable} and {Pausable-_pause}.
     *
     */
    function pause() public virtual onlyPauser {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     *
     * See {ERC1155Pausable} and {Pausable-_unpause}.
     *
     */
    function unpause() public virtual onlyPauser {
        _unpause();
    }

    /**
     * @dev Total amount of tokens in with a given id.
     */
    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    function _burn(
        address account,
        uint256 id,
        uint256 amount
    ) internal virtual override whenNotPaused {
        super._burn(account, id, amount);
        _totalSupply -= amount;
    }

    function _burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal virtual override whenNotPaused {
        super._burnBatch(account, ids, amounts);
        for (uint256 i = 0; i < ids.length; ++i) {
            _totalSupply -= amounts[i];
        }
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override(ERC1155, ERC1155Pausable) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}
