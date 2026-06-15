// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../VeriChainXAuthenticityVerifier.sol";

/**
 * @title VeriChainXCrossChainBridge
 * @dev Cross-chain bridge for VeriChainX authenticity tokens and verifications
 * Enables seamless transfer of authenticity data and tokens across multiple blockchain networks
 */
contract VeriChainXCrossChainBridge is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant BRIDGE_ADMIN_ROLE = keccak256("BRIDGE_ADMIN_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // Cross-chain network configuration
    struct ChainConfig {
        uint256 chainId;
        string networkName;
        address bridgeContract;
        uint256 confirmationBlocks;
        uint256 transferFee;
        bool active;
        uint256 maxTransferAmount;
        uint256 dailyTransferLimit;
    }

    // Bridge transfer request
    struct BridgeTransfer {
        bytes32 transferId;
        address sender;
        address recipient;
        uint256 sourceChain;
        uint256 destinationChain;
        address token;
        uint256 amount;
        bytes32 authenticityHash;
        uint256 timestamp;
        TransferStatus status;
        uint256 confirmations;
        bytes signatures;
    }

    // Authenticity verification bridge data
    struct CrossChainVerification {
        bytes32 verificationId;
        uint256 sourceChain;
        string productId;
        uint256 authenticityScore;
        bytes32 evidenceHash;
        string verificationMethod;
        address verifier;
        uint256 timestamp;
        bool synchronized;
        mapping(uint256 => bool) chainSyncStatus;
    }

    enum TransferStatus {
        PENDING,
        CONFIRMED,
        EXECUTED,
        FAILED,
        REFUNDED
    }

    // State variables
    VeriChainXAuthenticityVerifier public immutable authenticityVerifier;
    
    mapping(uint256 => ChainConfig) public supportedChains;
    mapping(bytes32 => BridgeTransfer) public bridgeTransfers;
    mapping(bytes32 => CrossChainVerification) public crossChainVerifications;
    mapping(address => mapping(uint256 => uint256)) public dailyTransferAmounts;
    mapping(address => bool) public supportedTokens;
    mapping(bytes32 => bool) public processedTransfers;
    mapping(address => uint256) public validatorStake;
    mapping(bytes32 => uint256) public transferNonces;
    
    uint256[] public activeChains;
    uint256 public currentChainId;
    uint256 public minimumValidators = 3;
    uint256 public validatorStakeRequired = 10000 * 10**18; // 10,000 tokens
    uint256 public bridgeFeePool;
    uint256 public emergencyPauseTime;

    // Events
    event TransferInitiated(
        bytes32 indexed transferId,
        address indexed sender,
        address indexed recipient,
        uint256 sourceChain,
        uint256 destinationChain,
        address token,
        uint256 amount,
        bytes32 authenticityHash
    );
    
    event TransferConfirmed(
        bytes32 indexed transferId,
        uint256 confirmations,
        address validator
    );
    
    event TransferExecuted(
        bytes32 indexed transferId,
        address indexed recipient,
        uint256 amount,
        uint256 destinationChain
    );
    
    event TransferFailed(
        bytes32 indexed transferId,
        string reason
    );
    
    event VerificationSynchronized(
        bytes32 indexed verificationId,
        uint256 sourceChain,
        uint256 destinationChain,
        uint256 authenticityScore
    );
    
    event ChainAdded(
        uint256 indexed chainId,
        string networkName,
        address bridgeContract
    );
    
    event ValidatorAdded(
        address indexed validator,
        uint256 stake
    );
    
    event ValidatorRemoved(
        address indexed validator,
        string reason
    );
    
    event EmergencyPause(
        address indexed admin,
        string reason,
        uint256 timestamp
    );

    modifier onlyValidChain(uint256 chainId) {
        require(supportedChains[chainId].active, "Chain not supported");
        _;
    }

    modifier onlyValidToken(address token) {
        require(supportedTokens[token], "Token not supported");
        _;
    }

    modifier onlyActiveValidator() {
        require(hasRole(VALIDATOR_ROLE, msg.sender), "Not a validator");
        require(validatorStake[msg.sender] >= validatorStakeRequired, "Insufficient stake");
        _;
    }

    constructor(
        address admin,
        address _authenticityVerifier,
        uint256 _currentChainId
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(BRIDGE_ADMIN_ROLE, admin);
        
        authenticityVerifier = VeriChainXAuthenticityVerifier(payable(_authenticityVerifier));
        currentChainId = _currentChainId;
        
        // Add current chain to supported chains
        supportedChains[_currentChainId] = ChainConfig({
            chainId: _currentChainId,
            networkName: "Hedera",
            bridgeContract: address(this),
            confirmationBlocks: 12,
            transferFee: 0.1 ether,
            active: true,
            maxTransferAmount: 1000000 * 10**18,
            dailyTransferLimit: 100000 * 10**18
        });
        
        activeChains.push(_currentChainId);
    }

    /**
     * @dev Initiate cross-chain transfer with authenticity verification
     */
    function initiateCrossChainTransfer(
        address recipient,
        uint256 destinationChain,
        address token,
        uint256 amount,
        bytes32 authenticityHash,
        bytes calldata additionalData
    ) external payable nonReentrant whenNotPaused onlyValidChain(destinationChain) onlyValidToken(token) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(msg.value >= supportedChains[destinationChain].transferFee, "Insufficient fee");

        // Check daily transfer limits
        uint256 today = block.timestamp / 86400;
        require(
            dailyTransferAmounts[msg.sender][today] + amount <= supportedChains[destinationChain].dailyTransferLimit,
            "Daily limit exceeded"
        );

        // Check maximum transfer amount
        require(amount <= supportedChains[destinationChain].maxTransferAmount, "Amount exceeds maximum");

        bytes32 transferId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            currentChainId,
            destinationChain,
            token,
            amount,
            block.timestamp,
            transferNonces[keccak256(abi.encodePacked(msg.sender, token))]++
        ));

        // Lock tokens on source chain
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        bridgeTransfers[transferId] = BridgeTransfer({
            transferId: transferId,
            sender: msg.sender,
            recipient: recipient,
            sourceChain: currentChainId,
            destinationChain: destinationChain,
            token: token,
            amount: amount,
            authenticityHash: authenticityHash,
            timestamp: block.timestamp,
            status: TransferStatus.PENDING,
            confirmations: 0,
            signatures: ""
        });

        // Update daily transfer amount
        dailyTransferAmounts[msg.sender][today] += amount;

        // Add to bridge fee pool
        bridgeFeePool += msg.value;

        emit TransferInitiated(
            transferId,
            msg.sender,
            recipient,
            currentChainId,
            destinationChain,
            token,
            amount,
            authenticityHash
        );
    }

    /**
     * @dev Confirm cross-chain transfer (validators only)
     */
    function confirmTransfer(
        bytes32 transferId,
        bytes calldata signature
    ) external onlyActiveValidator {
        BridgeTransfer storage transfer = bridgeTransfers[transferId];
        require(transfer.status == TransferStatus.PENDING, "Transfer not pending");
        require(block.timestamp <= transfer.timestamp + 86400, "Transfer expired"); // 24 hour expiry

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            transferId,
            transfer.sender,
            transfer.recipient,
            transfer.sourceChain,
            transfer.destinationChain,
            transfer.token,
            transfer.amount
        )).toEthSignedMessageHash();

        require(messageHash.recover(signature) == msg.sender, "Invalid signature");

        transfer.confirmations++;
        transfer.signatures = abi.encodePacked(transfer.signatures, signature);

        emit TransferConfirmed(transferId, transfer.confirmations, msg.sender);

        // Execute transfer if minimum confirmations reached
        if (transfer.confirmations >= minimumValidators) {
            transfer.status = TransferStatus.CONFIRMED;
            _executeTransfer(transferId);
        }
    }

    /**
     * @dev Execute confirmed transfer on destination chain
     */
    function _executeTransfer(bytes32 transferId) internal {
        BridgeTransfer storage transfer = bridgeTransfers[transferId];
        require(transfer.status == TransferStatus.CONFIRMED, "Transfer not confirmed");

        try this._safeExecuteTransfer(transferId) {
            transfer.status = TransferStatus.EXECUTED;
            emit TransferExecuted(
                transferId,
                transfer.recipient,
                transfer.amount,
                transfer.destinationChain
            );
        } catch (bytes memory reason) {
            transfer.status = TransferStatus.FAILED;
            emit TransferFailed(transferId, string(reason));
            
            // Initiate refund process
            _initiateRefund(transferId);
        }
    }

    /**
     * @dev Safe transfer execution with error handling
     */
    function _safeExecuteTransfer(bytes32 transferId) external {
        require(msg.sender == address(this), "Internal function");
        BridgeTransfer storage transfer = bridgeTransfers[transferId];
        
        if (transfer.destinationChain == currentChainId) {
            // Release tokens on destination chain
            IERC20(transfer.token).safeTransfer(transfer.recipient, transfer.amount);
        } else {
            // Cross-chain execution - would integrate with destination chain bridge
            revert("Cross-chain execution not implemented in this version");
        }
    }

    /**
     * @dev Synchronize authenticity verification across chains
     */
    function synchronizeVerification(
        bytes32 verificationId,
        uint256 sourceChain,
        string memory productId,
        uint256 authenticityScore,
        bytes32 evidenceHash,
        string memory verificationMethod,
        address verifier,
        uint256[] calldata targetChains
    ) external onlyRole(RELAYER_ROLE) {
        require(sourceChain != currentChainId, "Cannot sync from same chain");
        require(authenticityScore >= 50 && authenticityScore <= 100, "Invalid authenticity score");

        CrossChainVerification storage verification = crossChainVerifications[verificationId];
        
        // Initialize if new verification
        if (verification.timestamp == 0) {
            verification.verificationId = verificationId;
            verification.sourceChain = sourceChain;
            verification.productId = productId;
            verification.authenticityScore = authenticityScore;
            verification.evidenceHash = evidenceHash;
            verification.verificationMethod = verificationMethod;
            verification.verifier = verifier;
            verification.timestamp = block.timestamp;
            verification.synchronized = false;
        }

        // Mark synchronization status for target chains
        for (uint256 i = 0; i < targetChains.length; i++) {
            uint256 targetChain = targetChains[i];
            if (supportedChains[targetChain].active) {
                verification.chainSyncStatus[targetChain] = true;
                
                emit VerificationSynchronized(
                    verificationId,
                    sourceChain,
                    targetChain,
                    authenticityScore
                );
            }
        }

        verification.synchronized = true;
    }

    /**
     * @dev Add supported blockchain network
     */
    function addSupportedChain(
        uint256 chainId,
        string memory networkName,
        address bridgeContract,
        uint256 confirmationBlocks,
        uint256 transferFee,
        uint256 maxTransferAmount,
        uint256 dailyTransferLimit
    ) external onlyRole(BRIDGE_ADMIN_ROLE) {
        require(!supportedChains[chainId].active, "Chain already supported");
        require(bridgeContract != address(0), "Invalid bridge contract");

        supportedChains[chainId] = ChainConfig({
            chainId: chainId,
            networkName: networkName,
            bridgeContract: bridgeContract,
            confirmationBlocks: confirmationBlocks,
            transferFee: transferFee,
            active: true,
            maxTransferAmount: maxTransferAmount,
            dailyTransferLimit: dailyTransferLimit
        });

        activeChains.push(chainId);

        emit ChainAdded(chainId, networkName, bridgeContract);
    }

    /**
     * @dev Add bridge validator with stake requirement
     */
    function addValidator(address validator, uint256 stake) external onlyRole(BRIDGE_ADMIN_ROLE) {
        require(validator != address(0), "Invalid validator");
        require(stake >= validatorStakeRequired, "Insufficient stake");
        require(!hasRole(VALIDATOR_ROLE, validator), "Already a validator");

        _grantRole(VALIDATOR_ROLE, validator);
        validatorStake[validator] = stake;

        emit ValidatorAdded(validator, stake);
    }

    /**
     * @dev Remove validator and handle stake
     */
    function removeValidator(address validator, string memory reason) external onlyRole(BRIDGE_ADMIN_ROLE) {
        require(hasRole(VALIDATOR_ROLE, validator), "Not a validator");

        _revokeRole(VALIDATOR_ROLE, validator);
        validatorStake[validator] = 0;

        emit ValidatorRemoved(validator, reason);
    }

    /**
     * @dev Add supported token for bridging
     */
    function addSupportedToken(address token) external onlyRole(BRIDGE_ADMIN_ROLE) {
        require(token != address(0), "Invalid token address");
        supportedTokens[token] = true;
    }

    /**
     * @dev Remove supported token
     */
    function removeSupportedToken(address token) external onlyRole(BRIDGE_ADMIN_ROLE) {
        supportedTokens[token] = false;
    }

    /**
     * @dev Emergency pause with reason
     */
    function emergencyPause(string memory reason) external onlyRole(BRIDGE_ADMIN_ROLE) {
        emergencyPauseTime = block.timestamp;
        _pause();
        
        emit EmergencyPause(msg.sender, reason, block.timestamp);
    }

    /**
     * @dev Resume operations after pause
     */
    function resumeOperations() external onlyRole(BRIDGE_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Initiate refund for failed transfer
     */
    function _initiateRefund(bytes32 transferId) internal {
        BridgeTransfer storage transfer = bridgeTransfers[transferId];
        require(transfer.status == TransferStatus.FAILED, "Transfer not failed");

        // Refund locked tokens
        IERC20(transfer.token).safeTransfer(transfer.sender, transfer.amount);
        transfer.status = TransferStatus.REFUNDED;
    }

    /**
     * @dev Manual refund for expired transfers
     */
    function refundExpiredTransfer(bytes32 transferId) external nonReentrant {
        BridgeTransfer storage transfer = bridgeTransfers[transferId];
        require(transfer.sender == msg.sender || hasRole(BRIDGE_ADMIN_ROLE, msg.sender), "Unauthorized");
        require(transfer.status == TransferStatus.PENDING, "Transfer not pending");
        require(block.timestamp > transfer.timestamp + 172800, "Transfer not expired"); // 48 hours

        // Refund locked tokens
        IERC20(transfer.token).safeTransfer(transfer.sender, transfer.amount);
        transfer.status = TransferStatus.REFUNDED;
    }

    /**
     * @dev Withdraw bridge fees (admin only)
     */
    function withdrawBridgeFees(uint256 amount, address to) external onlyRole(BRIDGE_ADMIN_ROLE) {
        require(amount <= bridgeFeePool, "Insufficient fee pool");
        require(to != address(0), "Invalid recipient");

        bridgeFeePool -= amount;
        payable(to).transfer(amount);
    }

    /**
     * @dev Get transfer details
     */
    function getTransfer(bytes32 transferId) external view returns (BridgeTransfer memory) {
        return bridgeTransfers[transferId];
    }

    /**
     * @dev Get verification sync status
     */
    function getVerificationSyncStatus(bytes32 verificationId, uint256 chainId) external view returns (bool) {
        return crossChainVerifications[verificationId].chainSyncStatus[chainId];
    }

    /**
     * @dev Get supported chains
     */
    function getSupportedChains() external view returns (uint256[] memory) {
        return activeChains;
    }

    /**
     * @dev Get chain configuration
     */
    function getChainConfig(uint256 chainId) external view returns (ChainConfig memory) {
        return supportedChains[chainId];
    }

    /**
     * @dev Check if token is supported
     */
    function isTokenSupported(address token) external view returns (bool) {
        return supportedTokens[token];
    }

    /**
     * @dev Emergency withdrawal function
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > emergencyPauseTime + 7 days, "Emergency period not elapsed");
        
        if (token == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
    }

    receive() external payable {
        bridgeFeePool += msg.value;
    }
}