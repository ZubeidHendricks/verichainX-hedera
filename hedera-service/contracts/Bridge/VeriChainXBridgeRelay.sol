// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VeriChainXCrossChainBridge.sol";

/**
 * @title VeriChainXBridgeRelay
 * @dev Relay contract for cross-chain message passing and verification synchronization
 * Handles the coordination between different blockchain networks for VeriChainX
 */
contract VeriChainXBridgeRelay is AccessControl, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    bytes32 public constant RELAY_ADMIN_ROLE = keccak256("RELAY_ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    // Cross-chain message structure
    struct CrossChainMessage {
        bytes32 messageId;
        uint256 sourceChain;
        uint256 destinationChain;
        address sender;
        bytes payload;
        uint256 timestamp;
        MessageType messageType;
        MessageStatus status;
        uint256 confirmations;
        bytes[] signatures;
    }

    // Verification relay data
    struct VerificationRelay {
        bytes32 verificationId;
        uint256 sourceChain;
        string productId;
        uint256 authenticityScore;
        bytes32 evidenceHash;
        string verificationMethod;
        address verifier;
        uint256 timestamp;
        mapping(uint256 => bool) relayedToChain;
        uint256 relayCount;
    }

    // Bridge state synchronization
    struct BridgeState {
        uint256 chainId;
        uint256 lastSyncBlock;
        bytes32 stateRoot;
        uint256 totalTransfers;
        uint256 totalVolume;
        bool synchronized;
        uint256 lastUpdateTime;
    }

    enum MessageType {
        VERIFICATION_SYNC,
        BRIDGE_TRANSFER,
        STATE_UPDATE,
        GOVERNANCE_PROPOSAL
    }

    enum MessageStatus {
        PENDING,
        CONFIRMED,
        EXECUTED,
        FAILED
    }

    // State variables
    VeriChainXCrossChainBridge public immutable bridge;
    
    mapping(bytes32 => CrossChainMessage) public messages;
    mapping(bytes32 => VerificationRelay) public verificationRelays;
    mapping(uint256 => BridgeState) public bridgeStates;
    mapping(address => mapping(uint256 => bool)) public oracleVoted;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmed;
    
    uint256 public requiredConfirmations = 2;
    uint256 public messageTimeout = 86400; // 24 hours
    uint256 public relayFee = 0.01 ether;
    uint256 public totalRelayedMessages;
    uint256 public totalRelayedVerifications;

    // Events
    event MessageRelay(
        bytes32 indexed messageId,
        uint256 indexed sourceChain,
        uint256 indexed destinationChain,
        MessageType messageType,
        address sender
    );
    
    event MessageConfirmed(
        bytes32 indexed messageId,
        address indexed oracle,
        uint256 confirmations
    );
    
    event MessageExecuted(
        bytes32 indexed messageId,
        uint256 indexed destinationChain,
        bool success
    );
    
    event VerificationRelayed(
        bytes32 indexed verificationId,
        uint256 indexed sourceChain,
        uint256 indexed destinationChain,
        uint256 authenticityScore
    );
    
    event StateSync(
        uint256 indexed chainId,
        bytes32 stateRoot,
        uint256 blockNumber
    );
    
    event OracleAdded(
        address indexed oracle,
        uint256 indexed chainId
    );
    
    event RelayConfigUpdated(
        uint256 requiredConfirmations,
        uint256 messageTimeout,
        uint256 relayFee
    );

    modifier onlyOracle() {
        require(hasRole(ORACLE_ROLE, msg.sender), "Not an oracle");
        _;
    }

    modifier onlyBridge() {
        require(hasRole(BRIDGE_ROLE, msg.sender), "Not authorized bridge");
        _;
    }

    modifier validChain(uint256 chainId) {
        require(bridgeStates[chainId].synchronized, "Chain not synchronized");
        _;
    }

    constructor(
        address admin,
        address bridgeContract
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAY_ADMIN_ROLE, admin);
        
        bridge = VeriChainXCrossChainBridge(payable(bridgeContract));
        _grantRole(BRIDGE_ROLE, bridgeContract);
    }

    /**
     * @dev Relay cross-chain message
     */
    function relayMessage(
        uint256 destinationChain,
        bytes calldata payload,
        MessageType messageType
    ) external payable nonReentrant whenNotPaused validChain(destinationChain) returns (bytes32 messageId) {
        require(msg.value >= relayFee, "Insufficient relay fee");
        require(payload.length > 0, "Empty payload");

        messageId = keccak256(abi.encodePacked(
            block.chainid,
            destinationChain,
            msg.sender,
            payload,
            block.timestamp,
            totalRelayedMessages++
        ));

        messages[messageId] = CrossChainMessage({
            messageId: messageId,
            sourceChain: block.chainid,
            destinationChain: destinationChain,
            sender: msg.sender,
            payload: payload,
            timestamp: block.timestamp,
            messageType: messageType,
            status: MessageStatus.PENDING,
            confirmations: 0,
            signatures: new bytes[](0)
        });

        emit MessageRelay(messageId, block.chainid, destinationChain, messageType, msg.sender);

        return messageId;
    }

    /**
     * @dev Confirm cross-chain message (oracles only)
     */
    function confirmMessage(
        bytes32 messageId,
        bytes calldata signature
    ) external onlyOracle {
        CrossChainMessage storage message = messages[messageId];
        require(message.status == MessageStatus.PENDING, "Message not pending");
        require(block.timestamp <= message.timestamp + messageTimeout, "Message expired");
        require(!hasConfirmed[messageId][msg.sender], "Already confirmed");

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            message.messageId,
            message.sourceChain,
            message.destinationChain,
            message.sender,
            message.payload
        )).toEthSignedMessageHash();

        require(messageHash.recover(signature) == msg.sender, "Invalid signature");

        hasConfirmed[messageId][msg.sender] = true;
        message.confirmations++;
        message.signatures.push(signature);

        emit MessageConfirmed(messageId, msg.sender, message.confirmations);

        // Execute message if minimum confirmations reached
        if (message.confirmations >= requiredConfirmations) {
            message.status = MessageStatus.CONFIRMED;
            _executeMessage(messageId);
        }
    }

    /**
     * @dev Execute confirmed message
     */
    function _executeMessage(bytes32 messageId) internal {
        CrossChainMessage storage message = messages[messageId];
        require(message.status == MessageStatus.CONFIRMED, "Message not confirmed");

        bool success = false;
        
        try this._safeExecuteMessage(messageId) {
            success = true;
            message.status = MessageStatus.EXECUTED;
        } catch {
            message.status = MessageStatus.FAILED;
        }

        emit MessageExecuted(messageId, message.destinationChain, success);
    }

    /**
     * @dev Safe message execution
     */
    function _safeExecuteMessage(bytes32 messageId) external {
        require(msg.sender == address(this), "Internal function");
        CrossChainMessage storage message = messages[messageId];

        if (message.messageType == MessageType.VERIFICATION_SYNC) {
            _handleVerificationSync(message.payload);
        } else if (message.messageType == MessageType.BRIDGE_TRANSFER) {
            _handleBridgeTransfer(message.payload);
        } else if (message.messageType == MessageType.STATE_UPDATE) {
            _handleStateUpdate(message.payload);
        } else if (message.messageType == MessageType.GOVERNANCE_PROPOSAL) {
            _handleGovernanceProposal(message.payload);
        }
    }

    /**
     * @dev Handle verification synchronization
     */
    function _handleVerificationSync(bytes memory payload) internal {
        (
            bytes32 verificationId,
            uint256 sourceChain,
            string memory productId,
            uint256 authenticityScore,
            bytes32 evidenceHash,
            string memory verificationMethod,
            address verifier,
            uint256 timestamp
        ) = abi.decode(payload, (bytes32, uint256, string, uint256, bytes32, string, address, uint256));

        VerificationRelay storage relay = verificationRelays[verificationId];
        
        // Initialize if new
        if (relay.timestamp == 0) {
            relay.verificationId = verificationId;
            relay.sourceChain = sourceChain;
            relay.productId = productId;
            relay.authenticityScore = authenticityScore;
            relay.evidenceHash = evidenceHash;
            relay.verificationMethod = verificationMethod;
            relay.verifier = verifier;
            relay.timestamp = timestamp;
        }

        relay.relayedToChain[block.chainid] = true;
        relay.relayCount++;
        totalRelayedVerifications++;

        emit VerificationRelayed(verificationId, sourceChain, block.chainid, authenticityScore);
    }

    /**
     * @dev Handle bridge transfer coordination
     */
    function _handleBridgeTransfer(bytes memory payload) internal {
        (
            bytes32 transferId,
            address sender,
            address recipient,
            uint256 amount,
            address token
        ) = abi.decode(payload, (bytes32, address, address, uint256, address));

        // Coordinate with bridge contract
        // Implementation would depend on specific bridge logic
        // This is a placeholder for bridge transfer handling
    }

    /**
     * @dev Handle state synchronization
     */
    function _handleStateUpdate(bytes memory payload) internal {
        (
            uint256 chainId,
            bytes32 stateRoot,
            uint256 blockNumber,
            uint256 totalTransfers,
            uint256 totalVolume
        ) = abi.decode(payload, (uint256, bytes32, uint256, uint256, uint256));

        BridgeState storage state = bridgeStates[chainId];
        state.chainId = chainId;
        state.lastSyncBlock = blockNumber;
        state.stateRoot = stateRoot;
        state.totalTransfers = totalTransfers;
        state.totalVolume = totalVolume;
        state.synchronized = true;
        state.lastUpdateTime = block.timestamp;

        emit StateSync(chainId, stateRoot, blockNumber);
    }

    /**
     * @dev Handle governance proposal
     */
    function _handleGovernanceProposal(bytes memory payload) internal {
        // Decode governance proposal data
        // Implementation depends on governance structure
        // This is a placeholder for governance message handling
    }

    /**
     * @dev Relay verification to multiple chains
     */
    function relayVerificationToChains(
        bytes32 verificationId,
        uint256 sourceChain,
        string memory productId,
        uint256 authenticityScore,
        bytes32 evidenceHash,
        string memory verificationMethod,
        address verifier,
        uint256[] calldata targetChains
    ) external onlyBridge nonReentrant {
        require(targetChains.length > 0, "No target chains specified");
        require(authenticityScore >= 50 && authenticityScore <= 100, "Invalid authenticity score");

        bytes memory payload = abi.encode(
            verificationId,
            sourceChain,
            productId,
            authenticityScore,
            evidenceHash,
            verificationMethod,
            verifier,
            block.timestamp
        );

        for (uint256 i = 0; i < targetChains.length; i++) {
            uint256 targetChain = targetChains[i];
            if (bridgeStates[targetChain].synchronized && targetChain != block.chainid) {
                bytes32 messageId = this.relayMessage{value: relayFee}(
                    targetChain,
                    payload,
                    MessageType.VERIFICATION_SYNC
                );

                emit VerificationRelayed(verificationId, sourceChain, targetChain, authenticityScore);
            }
        }
    }

    /**
     * @dev Synchronize bridge state
     */
    function syncBridgeState(
        uint256 chainId,
        bytes32 stateRoot,
        uint256 blockNumber,
        uint256 totalTransfers,
        uint256 totalVolume
    ) external onlyOracle {
        require(chainId != block.chainid, "Cannot sync own chain");

        BridgeState storage state = bridgeStates[chainId];
        require(blockNumber > state.lastSyncBlock, "Stale state");

        state.chainId = chainId;
        state.lastSyncBlock = blockNumber;
        state.stateRoot = stateRoot;
        state.totalTransfers = totalTransfers;
        state.totalVolume = totalVolume;
        state.synchronized = true;
        state.lastUpdateTime = block.timestamp;

        emit StateSync(chainId, stateRoot, blockNumber);
    }

    /**
     * @dev Add oracle for specific chain
     */
    function addOracle(address oracle, uint256 chainId) external onlyRole(RELAY_ADMIN_ROLE) {
        require(oracle != address(0), "Invalid oracle");
        _grantRole(ORACLE_ROLE, oracle);
        
        emit OracleAdded(oracle, chainId);
    }

    /**
     * @dev Update relay configuration
     */
    function updateRelayConfig(
        uint256 _requiredConfirmations,
        uint256 _messageTimeout,
        uint256 _relayFee
    ) external onlyRole(RELAY_ADMIN_ROLE) {
        require(_requiredConfirmations > 0, "Invalid confirmations");
        require(_messageTimeout > 3600, "Timeout too short"); // Minimum 1 hour

        requiredConfirmations = _requiredConfirmations;
        messageTimeout = _messageTimeout;
        relayFee = _relayFee;

        emit RelayConfigUpdated(_requiredConfirmations, _messageTimeout, _relayFee);
    }

    /**
     * @dev Initialize chain for synchronization
     */
    function initializeChain(
        uint256 chainId,
        bytes32 initialStateRoot
    ) external onlyRole(RELAY_ADMIN_ROLE) {
        require(chainId != block.chainid, "Cannot initialize own chain");
        require(!bridgeStates[chainId].synchronized, "Chain already initialized");

        bridgeStates[chainId] = BridgeState({
            chainId: chainId,
            lastSyncBlock: 0,
            stateRoot: initialStateRoot,
            totalTransfers: 0,
            totalVolume: 0,
            synchronized: true,
            lastUpdateTime: block.timestamp
        });
    }

    /**
     * @dev Get message details
     */
    function getMessage(bytes32 messageId) external view returns (CrossChainMessage memory) {
        return messages[messageId];
    }

    /**
     * @dev Get verification relay status
     */
    function getVerificationRelay(bytes32 verificationId) external view returns (
        bytes32,
        uint256,
        string memory,
        uint256,
        bytes32,
        string memory,
        address,
        uint256,
        uint256
    ) {
        VerificationRelay storage relay = verificationRelays[verificationId];
        return (
            relay.verificationId,
            relay.sourceChain,
            relay.productId,
            relay.authenticityScore,
            relay.evidenceHash,
            relay.verificationMethod,
            relay.verifier,
            relay.timestamp,
            relay.relayCount
        );
    }

    /**
     * @dev Check if verification was relayed to chain
     */
    function isVerificationRelayed(bytes32 verificationId, uint256 chainId) external view returns (bool) {
        return verificationRelays[verificationId].relayedToChain[chainId];
    }

    /**
     * @dev Get bridge state
     */
    function getBridgeState(uint256 chainId) external view returns (BridgeState memory) {
        return bridgeStates[chainId];
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(RELAY_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyRole(RELAY_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Withdraw relay fees
     */
    function withdrawRelayFees(uint256 amount, address to) external onlyRole(RELAY_ADMIN_ROLE) {
        require(to != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient balance");
        
        payable(to).transfer(amount);
    }

    receive() external payable {}
}