// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./AMM/VeriChainXAuthenticityToken.sol";

/**
 * @title VeriChainXDAOTreasury
 * @dev Comprehensive DAO Treasury management with multi-asset support, yield strategies, and governance integration
 * Features diversified portfolio management, automated yield farming, and transparent fund allocation
 */
contract VeriChainXDAOTreasury is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");
    bytes32 public constant INVESTMENT_MANAGER_ROLE = keccak256("INVESTMENT_MANAGER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    VeriChainXAuthenticityToken public immutable veriToken;

    // Asset management
    struct AssetInfo {
        address tokenAddress;
        uint256 balance;
        uint256 reservedAmount;      // Reserved for pending proposals
        uint256 yieldEarned;         // Total yield earned
        uint256 lastYieldUpdate;
        uint256 targetAllocation;    // Target percentage (basis points)
        uint256 currentAllocation;   // Current percentage (basis points)
        bool isActive;
        bool isYieldBearing;
        string symbol;
    }

    struct Investment {
        bytes32 investmentId;
        address protocol;            // Investment protocol address
        address asset;              // Asset being invested
        uint256 amount;             // Amount invested
        uint256 expectedAPY;        // Expected annual percentage yield
        uint256 investmentTime;     // Timestamp of investment
        uint256 lockPeriod;         // Lock period in seconds
        uint256 yieldAccrued;       // Yield accrued so far
        bool active;
        string protocolName;
        string strategy;
    }

    struct TreasuryProposal {
        bytes32 proposalId;
        address proposer;
        uint256 amount;
        address recipient;
        address asset;
        string purpose;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 createdAt;
        uint256 executionDeadline;
        bool executed;
        bool cancelled;
        mapping(address => bool) hasVoted;
        mapping(address => uint256) voteWeight;
    }

    struct YieldStrategy {
        bytes32 strategyId;
        string name;
        string description;
        address targetProtocol;
        uint256 minInvestment;
        uint256 maxInvestment;
        uint256 expectedAPY;
        uint256 riskLevel;           // 1-10 scale
        bool active;
        bool autoCompound;
    }

    struct TreasuryMetrics {
        uint256 totalValue;          // Total treasury value in USD equivalent
        uint256 totalYieldEarned;    // All-time yield earned
        uint256 monthlyYield;        // Yield earned this month
        uint256 diversificationScore; // Portfolio diversification (0-100)
        uint256 riskScore;           // Portfolio risk score (1-10)
        uint256 performanceScore;    // Performance vs benchmark (basis points)
    }

    struct RevenueStream {
        bytes32 streamId;
        string source;               // "verification_fees", "staking_rewards", etc.
        uint256 totalCollected;
        uint256 monthlyAverage;
        uint256 lastCollection;
        bool active;
        uint256 allocationPercentage; // Percentage going to treasury
    }

    // Core mappings and arrays
    mapping(address => AssetInfo) public assets;
    address[] public assetList;
    
    mapping(bytes32 => Investment) public investments;
    bytes32[] public investmentList;
    
    mapping(bytes32 => TreasuryProposal) public treasuryProposals;
    bytes32[] public proposalList;
    
    mapping(bytes32 => YieldStrategy) public yieldStrategies;
    bytes32[] public strategyList;
    
    mapping(bytes32 => RevenueStream) public revenueStreams;
    bytes32[] public streamList;

    // Treasury configuration
    uint256 public minProposalAmount = 1000 * 10**18;  // 1,000 tokens minimum
    uint256 public maxProposalAmount = 100000 * 10**18; // 100,000 tokens maximum
    uint256 public proposalExecutionDelay = 86400 * 7;   // 7 days
    uint256 public emergencyReservePercentage = 2000;     // 20% emergency reserve
    uint256 public maxSingleInvestmentPercentage = 1000;  // 10% max single investment
    uint256 public rebalanceThreshold = 500;             // 5% threshold for rebalancing

    // Performance tracking
    TreasuryMetrics public metrics;
    mapping(uint256 => uint256) public monthlyYieldHistory; // month => yield
    mapping(uint256 => uint256) public monthlyVolumeHistory; // month => volume
    uint256 public benchmarkAPY = 500; // 5% benchmark APY

    // Fee collection
    mapping(string => uint256) public collectedFees; // fee_type => amount
    uint256 public totalFeesCollected;
    uint256 public lastFeeDistribution;

    // Governance integration
    address public governanceContract;
    mapping(bytes32 => bool) public governanceApprovedProposals;

    // Events
    event AssetAdded(address indexed asset, string symbol, uint256 targetAllocation);
    event InvestmentMade(bytes32 indexed investmentId, address protocol, uint256 amount, uint256 expectedAPY);
    event YieldHarvested(bytes32 indexed investmentId, uint256 yieldAmount, address asset);
    event TreasuryProposalCreated(bytes32 indexed proposalId, address proposer, uint256 amount, string purpose);
    event TreasuryProposalExecuted(bytes32 indexed proposalId, uint256 amount, address recipient);
    event PortfolioRebalanced(uint256 totalValue, uint256 newDiversificationScore);
    event RevenueCollected(bytes32 indexed streamId, uint256 amount, string source);
    event EmergencyWithdrawal(address indexed asset, uint256 amount, address recipient, string reason);
    event YieldStrategyAdded(bytes32 indexed strategyId, string name, address protocol);
    event TreasuryMetricsUpdated(uint256 totalValue, uint256 monthlyYield, uint256 performanceScore);

    modifier onlyGovernance() {
        require(msg.sender == governanceContract, "Only governance contract");
        _;
    }

    modifier validAsset(address asset) {
        require(assets[asset].isActive, "Asset not supported");
        _;
    }

    modifier validInvestment(bytes32 investmentId) {
        require(investments[investmentId].active, "Investment not active");
        _;
    }

    constructor(
        address _veriToken,
        address _governanceContract,
        address _admin
    ) {
        veriToken = VeriChainXAuthenticityToken(_veriToken);
        governanceContract = _governanceContract;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(TREASURY_MANAGER_ROLE, _admin);
        _grantRole(INVESTMENT_MANAGER_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _governanceContract);
        _grantRole(EMERGENCY_ROLE, _admin);

        _initializeTreasury();
    }

    /**
     * @dev Initialize treasury with default assets and strategies
     */
    function _initializeTreasury() internal {
        // Add VeriChain token as primary asset
        _addAsset(
            address(veriToken),
            4000, // 40% target allocation
            true,
            "VERI"
        );

        // Initialize revenue streams
        _addRevenueStream("verification_fees", "Verification Fees", 5000); // 50% to treasury
        _addRevenueStream("staking_rewards", "Staking Rewards", 2000);     // 20% to treasury
        _addRevenueStream("bridge_fees", "Bridge Fees", 3000);             // 30% to treasury
        _addRevenueStream("governance_fees", "Governance Fees", 10000);    // 100% to treasury

        // Initialize default yield strategies
        _addYieldStrategy(
            "Conservative Staking",
            "Low-risk staking strategy",
            address(0), // To be set later
            1000 * 10**18,  // 1,000 tokens minimum
            10000 * 10**18, // 10,000 tokens maximum
            800,  // 8% APY
            3,    // Risk level 3/10
            true  // Auto-compound
        );
    }

    /**
     * @dev Add supported asset to treasury
     */
    function addAsset(
        address tokenAddress,
        uint256 targetAllocation,
        bool isYieldBearing,
        string memory symbol
    ) external onlyRole(TREASURY_MANAGER_ROLE) {
        _addAsset(tokenAddress, targetAllocation, isYieldBearing, symbol);
    }

    function _addAsset(
        address tokenAddress,
        uint256 targetAllocation,
        bool isYieldBearing,
        string memory symbol
    ) internal {
        require(tokenAddress != address(0), "Invalid token address");
        require(!assets[tokenAddress].isActive, "Asset already added");
        require(targetAllocation <= 10000, "Invalid target allocation");

        assets[tokenAddress] = AssetInfo({
            tokenAddress: tokenAddress,
            balance: 0,
            reservedAmount: 0,
            yieldEarned: 0,
            lastYieldUpdate: block.timestamp,
            targetAllocation: targetAllocation,
            currentAllocation: 0,
            isActive: true,
            isYieldBearing: isYieldBearing,
            symbol: symbol
        });

        assetList.push(tokenAddress);
        emit AssetAdded(tokenAddress, symbol, targetAllocation);
    }

    /**
     * @dev Create investment in yield-bearing protocol
     */
    function createInvestment(
        address protocol,
        address asset,
        uint256 amount,
        uint256 expectedAPY,
        uint256 lockPeriod,
        string memory protocolName,
        string memory strategy
    ) external onlyRole(INVESTMENT_MANAGER_ROLE) validAsset(asset) nonReentrant {
        require(protocol != address(0), "Invalid protocol address");
        require(amount > 0, "Investment amount must be greater than 0");
        require(assets[asset].balance >= amount, "Insufficient asset balance");
        
        // Validate investment doesn't exceed single investment limit
        uint256 totalTreasuryValue = _calculateTotalTreasuryValue();
        uint256 investmentPercentage = (amount * 10000) / totalTreasuryValue;
        require(investmentPercentage <= maxSingleInvestmentPercentage, "Investment too large");

        bytes32 investmentId = keccak256(abi.encodePacked(
            protocol,
            asset,
            amount,
            block.timestamp
        ));

        investments[investmentId] = Investment({
            investmentId: investmentId,
            protocol: protocol,
            asset: asset,
            amount: amount,
            expectedAPY: expectedAPY,
            investmentTime: block.timestamp,
            lockPeriod: lockPeriod,
            yieldAccrued: 0,
            active: true,
            protocolName: protocolName,
            strategy: strategy
        });

        investmentList.push(investmentId);
        assets[asset].balance -= amount;

        // Execute investment (this would integrate with actual DeFi protocols)
        _executeInvestment(investmentId);

        emit InvestmentMade(investmentId, protocol, amount, expectedAPY);
    }

    /**
     * @dev Harvest yield from investment
     */
    function harvestYield(bytes32 investmentId) external validInvestment(investmentId) nonReentrant {
        Investment storage investment = investments[investmentId];
        
        // Calculate accrued yield
        uint256 timeElapsed = block.timestamp - investment.investmentTime;
        uint256 expectedYield = (investment.amount * investment.expectedAPY * timeElapsed) / (365 days * 10000);
        uint256 harvestableYield = expectedYield - investment.yieldAccrued;

        if (harvestableYield > 0) {
            investment.yieldAccrued += harvestableYield;
            assets[investment.asset].balance += harvestableYield;
            assets[investment.asset].yieldEarned += harvestableYield;
            
            metrics.totalYieldEarned += harvestableYield;
            metrics.monthlyYield += harvestableYield;

            emit YieldHarvested(investmentId, harvestableYield, investment.asset);
        }
    }

    /**
     * @dev Create treasury spending proposal
     */
    function createTreasuryProposal(
        uint256 amount,
        address recipient,
        address asset,
        string memory purpose
    ) external returns (bytes32 proposalId) {
        require(amount >= minProposalAmount && amount <= maxProposalAmount, "Invalid proposal amount");
        require(recipient != address(0), "Invalid recipient");
        require(assets[asset].isActive, "Unsupported asset");
        require(assets[asset].balance >= amount, "Insufficient treasury balance");

        proposalId = keccak256(abi.encodePacked(
            msg.sender,
            amount,
            recipient,
            asset,
            purpose,
            block.timestamp
        ));

        TreasuryProposal storage proposal = treasuryProposals[proposalId];
        proposal.proposalId = proposalId;
        proposal.proposer = msg.sender;
        proposal.amount = amount;
        proposal.recipient = recipient;
        proposal.asset = asset;
        proposal.purpose = purpose;
        proposal.createdAt = block.timestamp;
        proposal.executionDeadline = block.timestamp + proposalExecutionDelay;
        proposal.executed = false;
        proposal.cancelled = false;

        proposalList.push(proposalId);
        
        // Reserve funds
        assets[asset].reservedAmount += amount;

        emit TreasuryProposalCreated(proposalId, msg.sender, amount, purpose);
    }

    /**
     * @dev Execute approved treasury proposal
     */
    function executeTreasuryProposal(bytes32 proposalId) external nonReentrant {
        TreasuryProposal storage proposal = treasuryProposals[proposalId];
        require(!proposal.executed && !proposal.cancelled, "Proposal already processed");
        require(block.timestamp >= proposal.executionDeadline, "Execution deadline not reached");
        require(governanceApprovedProposals[proposalId], "Proposal not approved by governance");

        // Execute transfer
        AssetInfo storage asset = assets[proposal.asset];
        require(asset.balance >= proposal.amount, "Insufficient balance");

        asset.balance -= proposal.amount;
        asset.reservedAmount -= proposal.amount;
        
        IERC20(proposal.asset).safeTransfer(proposal.recipient, proposal.amount);
        proposal.executed = true;

        emit TreasuryProposalExecuted(proposalId, proposal.amount, proposal.recipient);
    }

    /**
     * @dev Approve treasury proposal (called by governance)
     */
    function approveTreasuryProposal(bytes32 proposalId) external onlyGovernance {
        require(treasuryProposals[proposalId].proposalId == proposalId, "Proposal does not exist");
        governanceApprovedProposals[proposalId] = true;
    }

    /**
     * @dev Collect revenue from various sources
     */
    function collectRevenue(
        bytes32 streamId,
        uint256 amount,
        address sourceContract
    ) external onlyRole(TREASURY_MANAGER_ROLE) {
        RevenueStream storage stream = revenueStreams[streamId];
        require(stream.active, "Revenue stream not active");
        
        // Calculate treasury allocation
        uint256 treasuryAmount = (amount * stream.allocationPercentage) / 10000;
        
        if (treasuryAmount > 0) {
            // Collect VeriChain tokens to treasury
            veriToken.transferFrom(sourceContract, address(this), treasuryAmount);
            
            assets[address(veriToken)].balance += treasuryAmount;
            stream.totalCollected += treasuryAmount;
            stream.lastCollection = block.timestamp;
            totalFeesCollected += treasuryAmount;

            emit RevenueCollected(streamId, treasuryAmount, stream.source);
        }
    }

    /**
     * @dev Rebalance portfolio to target allocations
     */
    function rebalancePortfolio() external onlyRole(INVESTMENT_MANAGER_ROLE) {
        uint256 totalValue = _calculateTotalTreasuryValue();
        require(totalValue > 0, "No assets to rebalance");

        bool needsRebalancing = false;
        
        // Check if rebalancing is needed
        for (uint256 i = 0; i < assetList.length; i++) {
            address assetAddr = assetList[i];
            AssetInfo storage asset = assets[assetAddr];
            
            if (asset.isActive && asset.balance > 0) {
                uint256 currentAllocation = (asset.balance * 10000) / totalValue;
                uint256 allocationDiff = currentAllocation > asset.targetAllocation ?
                    currentAllocation - asset.targetAllocation :
                    asset.targetAllocation - currentAllocation;
                
                if (allocationDiff > rebalanceThreshold) {
                    needsRebalancing = true;
                    break;
                }
            }
        }

        if (needsRebalancing) {
            _executeRebalancing(totalValue);
            uint256 newDiversificationScore = _calculateDiversificationScore();
            metrics.diversificationScore = newDiversificationScore;
            
            emit PortfolioRebalanced(totalValue, newDiversificationScore);
        }
    }

    /**
     * @dev Update treasury metrics
     */
    function updateTreasuryMetrics() external {
        metrics.totalValue = _calculateTotalTreasuryValue();
        metrics.diversificationScore = _calculateDiversificationScore();
        metrics.riskScore = _calculateRiskScore();
        metrics.performanceScore = _calculatePerformanceScore();
        
        // Update monthly yield tracking
        uint256 currentMonth = block.timestamp / (30 days);
        monthlyYieldHistory[currentMonth] = metrics.monthlyYield;

        emit TreasuryMetricsUpdated(
            metrics.totalValue,
            metrics.monthlyYield,
            metrics.performanceScore
        );
    }

    /**
     * @dev Emergency withdrawal function
     */
    function emergencyWithdraw(
        address asset,
        uint256 amount,
        address recipient,
        string memory reason
    ) external onlyRole(EMERGENCY_ROLE) {
        require(assets[asset].isActive, "Asset not supported");
        require(assets[asset].balance >= amount, "Insufficient balance");
        
        assets[asset].balance -= amount;
        IERC20(asset).safeTransfer(recipient, amount);
        
        emit EmergencyWithdrawal(asset, amount, recipient, reason);
    }

    /**
     * @dev Add new yield strategy
     */
    function _addYieldStrategy(
        string memory name,
        string memory description,
        address targetProtocol,
        uint256 minInvestment,
        uint256 maxInvestment,
        uint256 expectedAPY,
        uint256 riskLevel,
        bool autoCompound
    ) internal {
        bytes32 strategyId = keccak256(abi.encodePacked(name, targetProtocol));
        
        yieldStrategies[strategyId] = YieldStrategy({
            strategyId: strategyId,
            name: name,
            description: description,
            targetProtocol: targetProtocol,
            minInvestment: minInvestment,
            maxInvestment: maxInvestment,
            expectedAPY: expectedAPY,
            riskLevel: riskLevel,
            active: true,
            autoCompound: autoCompound
        });

        strategyList.push(strategyId);
        emit YieldStrategyAdded(strategyId, name, targetProtocol);
    }

    /**
     * @dev Add revenue stream
     */
    function _addRevenueStream(
        string memory streamId,
        string memory source,
        uint256 allocationPercentage
    ) internal {
        bytes32 id = keccak256(abi.encodePacked(streamId));
        
        revenueStreams[id] = RevenueStream({
            streamId: id,
            source: source,
            totalCollected: 0,
            monthlyAverage: 0,
            lastCollection: 0,
            active: true,
            allocationPercentage: allocationPercentage
        });

        streamList.push(id);
    }

    /**
     * @dev Execute investment in external protocol
     */
    function _executeInvestment(bytes32 investmentId) internal {
        // This would integrate with actual DeFi protocols
        // For now, we just mark the investment as active
        Investment storage investment = investments[investmentId];
        require(investment.active, "Investment not active");
        
        // Implementation would depend on specific protocol integration
        // e.g., Compound, Aave, Uniswap LP, etc.
    }

    /**
     * @dev Execute portfolio rebalancing
     */
    function _executeRebalancing(uint256 totalValue) internal {
        // Calculate required adjustments for each asset
        for (uint256 i = 0; i < assetList.length; i++) {
            address assetAddr = assetList[i];
            AssetInfo storage asset = assets[assetAddr];
            
            if (asset.isActive) {
                uint256 targetValue = (totalValue * asset.targetAllocation) / 10000;
                uint256 currentValue = asset.balance;
                
                if (currentValue < targetValue) {
                    // Need to acquire more of this asset
                    uint256 needed = targetValue - currentValue;
                    _acquireAsset(assetAddr, needed);
                } else if (currentValue > targetValue) {
                    // Need to reduce this asset
                    uint256 excess = currentValue - targetValue;
                    _reduceAsset(assetAddr, excess);
                }
                
                asset.currentAllocation = (asset.balance * 10000) / totalValue;
            }
        }
    }

    /**
     * @dev Acquire more of an asset (simplified implementation)
     */
    function _acquireAsset(address asset, uint256 amount) internal {
        // This would involve trading other assets for the target asset
        // Implementation would depend on available DEX integrations
        assets[asset].balance += amount;
    }

    /**
     * @dev Reduce asset holdings (simplified implementation)
     */
    function _reduceAsset(address asset, uint256 amount) internal {
        // This would involve trading the asset for other assets
        // Implementation would depend on available DEX integrations
        if (assets[asset].balance >= amount) {
            assets[asset].balance -= amount;
        }
    }

    /**
     * @dev Calculate total treasury value across all assets
     */
    function _calculateTotalTreasuryValue() internal view returns (uint256) {
        uint256 totalValue = 0;
        
        for (uint256 i = 0; i < assetList.length; i++) {
            address assetAddr = assetList[i];
            if (assets[assetAddr].isActive) {
                totalValue += assets[assetAddr].balance;
            }
        }
        
        return totalValue;
    }

    /**
     * @dev Calculate portfolio diversification score
     */
    function _calculateDiversificationScore() internal view returns (uint256) {
        uint256 totalValue = _calculateTotalTreasuryValue();
        if (totalValue == 0) return 0;
        
        uint256 diversificationScore = 0;
        uint256 activeAssets = 0;
        
        for (uint256 i = 0; i < assetList.length; i++) {
            address assetAddr = assetList[i];
            if (assets[assetAddr].isActive && assets[assetAddr].balance > 0) {
                activeAssets++;
                uint256 allocation = (assets[assetAddr].balance * 10000) / totalValue;
                // Penalize over-concentration
                if (allocation > 5000) { // > 50%
                    diversificationScore += 2000; // Lower score for concentration
                } else {
                    diversificationScore += 10000 / activeAssets; // Reward diversification
                }
            }
        }
        
        return Math.min(diversificationScore, 10000); // Cap at 100%
    }

    /**
     * @dev Calculate portfolio risk score
     */
    function _calculateRiskScore() internal view returns (uint256) {
        uint256 totalValue = _calculateTotalTreasuryValue();
        if (totalValue == 0) return 0;
        
        uint256 weightedRisk = 0;
        
        for (uint256 i = 0; i < investmentList.length; i++) {
            bytes32 investmentId = investmentList[i];
            Investment storage investment = investments[investmentId];
            
            if (investment.active) {
                uint256 weight = (investment.amount * 10000) / totalValue;
                // Use expected APY as risk proxy (higher APY = higher risk)
                uint256 risk = investment.expectedAPY / 100; // Convert to 1-10 scale roughly
                weightedRisk += (weight * risk) / 10000;
            }
        }
        
        return Math.min(weightedRisk, 10); // Cap at risk level 10
    }

    /**
     * @dev Calculate performance score vs benchmark
     */
    function _calculatePerformanceScore() internal view returns (uint256) {
        if (metrics.totalYieldEarned == 0) return 10000; // 100% if no yield yet
        
        uint256 totalValue = _calculateTotalTreasuryValue();
        if (totalValue == 0) return 0;
        
        // Calculate actual APY
        uint256 actualAPY = (metrics.totalYieldEarned * 10000) / totalValue;
        
        // Compare to benchmark
        if (actualAPY >= benchmarkAPY) {
            return 10000 + ((actualAPY - benchmarkAPY) * 100); // Bonus for outperformance
        } else {
            return (actualAPY * 10000) / benchmarkAPY; // Penalty for underperformance
        }
    }

    /**
     * @dev Get comprehensive treasury information
     */
    function getTreasuryInfo() external view returns (
        uint256 totalValue,
        uint256 totalAssets,
        uint256 totalInvestments,
        uint256 monthlyYield,
        uint256 diversificationScore,
        uint256 riskScore
    ) {
        totalValue = _calculateTotalTreasuryValue();
        totalAssets = assetList.length;
        totalInvestments = investmentList.length;
        monthlyYield = metrics.monthlyYield;
        diversificationScore = metrics.diversificationScore;
        riskScore = metrics.riskScore;
    }

    /**
     * @dev Get asset information
     */
    function getAssetInfo(address asset) external view returns (AssetInfo memory) {
        return assets[asset];
    }

    /**
     * @dev Get investment information
     */
    function getInvestmentInfo(bytes32 investmentId) external view returns (Investment memory) {
        return investments[investmentId];
    }

    /**
     * @dev Get all asset addresses
     */
    function getAllAssets() external view returns (address[] memory) {
        return assetList;
    }

    /**
     * @dev Get all investment IDs
     */
    function getAllInvestments() external view returns (bytes32[] memory) {
        return investmentList;
    }

    /**
     * @dev Update governance contract
     */
    function updateGovernanceContract(address newGovernance) external onlyRole(ADMIN_ROLE) {
        require(newGovernance != address(0), "Invalid governance address");
        
        _revokeRole(GOVERNANCE_ROLE, governanceContract);
        _grantRole(GOVERNANCE_ROLE, newGovernance);
        governanceContract = newGovernance;
    }

    /**
     * @dev Pause/unpause treasury operations
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}