// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title VeriChainXAuthenticityToken
 * @dev ERC20 token representing product authenticity value
 * Features dynamic supply based on verification quality and market demand
 */
contract VeriChainXAuthenticityToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes, AccessControl, Pausable {
    using Math for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // Token economics parameters
    struct TokenomicsConfig {
        uint256 maxSupply;              // Maximum token supply
        uint256 baseReward;             // Base reward for verifications
        uint256 qualityMultiplier;      // Multiplier based on verification quality
        uint256 stakingAPY;            // Annual percentage yield for staking
        uint256 burnRate;              // Burn rate for deflation
        uint256 mintingCooldown;       // Cooldown between minting operations
    }

    TokenomicsConfig public config;

    // Product category configuration
    struct CategoryConfig {
        bytes32 category;               // Product category (electronics, luxury, etc.)
        uint256 baseValue;             // Base authenticity value
        uint256 riskMultiplier;        // Risk-based multiplier
        uint256 marketDemand;          // Market demand indicator
        bool active;                   // Category status
    }

    mapping(bytes32 => CategoryConfig) public categories;
    bytes32[] public allCategories;

    // Verification-based minting
    mapping(uint256 => bool) public mintedVerifications; // Track minted verifications
    mapping(address => uint256) public verifierContributions; // Verifier contributions
    mapping(address => uint256) public lastMintTime; // Minting cooldown tracking

    // Staking and rewards
    mapping(address => uint256) public stakedBalances;
    mapping(address => uint256) public stakingRewards;
    mapping(address => uint256) public lastStakeTime;
    uint256 public totalStaked;
    uint256 public rewardPool;

    // Market dynamics
    mapping(bytes32 => uint256) public categoryDemand; // Demand per category
    mapping(bytes32 => uint256) public categorySupply; // Supply per category
    mapping(address => mapping(bytes32 => uint256)) public userCategoryBalance; // User balance per category

    // Governance and voting
    mapping(address => uint256) public votingPower;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;
    mapping(bytes32 => uint256) public proposalVotes;

    // Events
    event TokensMinted(
        address indexed recipient,
        uint256 amount,
        uint256 verificationId,
        bytes32 indexed category,
        uint256 authenticityScore
    );

    event TokensBurned(
        address indexed account,
        uint256 amount,
        bytes32 indexed category,
        string reason
    );

    event CategoryAdded(
        bytes32 indexed category,
        uint256 baseValue,
        uint256 riskMultiplier
    );

    event TokensStaked(
        address indexed staker,
        uint256 amount,
        uint256 expectedRewards
    );

    event TokensUnstaked(
        address indexed staker,
        uint256 amount,
        uint256 rewards
    );

    event RewardsDistributed(
        address indexed recipient,
        uint256 amount,
        bytes32 indexed source
    );

    event MarketDemandUpdated(
        bytes32 indexed category,
        uint256 oldDemand,
        uint256 newDemand
    );

    modifier onlyValidCategory(bytes32 category) {
        require(categories[category].active, "Invalid or inactive category");
        _;
    }

    modifier respectsCooldown(address account) {
        require(
            lastMintTime[account] + config.mintingCooldown <= block.timestamp,
            "Minting cooldown not met"
        );
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address admin,
        TokenomicsConfig memory _config
    ) ERC20(name, symbol) ERC20Permit(name) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);

        config = _config;

        // Initialize default categories
        _addCategory("electronics", 100, 110, 100);
        _addCategory("luxury", 150, 120, 80);
        _addCategory("pharmaceuticals", 200, 150, 90);
        _addCategory("food", 80, 90, 120);
        _addCategory("fashion", 90, 100, 110);
    }

    /**
     * @dev Mint tokens based on verification quality
     */
    function mintFromVerification(
        address recipient,
        uint256 verificationId,
        uint256 authenticityScore,
        bytes32 category,
        string memory productId
    ) external onlyRole(MINTER_ROLE) whenNotPaused onlyValidCategory(category) respectsCooldown(recipient) {
        require(!mintedVerifications[verificationId], "Verification already minted");
        require(authenticityScore >= 50 && authenticityScore <= 100, "Invalid authenticity score");
        require(totalSupply() < config.maxSupply, "Max supply reached");

        // Calculate mint amount based on authenticity score and category
        uint256 baseAmount = calculateBaseAmount(authenticityScore, category);
        uint256 qualityBonus = calculateQualityBonus(authenticityScore);
        uint256 categoryMultiplier = categories[category].riskMultiplier;
        uint256 demandMultiplier = calculateDemandMultiplier(category);

        uint256 mintAmount = (baseAmount * qualityBonus * categoryMultiplier * demandMultiplier) / (100 * 100 * 100);

        // Apply maximum mint limit per transaction
        uint256 maxMint = config.maxSupply / 1000; // 0.1% of max supply per mint
        mintAmount = Math.min(mintAmount, maxMint);

        // Update tracking
        mintedVerifications[verificationId] = true;
        verifierContributions[recipient] += mintAmount;
        lastMintTime[recipient] = block.timestamp;

        // Update category metrics
        categorySupply[category] += mintAmount;
        userCategoryBalance[recipient][category] += mintAmount;

        // Mint tokens
        _mint(recipient, mintAmount);

        // Update voting power
        votingPower[recipient] += mintAmount;

        emit TokensMinted(recipient, mintAmount, verificationId, category, authenticityScore);
    }

    /**
     * @dev Burn tokens to reduce supply and increase value
     */
    function burnForDeflation(
        uint256 amount,
        bytes32 category,
        string memory reason
    ) external whenNotPaused {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(userCategoryBalance[msg.sender][category] >= amount, "Insufficient category balance");

        // Update category metrics
        categorySupply[category] -= amount;
        userCategoryBalance[msg.sender][category] -= amount;

        // Update voting power
        votingPower[msg.sender] -= amount;

        // Burn tokens
        _burn(msg.sender, amount);

        // Add to reward pool (deflation reward)
        uint256 burnReward = (amount * config.burnRate) / 10000;
        if (burnReward > 0) {
            rewardPool += burnReward;
            stakingRewards[msg.sender] += burnReward;
        }

        emit TokensBurned(msg.sender, amount, category, reason);
    }

    /**
     * @dev Stake tokens to earn rewards
     */
    function stake(uint256 amount) external whenNotPaused {
        require(amount > 0, "Cannot stake 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        // Calculate expected rewards
        uint256 expectedRewards = calculateStakingRewards(amount);

        // Transfer tokens to staking
        _transfer(msg.sender, address(this), amount);
        
        stakedBalances[msg.sender] += amount;
        totalStaked += amount;
        lastStakeTime[msg.sender] = block.timestamp;

        emit TokensStaked(msg.sender, amount, expectedRewards);
    }

    /**
     * @dev Unstake tokens and claim rewards
     */
    function unstake(uint256 amount) external {
        require(amount > 0, "Cannot unstake 0");
        require(stakedBalances[msg.sender] >= amount, "Insufficient staked balance");

        // Calculate rewards earned
        uint256 rewards = calculateEarnedRewards(msg.sender, amount);

        // Update balances
        stakedBalances[msg.sender] -= amount;
        totalStaked -= amount;

        // Transfer staked tokens back
        _transfer(address(this), msg.sender, amount);

        // Distribute rewards
        if (rewards > 0 && rewardPool >= rewards) {
            rewardPool -= rewards;
            _mint(msg.sender, rewards);
            votingPower[msg.sender] += rewards;
        }

        emit TokensUnstaked(msg.sender, amount, rewards);
    }

    /**
     * @dev Claim staking rewards without unstaking
     */
    function claimRewards() external {
        uint256 rewards = stakingRewards[msg.sender];
        require(rewards > 0, "No rewards available");

        stakingRewards[msg.sender] = 0;

        if (rewardPool >= rewards) {
            rewardPool -= rewards;
            _mint(msg.sender, rewards);
            votingPower[msg.sender] += rewards;
            
            emit RewardsDistributed(msg.sender, rewards, "staking");
        }
    }

    /**
     * @dev Add new product category
     */
    function addCategory(
        bytes32 category,
        uint256 baseValue,
        uint256 riskMultiplier,
        uint256 marketDemand
    ) external onlyRole(ADMIN_ROLE) {
        _addCategory(category, baseValue, riskMultiplier, marketDemand);
    }

    /**
     * @dev Internal function to add category
     */
    function _addCategory(
        bytes32 category,
        uint256 baseValue,
        uint256 riskMultiplier,
        uint256 marketDemand
    ) internal {
        require(!categories[category].active, "Category already exists");
        require(baseValue > 0 && riskMultiplier > 0, "Invalid parameters");

        categories[category] = CategoryConfig({
            category: category,
            baseValue: baseValue,
            riskMultiplier: riskMultiplier,
            marketDemand: marketDemand,
            active: true
        });

        allCategories.push(category);
        categoryDemand[category] = marketDemand;

        emit CategoryAdded(category, baseValue, riskMultiplier);
    }

    /**
     * @dev Update market demand for category
     */
    function updateMarketDemand(
        bytes32 category,
        uint256 newDemand
    ) external onlyRole(ORACLE_ROLE) onlyValidCategory(category) {
        uint256 oldDemand = categories[category].marketDemand;
        categories[category].marketDemand = newDemand;
        categoryDemand[category] = newDemand;

        emit MarketDemandUpdated(category, oldDemand, newDemand);
    }

    /**
     * @dev Calculate base amount for minting
     */
    function calculateBaseAmount(uint256 authenticityScore, bytes32 category) public view returns (uint256) {
        CategoryConfig memory cat = categories[category];
        uint256 scoreMultiplier = (authenticityScore * 100) / 100; // Linear scaling
        return (config.baseReward * cat.baseValue * scoreMultiplier) / (100 * 100);
    }

    /**
     * @dev Calculate quality bonus based on authenticity score
     */
    function calculateQualityBonus(uint256 authenticityScore) public view returns (uint256) {
        if (authenticityScore >= 95) return config.qualityMultiplier;
        if (authenticityScore >= 90) return (config.qualityMultiplier * 80) / 100;
        if (authenticityScore >= 80) return (config.qualityMultiplier * 60) / 100;
        if (authenticityScore >= 70) return (config.qualityMultiplier * 40) / 100;
        return (config.qualityMultiplier * 20) / 100;
    }

    /**
     * @dev Calculate demand multiplier for category
     */
    function calculateDemandMultiplier(bytes32 category) public view returns (uint256) {
        uint256 demand = categoryDemand[category];
        uint256 supply = categorySupply[category];
        
        if (supply == 0) return 150; // High multiplier for new categories
        
        uint256 demandSupplyRatio = (demand * 100) / supply;
        
        if (demandSupplyRatio > 200) return 150; // High demand, low supply
        if (demandSupplyRatio > 150) return 125;
        if (demandSupplyRatio > 100) return 110;
        if (demandSupplyRatio > 75) return 100;
        return 90; // Low demand, high supply
    }

    /**
     * @dev Calculate staking rewards
     */
    function calculateStakingRewards(uint256 amount) public view returns (uint256) {
        return (amount * config.stakingAPY) / (100 * 365 days); // Daily rewards
    }

    /**
     * @dev Calculate earned rewards for staker
     */
    function calculateEarnedRewards(address staker, uint256 stakedAmount) public view returns (uint256) {
        uint256 stakingDuration = block.timestamp - lastStakeTime[staker];
        uint256 annualReward = (stakedAmount * config.stakingAPY) / 100;
        return (annualReward * stakingDuration) / 365 days;
    }

    /**
     * @dev Get user's total balance across all categories
     */
    function getTotalBalance(address account) external view returns (uint256) {
        return balanceOf(account) + stakedBalances[account];
    }

    /**
     * @dev Get user's balance for specific category
     */
    function getCategoryBalance(address account, bytes32 category) external view returns (uint256) {
        return userCategoryBalance[account][category];
    }

    /**
     * @dev Get all categories
     */
    function getAllCategories() external view returns (bytes32[] memory) {
        return allCategories;
    }

    /**
     * @dev Get category information
     */
    function getCategoryInfo(bytes32 category) external view returns (CategoryConfig memory) {
        return categories[category];
    }

    /**
     * @dev Get staking information for user
     */
    function getStakingInfo(address account) external view returns (
        uint256 staked,
        uint256 rewards,
        uint256 earnedRewards,
        uint256 votingPowerAmount
    ) {
        staked = stakedBalances[account];
        rewards = stakingRewards[account];
        earnedRewards = calculateEarnedRewards(account, staked);
        votingPowerAmount = votingPower[account];
    }

    /**
     * @dev Update tokenomics configuration
     */
    function updateConfig(TokenomicsConfig memory newConfig) external onlyRole(ADMIN_ROLE) {
        require(newConfig.maxSupply > totalSupply(), "Max supply too low");
        require(newConfig.stakingAPY <= 50, "APY too high"); // Max 50% APY
        config = newConfig;
    }

    /**
     * @dev Add to reward pool (for external reward distribution)
     */
    function addToRewardPool(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _transfer(msg.sender, address(this), amount);
        rewardPool += amount;
    }

    /**
     * @dev Pause/unpause token
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Override transfer to enforce pause
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    // The following overrides are required by ERC20Votes (voting power checkpoints).
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }

    /**
     * @dev Emergency functions
     */
    function emergencyWithdraw(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount <= rewardPool, "Amount exceeds reward pool");
        rewardPool -= amount;
        _transfer(address(this), msg.sender, amount);
    }
}