// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Tessera - single-use USDC gift codes
/// Sender deposits amount + relayerFee. Recipient gets exactly `amount`;
/// the relayer gets `fee` to cover the gas it paid.
contract Tessera is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { None, Active, Redeemed, Refunded }

    struct Gift {
        address sender;
        uint256 amount;
        uint256 fee;
        uint256 expiresAt;
        Status status;
        string message;
    }

    IERC20 public immutable usdc;
    address public relayer;
    uint256 public relayerFee; // USDC has 6 decimals: 100000 = 0.10 USDC

    uint256 public constant MAX_FEE = 1_000_000;
    uint256 public constant MIN_AMOUNT = 10_000; // 0.01 USDC
    uint256 public constant EXPIRY = 30 days;
    uint256 public constant MAX_MESSAGE_BYTES = 140;

    mapping(bytes32 => Gift) public gifts; // key = keccak256(code)

    event GiftCreated(bytes32 indexed codeHash, address indexed sender, uint256 amount, uint256 fee, uint256 expiresAt, string message);
    event GiftRedeemed(bytes32 indexed codeHash, address indexed recipient, uint256 amount, uint256 fee);
    event GiftRefunded(bytes32 indexed codeHash, address indexed sender, uint256 total);

    constructor(address _usdc, address _relayer, uint256 _fee) Ownable(msg.sender) {
        require(_usdc != address(0) && _relayer != address(0), "Zero address");
        require(_fee <= MAX_FEE, "Fee too high");
        usdc = IERC20(_usdc);
        relayer = _relayer;
        relayerFee = _fee;
    }

    function createGift(bytes32 codeHash, uint256 amount, string calldata message) external nonReentrant {
        require(gifts[codeHash].status == Status.None, "Code already used");
        require(amount >= MIN_AMOUNT, "Amount too small");
        require(bytes(message).length <= MAX_MESSAGE_BYTES, "Message too long");

        uint256 fee = relayerFee;
        uint256 expiresAt = block.timestamp + EXPIRY;
        gifts[codeHash] = Gift(msg.sender, amount, fee, expiresAt, Status.Active, message);

        usdc.safeTransferFrom(msg.sender, address(this), amount + fee);
        emit GiftCreated(codeHash, msg.sender, amount, fee, expiresAt, message);
    }

    function claim(string calldata code, address recipient) external nonReentrant {
        require(msg.sender == relayer, "Only relayer");
        require(recipient != address(0), "Bad recipient");

        bytes32 codeHash = keccak256(bytes(code));
        Gift storage g = gifts[codeHash];
        require(g.status == Status.Active, "Gift not active");
        require(block.timestamp <= g.expiresAt, "Gift expired");

        g.status = Status.Redeemed;
        usdc.safeTransfer(recipient, g.amount);
        if (g.fee > 0) usdc.safeTransfer(msg.sender, g.fee);
        emit GiftRedeemed(codeHash, recipient, g.amount, g.fee);
    }

    function refund(bytes32 codeHash) external nonReentrant {
        Gift storage g = gifts[codeHash];
        require(g.status == Status.Active, "Gift not active");
        require(msg.sender == g.sender, "Not the sender");
        require(block.timestamp > g.expiresAt, "Not expired yet");

        g.status = Status.Refunded;
        uint256 total = g.amount + g.fee;
        usdc.safeTransfer(g.sender, total);
        emit GiftRefunded(codeHash, g.sender, total);
    }

    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Zero address");
        relayer = _relayer;
    }

    function setRelayerFee(uint256 _fee) external onlyOwner {
        require(_fee <= MAX_FEE, "Fee too high");
        relayerFee = _fee;
    }
}
