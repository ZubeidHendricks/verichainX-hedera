// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./AMM/VeriChainXAuthenticityToken.sol";

/**
 * @title VeriChainXGovernance
 * @dev Advanced governance system with proposal creation, voting, execution, and treasury management
 * Features quadratic voting, delegation, and multi-signature execution for critical proposals
 */
contract VeriChainXGovernance is 
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl,
    AccessControl,
    ReentrancyGuard
{
    using Math for uint256;

    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Proposal categories and their requirements
    enum ProposalCategory {
        STANDARD,           // Regular proposals
        TREASURY,           // Treasury spending
        PARAMETER_CHANGE,   // Protocol parameter changes
        EMERGENCY,          // Emergency proposals
        UPGRADE,            // Contract upgrades
        PARTNERSHIP         // Strategic partnerships
    }

    struct ProposalMetadata {
        ProposalCategory category;
        string title;
        string description;
        string discussionUrl;
        uint256 requiredQuorum;
        uint256 requiredSupport;
        bool isEmergency;
        uint256 treasuryAmount;
        address treasuryRecipient;
        bytes32[] tags;
    }

    struct VotingStrategy {
        bool quadraticVoting;       // Enable quadratic voting
        bool delegatedVoting;       // Enable vote delegation
        uint256 minimumVotingPower; // Minimum tokens to vote
        uint256 votingBonus;        // Bonus for early voters
        uint256 reputationWeight;   // Reputation system weight
    }

    struct DelegationInfo {
        address delegate;
        uint256 delegatedVotes;
        uint256 delegationTime;
        bool active;
    }

    struct VoterInfo {
        uint256 reputationScore;
        uint256 totalProposalsCreated;
        uint256 totalVotesCast;
        uint256 successfulProposals;
        uint256 lastParticipationTime;
        bool isVerifiedExpert;
        string[] expertiseAreas;
    }

    // Core mappings
    mapping(uint256 => ProposalMetadata) public proposalMetadata;
    mapping(uint256 => VotingStrategy) public proposalVotingStrategy;
    mapping(address => DelegationInfo) public delegations;
    mapping(address => VoterInfo) public voterInfo;
    mapping(uint256 => mapping(address => uint256)) public proposalVotingPower;
    mapping(uint256 => uint256) public proposalVotingDeadlineExtensions;

    // Reputation and expertise tracking
    mapping(address => mapping(string => uint256)) public expertiseScores;
    mapping(string => address[]) public expertsByArea;
    string[] public expertiseAreas;

    // Treasury management
    address public treasury;
    uint256 public treasuryBalance;
    uint256 public maxTreasurySpendPerProposal;
    mapping(uint256 => bool) public treasuryProposals;

    // Multi-signature requirements
    mapping(uint256 => address[]) public requiredSigners;
    mapping(uint256 => mapping(address => bool)) public proposalSignatures;
    mapping(uint256 => uint256) public signatureCount;

    // Proposal incentives and rewards
    uint256 public proposalReward = 100 * 10**18;  // 100 tokens
    uint256 public votingReward = 10 * 10**18;     // 10 tokens
    uint256 public expertBonusMultiplier = 150;    // 1.5x for experts

    VeriChainXAuthenticityToken public immutable veriToken;

    event ProposalCreatedWithMetadata(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalCategory category,
        string title,
        string description
    );

    event VoteCastWithPower(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 support,
        uint256 votingPower,
        uint256 actualWeight,
        bool isQuadratic
    );

    event DelegationChanged(
        address indexed delegator,
        address indexed fromDelegate,
        address indexed toDelegate,
        uint256 amount
    );

    event ExpertiseUpdated(
        address indexed expert,
        string area,
        uint256 newScore,
        bool verified
    );

    event TreasurySpendingProposed(
        uint256 indexed proposalId,
        uint256 amount,
        address recipient,
        string purpose
    );

    event MultiSigRequirement(
        uint256 indexed proposalId,
        address[] signers,
        uint256 required
    );

    modifier onlyValidProposal(uint256 proposalId) {
        require(state(proposalId) != ProposalState.Pending, "Proposal does not exist");
        _;
    }

    modifier onlyActiveProposal(uint256 proposalId) {
        require(state(proposalId) == ProposalState.Active, "Proposal not active");
        _;
    }

    constructor(
        VeriChainXAuthenticityToken _token,
        TimelockController _timelock,
        address _treasury,
        uint256 _votingDelay,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage
    )
        Governor("VeriChainXGovernance")
        GovernorSettings(_votingDelay, _votingPeriod, _proposalThreshold)
        GovernorVotes(IVotes(_token))
        GovernorVotesQuorumFraction(_quorumPercentage)
        GovernorTimelockControl(_timelock)
    {
        veriToken = _token;
        treasury = _treasury;
        treasuryBalance = 0;
        maxTreasurySpendPerProposal = 1000000 * 10**18; // 1M tokens max per proposal

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(PROPOSER_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);

        // Initialize expertise areas
        expertiseAreas.push("Security");
        expertiseAreas.push("DeFi");
        expertiseAreas.push("TokenEconomics");
        expertiseAreas.push("ProductAuthenticity");
        expertiseAreas.push("ChainInteroperability");
        expertiseAreas.push("GovernanceDesign");
    }

    /**
     * @dev Create proposal with detailed metadata and category
     */
    function proposeWithMetadata(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalCategory category,
        string memory title,
        string memory discussionUrl,
        bytes32[] memory tags,
        bool enableQuadraticVoting,
        uint256 treasuryAmount,
        address treasuryRecipient
    ) public returns (uint256 proposalId) {
        // Create standard proposal
        proposalId = propose(targets, values, calldatas, description);

        // Validate treasury amount
        if (treasuryAmount > 0) {
            require(treasuryAmount <= maxTreasurySpendPerProposal, "Treasury amount too high");
            require(treasuryRecipient != address(0), "Invalid treasury recipient");
            treasuryProposals[proposalId] = true;
        }

        // Set proposal metadata
        proposalMetadata[proposalId] = ProposalMetadata({
            category: category,
            title: title,
            description: description,
            discussionUrl: discussionUrl,
            requiredQuorum: _getQuorumForCategory(category),
            requiredSupport: _getSupportRequiredForCategory(category),
            isEmergency: category == ProposalCategory.EMERGENCY,
            treasuryAmount: treasuryAmount,
            treasuryRecipient: treasuryRecipient,
            tags: tags
        });

        // Set voting strategy
        proposalVotingStrategy[proposalId] = VotingStrategy({
            quadraticVoting: enableQuadraticVoting,
            delegatedVoting: true,
            minimumVotingPower: 100 * 10**18, // 100 tokens minimum
            votingBonus: category == ProposalCategory.EMERGENCY ? 120 : 110, // 20% or 10% bonus
            reputationWeight: 150 // 1.5x weight for reputation
        });

        // Update proposer reputation
        VoterInfo storage proposer = voterInfo[msg.sender];
        proposer.totalProposalsCreated++;
        proposer.lastParticipationTime = block.timestamp;

        // Reward proposal creation
        if (proposalReward > 0) {
            _distributeReward(msg.sender, proposalReward);
        }

        emit ProposalCreatedWithMetadata(proposalId, msg.sender, category, title, description);
    }

    /**
     * @dev Enhanced vote casting with quadratic voting, reputation and delegation.
     * Overrides Governor._castVote so every vote entrypoint (castVote,
     * castVoteWithReason, castVoteWithReasonAndParams, castVoteBySig) runs this logic.
     */
    function _castVote(
        uint256 proposalId,
        address voter,
        uint8 support,
        string memory reason,
        bytes memory params
    ) internal override(Governor) onlyActiveProposal(proposalId) returns (uint256) {
        VotingStrategy memory strategy = proposalVotingStrategy[proposalId];
        
        // Get base voting power
        uint256 baseVotingPower = _getVotes(voter, proposalSnapshot(proposalId), "");
        require(baseVotingPower >= strategy.minimumVotingPower, "Insufficient voting power");

        // Apply quadratic voting if enabled
        uint256 actualVotingWeight = strategy.quadraticVoting ? 
            _calculateQuadraticWeight(baseVotingPower) : baseVotingPower;

        // Apply reputation bonus
        VoterInfo memory voterData = voterInfo[voter];
        if (voterData.reputationScore > 0) {
            actualVotingWeight = (actualVotingWeight * strategy.reputationWeight) / 100;
        }

        // Apply expertise bonus for relevant proposals
        ProposalMetadata memory metadata = proposalMetadata[proposalId];
        if (_hasRelevantExpertise(voter, metadata.category)) {
            actualVotingWeight = (actualVotingWeight * expertBonusMultiplier) / 100;
        }

        // Apply early voting bonus
        if (_isEarlyVoting(proposalId)) {
            actualVotingWeight = (actualVotingWeight * strategy.votingBonus) / 100;
        }

        // Store voting power for this proposal
        proposalVotingPower[proposalId][voter] = actualVotingWeight;

        // Update voter reputation
        _updateVoterReputation(voter, proposalId, support);

        // Distribute voting rewards
        if (votingReward > 0) {
            uint256 reward = voterData.isVerifiedExpert ? 
                (votingReward * expertBonusMultiplier) / 100 : votingReward;
            _distributeReward(voter, reward);
        }

        emit VoteCastWithPower(
            proposalId, 
            voter, 
            support, 
            baseVotingPower, 
            actualVotingWeight, 
            strategy.quadraticVoting
        );

        return super._castVote(proposalId, voter, support, reason, params);
    }

    /**
     * @dev Delegate votes to another address
     */
    function delegateVotes(address delegate, uint256 amount) external {
        require(delegate != address(0) && delegate != msg.sender, "Invalid delegate");
        require(amount > 0, "Cannot delegate 0 votes");

        address currentDelegate = delegations[msg.sender].delegate;
        
        // Remove previous delegation
        if (currentDelegate != address(0)) {
            delegations[currentDelegate].delegatedVotes -= delegations[msg.sender].delegatedVotes;
        }

        // Set new delegation
        delegations[msg.sender] = DelegationInfo({
            delegate: delegate,
            delegatedVotes: amount,
            delegationTime: block.timestamp,
            active: true
        });

        delegations[delegate].delegatedVotes += amount;

        emit DelegationChanged(msg.sender, currentDelegate, delegate, amount);
    }

    /**
     * @dev Remove delegation
     */
    function removeDelegation() external {
        address currentDelegate = delegations[msg.sender].delegate;
        require(currentDelegate != address(0), "No active delegation");

        uint256 delegatedAmount = delegations[msg.sender].delegatedVotes;
        delegations[currentDelegate].delegatedVotes -= delegatedAmount;
        
        delete delegations[msg.sender];

        emit DelegationChanged(msg.sender, currentDelegate, address(0), 0);
    }

    /**
     * @dev Add expertise area for a user
     */
    function addExpertise(
        address expert,
        string memory area,
        uint256 score,
        bool verified
    ) external onlyRole(ADMIN_ROLE) {
        require(score <= 1000, "Score too high"); // Max 1000 expertise score
        
        expertiseScores[expert][area] = score;
        voterInfo[expert].isVerifiedExpert = verified;
        
        // Add to expertise area if not present
        bool areaExists = false;
        for (uint256 i = 0; i < expertsByArea[area].length; i++) {
            if (expertsByArea[area][i] == expert) {
                areaExists = true;
                break;
            }
        }
        
        if (!areaExists) {
            expertsByArea[area].push(expert);
        }

        emit ExpertiseUpdated(expert, area, score, verified);
    }

    /**
     * @dev Create emergency proposal with multi-sig requirement
     */
    function createEmergencyProposal(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        address[] memory requiredSigners_
    ) external onlyRole(EMERGENCY_ROLE) returns (uint256 proposalId) {
        proposalId = proposeWithMetadata(
            targets,
            values,
            calldatas,
            description,
            ProposalCategory.EMERGENCY,
            "Emergency Proposal",
            "",
            new bytes32[](0),
            false,
            0,
            address(0)
        );

        // Set multi-sig requirement
        requiredSigners[proposalId] = requiredSigners_;
        
        emit MultiSigRequirement(proposalId, requiredSigners_, requiredSigners_.length);
    }

    /**
     * @dev Sign emergency proposal
     */
    function signProposal(uint256 proposalId) external onlyValidProposal(proposalId) {
        require(_isRequiredSigner(proposalId, msg.sender), "Not a required signer");
        require(!proposalSignatures[proposalId][msg.sender], "Already signed");

        proposalSignatures[proposalId][msg.sender] = true;
        signatureCount[proposalId]++;
    }

    /**
     * @dev Execute proposal with multi-sig validation
     */
    function execute(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public payable override(Governor, IGovernor) returns (uint256 proposalId) {
        proposalId = hashProposal(targets, values, calldatas, descriptionHash);
        
        // Check multi-sig requirement for emergency proposals
        if (proposalMetadata[proposalId].isEmergency) {
            require(
                signatureCount[proposalId] >= requiredSigners[proposalId].length,
                "Insufficient signatures"
            );
        }

        // Handle treasury spending
        if (treasuryProposals[proposalId]) {
            _executeTreasurySpending(proposalId);
        }

        return super.execute(targets, values, calldatas, descriptionHash);
    }

    /**
     * @dev Calculate quadratic weight for voting
     */
    function _calculateQuadraticWeight(uint256 tokenAmount) internal pure returns (uint256) {
        // Quadratic voting: weight = sqrt(tokens) * scaling factor
        return Math.sqrt(tokenAmount) * 1000; // Scaling factor for precision
    }

    /**
     * @dev Check if voter has relevant expertise
     */
    function _hasRelevantExpertise(address voter, ProposalCategory category) internal view returns (bool) {
        if (category == ProposalCategory.TREASURY) {
            return expertiseScores[voter]["TokenEconomics"] > 500;
        } else if (category == ProposalCategory.EMERGENCY) {
            return expertiseScores[voter]["Security"] > 700;
        } else if (category == ProposalCategory.UPGRADE) {
            return expertiseScores[voter]["Security"] > 500 || 
                   expertiseScores[voter]["DeFi"] > 500;
        }
        return false;
    }

    /**
     * @dev Check if voting is in early period
     */
    function _isEarlyVoting(uint256 proposalId) internal view returns (bool) {
        uint256 voteStart = proposalSnapshot(proposalId);
        uint256 earlyPeriod = votingPeriod() / 3; // First third of voting period
        return block.number <= voteStart + earlyPeriod;
    }

    /**
     * @dev Update voter reputation based on voting behavior
     */
    function _updateVoterReputation(address voter, uint256 proposalId, uint8 support) internal {
        VoterInfo storage info = voterInfo[voter];
        info.totalVotesCast++;
        info.lastParticipationTime = block.timestamp;
        
        // Reputation increases with participation
        info.reputationScore += 10;
        
        // Bonus for early participation
        if (_isEarlyVoting(proposalId)) {
            info.reputationScore += 5;
        }
        
        // Cap reputation at 10,000
        if (info.reputationScore > 10000) {
            info.reputationScore = 10000;
        }
    }

    /**
     * @dev Get quorum requirement for proposal category
     */
    function _getQuorumForCategory(ProposalCategory category) internal pure returns (uint256) {
        if (category == ProposalCategory.EMERGENCY) return 15; // 15%
        if (category == ProposalCategory.TREASURY) return 25;  // 25%
        if (category == ProposalCategory.UPGRADE) return 30;   // 30%
        return 20; // 20% for standard proposals
    }

    /**
     * @dev Get support requirement for proposal category
     */
    function _getSupportRequiredForCategory(ProposalCategory category) internal pure returns (uint256) {
        if (category == ProposalCategory.EMERGENCY) return 60; // 60%
        if (category == ProposalCategory.TREASURY) return 65;  // 65%
        if (category == ProposalCategory.UPGRADE) return 70;   // 70%
        return 55; // 55% for standard proposals
    }

    /**
     * @dev Check if address is required signer for proposal
     */
    function _isRequiredSigner(uint256 proposalId, address signer) internal view returns (bool) {
        address[] memory signers = requiredSigners[proposalId];
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) return true;
        }
        return false;
    }

    /**
     * @dev Execute treasury spending
     */
    function _executeTreasurySpending(uint256 proposalId) internal {
        ProposalMetadata memory metadata = proposalMetadata[proposalId];
        require(metadata.treasuryAmount > 0, "No treasury amount specified");
        require(treasuryBalance >= metadata.treasuryAmount, "Insufficient treasury balance");

        treasuryBalance -= metadata.treasuryAmount;
        veriToken.transfer(metadata.treasuryRecipient, metadata.treasuryAmount);

        emit TreasurySpendingProposed(
            proposalId,
            metadata.treasuryAmount,
            metadata.treasuryRecipient,
            metadata.description
        );
    }

    /**
     * @dev Distribute rewards to voters and proposers
     */
    function _distributeReward(address recipient, uint256 amount) internal {
        // Mint rewards from the authenticity token contract
        // This would require the governance contract to have minting rights
        // veriToken.mint(recipient, amount);
    }

    /**
     * @dev Add funds to treasury
     */
    function addToTreasury(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(veriToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        treasuryBalance += amount;
    }

    /**
     * @dev Get comprehensive proposal information
     */
    function getProposalInfo(uint256 proposalId) external view returns (
        ProposalMetadata memory metadata,
        VotingStrategy memory strategy,
        ProposalState currentState,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 votesAbstain
    ) {
        metadata = proposalMetadata[proposalId];
        strategy = proposalVotingStrategy[proposalId];
        currentState = state(proposalId);
        (votesAgainst, votesFor, votesAbstain) = proposalVotes(proposalId);
    }

    /**
     * @dev Get voter information and reputation
     */
    function getVoterInfo(address voter) external view returns (VoterInfo memory) {
        return voterInfo[voter];
    }

    /**
     * @dev Get delegation information
     */
    function getDelegationInfo(address delegator) external view returns (DelegationInfo memory) {
        return delegations[delegator];
    }

    /**
     * @dev Override required by multiple inheritance
     */
    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber) public view override(IGovernor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(blockNumber);
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId) public view override(Governor, AccessControl, GovernorTimelockControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}