// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../VeriChainXAuthenticityVerifier.sol";
import "../VeriChainXTokenFactory.sol";

/**
 * @title VeriChainXAuthenticityAMM
 * @dev Specialized Automated Market Maker for Authenticity Tokens
 * Features dynamic pricing based on product authenticity scores and verification quality
 */
contract VeriChainXAuthenticityAMM is ERC20, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant LIQUIDITY_MANAGER_ROLE = keccak256("LIQUIDITY_MANAGER_ROLE");

    // Core contracts
    VeriChainXAuthenticityVerifier public immutable authenticityVerifier;
    VeriChainXTokenFactory public immutable tokenFactory;

    // AMM Configuration
    struct AMMConfig {
        uint256 baseFee; // Base trading fee in basis points
        uint256 authenticityBonus; // Bonus multiplier for high authenticity scores
        uint256 verifierRewardShare; // Percentage of fees going to verifiers
        uint256 liquidityIncentive; // LP token reward rate
        uint256 minimumLiquidity; // Minimum liquidity threshold
        uint256 maxSlippage; // Maximum allowed slippage
    }

    AMMConfig public config;

    // Authenticity Token Pools
    struct AuthenticityPool {
        address baseToken; // Base token (e.g., HBAR, USDC)
        address authenticityToken; // VeriChainX authenticity token
        uint256 baseReserve;
        uint256 authenticityReserve;
        uint256 totalSupply; // LP tokens
        uint256 authenticityScore; // Weighted average authenticity score
        uint256 verificationCount; // Number of verifications
        bytes32 productCategory; // Product category (electronics, luxury, etc.)
        uint256 lastUpdate;
        bool active;
        uint256 volumeWeighted; // Volume-weighted price history
        uint256 impermanentLossProtection; // IL protection fund
    }

    // Pool management
    mapping(bytes32 => AuthenticityPool) public pools;
    mapping(bytes32 => mapping(address => uint256)) public liquidityBalances;
    mapping(address => bytes32[]) public userPools;
    bytes32[] public allPools;

    // Authenticity-based pricing
    mapping(bytes32 => uint256[]) public authenticityScoreHistory;
    mapping(bytes32 => uint256) public poolAuthenticityWeight;
    mapping(bytes32 => mapping(address => uint256)) public verifierContributions;
    mapping(address => uint256) public verifierRewards;

    // Advanced features
    mapping(bytes32 => uint256) public poolInsurance; // Insurance fund per pool
    mapping(bytes32 => uint256) public yieldFarmingRewards; // Farming rewards
    mapping(address => mapping(bytes32 => uint256)) public stakingRewards;
    mapping(bytes32 => uint256) public protocolFees; // Accumulated protocol fees

    // Price oracles and analytics
    mapping(bytes32 => uint256) public timeWeightedAveragePrice;
    mapping(bytes32 => uint256) public volatilityIndex;
    mapping(bytes32 => uint256) public liquidityUtilization;

    // Events
    event AuthenticityPoolCreated(
        bytes32 indexed poolId,
        address indexed baseToken,
        address indexed authenticityToken,
        bytes32 productCategory,
        uint256 initialAuthenticityScore
    );
    
    event LiquidityAdded(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 baseAmount,
        uint256 authenticityAmount,
        uint256 liquidity,
        uint256 authenticityScore
    );
    
    event LiquidityRemoved(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 baseAmount,
        uint256 authenticityAmount,
        uint256 liquidity
    );
    
    event AuthenticitySwap(
        bytes32 indexed poolId,
        address indexed trader,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 authenticityScore,
        uint256 priceImpact
    );
    
    event AuthenticityScoreUpdated(
        bytes32 indexed poolId,
        uint256 oldScore,
        uint256 newScore,
        uint256 verificationId
    );
    
    event VerifierRewardDistributed(
        address indexed verifier,
        uint256 amount,
        bytes32 indexed poolId
    );
    
    event ImpermanentLossCompensated(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 compensation
    );

    modifier poolExists(bytes32 poolId) {
        require(pools[poolId].active, "Pool does not exist");
        _;
    }

    modifier onlyActivePool(bytes32 poolId) {
        require(pools[poolId].active, "Pool is not active");
        _;
    }

    constructor(
        address admin,
        address _authenticityVerifier,
        address _tokenFactory,
        AMMConfig memory _config
    ) ERC20("VeriChainX Authenticity LP", "VCXA-LP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        _grantRole(LIQUIDITY_MANAGER_ROLE, admin);

        authenticityVerifier = VeriChainXAuthenticityVerifier(payable(_authenticityVerifier));
        tokenFactory = VeriChainXTokenFactory(payable(_tokenFactory));
        config = _config;
    }

    /**
     * @dev Create new authenticity token pool
     */
    function createAuthenticityPool(
        address baseToken,
        address authenticityToken,
        bytes32 productCategory,
        uint256 initialAuthenticityScore
    ) external onlyRole(LIQUIDITY_MANAGER_ROLE) returns (bytes32 poolId) {
        require(baseToken != address(0) && authenticityToken != address(0), "Invalid tokens");
        require(initialAuthenticityScore >= 50 && initialAuthenticityScore <= 100, "Invalid authenticity score");

        poolId = keccak256(abi.encodePacked(baseToken, authenticityToken, productCategory));
        require(!pools[poolId].active, "Pool already exists");

        pools[poolId] = AuthenticityPool({
            baseToken: baseToken,
            authenticityToken: authenticityToken,
            baseReserve: 0,
            authenticityReserve: 0,
            totalSupply: 0,
            authenticityScore: initialAuthenticityScore,
            verificationCount: 0,
            productCategory: productCategory,
            lastUpdate: block.timestamp,
            active: true,
            volumeWeighted: 0,
            impermanentLossProtection: 0
        });

        allPools.push(poolId);
        authenticityScoreHistory[poolId].push(initialAuthenticityScore);
        poolAuthenticityWeight[poolId] = 100; // Initial weight

        emit AuthenticityPoolCreated(poolId, baseToken, authenticityToken, productCategory, initialAuthenticityScore);
    }

    /**
     * @dev Add liquidity to authenticity pool with dynamic pricing
     */
    function addLiquidity(
        bytes32 poolId,
        uint256 baseAmountDesired,
        uint256 authenticityAmountDesired,
        uint256 baseAmountMin,
        uint256 authenticityAmountMin,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused poolExists(poolId) returns (uint256 baseAmount, uint256 authenticityAmount, uint256 liquidity) {
        require(deadline >= block.timestamp, "Expired");
        require(to != address(0), "Invalid recipient");

        AuthenticityPool storage pool = pools[poolId];
        
        if (pool.baseReserve == 0 && pool.authenticityReserve == 0) {
            // First liquidity provision
            (baseAmount, authenticityAmount) = (baseAmountDesired, authenticityAmountDesired);
            liquidity = Math.sqrt(baseAmount * authenticityAmount) - 1000; // Minimum liquidity lock
            require(liquidity > 0, "Insufficient initial liquidity");
            
            // Lock minimum liquidity permanently
            liquidityBalances[poolId][address(0)] = 1000;
        } else {
            // Calculate optimal amounts with authenticity score adjustment
            uint256 authenticityMultiplier = calculateAuthenticityMultiplier(pool.authenticityScore);
            
            uint256 baseAmountOptimal = quote(authenticityAmountDesired, pool.authenticityReserve, pool.baseReserve);
            baseAmountOptimal = (baseAmountOptimal * authenticityMultiplier) / 100;
            
            if (baseAmountOptimal <= baseAmountDesired) {
                require(baseAmountOptimal >= baseAmountMin, "Insufficient base amount");
                (baseAmount, authenticityAmount) = (baseAmountOptimal, authenticityAmountDesired);
            } else {
                uint256 authenticityAmountOptimal = quote(baseAmountDesired, pool.baseReserve, pool.authenticityReserve);
                authenticityAmountOptimal = (authenticityAmountOptimal * 100) / authenticityMultiplier;
                require(authenticityAmountOptimal <= authenticityAmountDesired && authenticityAmountOptimal >= authenticityAmountMin, "Insufficient authenticity amount");
                (baseAmount, authenticityAmount) = (baseAmountDesired, authenticityAmountOptimal);
            }
            
            liquidity = Math.min(
                (baseAmount * pool.totalSupply) / pool.baseReserve,
                (authenticityAmount * pool.totalSupply) / pool.authenticityReserve
            );
        }

        require(liquidity > 0, "Insufficient liquidity minted");

        // Transfer tokens
        IERC20(pool.baseToken).safeTransferFrom(msg.sender, address(this), baseAmount);
        IERC20(pool.authenticityToken).safeTransferFrom(msg.sender, address(this), authenticityAmount);

        // Update pool state
        pool.baseReserve += baseAmount;
        pool.authenticityReserve += authenticityAmount;
        pool.totalSupply += liquidity;
        pool.lastUpdate = block.timestamp;

        // Update user liquidity
        liquidityBalances[poolId][to] += liquidity;
        if (liquidityBalances[poolId][to] == liquidity) {
            userPools[to].push(poolId);
        }

        // Mint LP tokens
        _mint(to, liquidity);

        // Calculate and distribute liquidity mining rewards
        distributeLiquidityRewards(poolId, to, liquidity);

        emit LiquidityAdded(poolId, to, baseAmount, authenticityAmount, liquidity, pool.authenticityScore);
    }

    /**
     * @dev Remove liquidity from authenticity pool
     */
    function removeLiquidity(
        bytes32 poolId,
        uint256 liquidity,
        uint256 baseAmountMin,
        uint256 authenticityAmountMin,
        address to,
        uint256 deadline
    ) external nonReentrant poolExists(poolId) returns (uint256 baseAmount, uint256 authenticityAmount) {
        require(deadline >= block.timestamp, "Expired");
        require(liquidity > 0, "Insufficient liquidity");
        require(balanceOf(msg.sender) >= liquidity, "Insufficient LP tokens");

        AuthenticityPool storage pool = pools[poolId];

        baseAmount = (liquidity * pool.baseReserve) / pool.totalSupply;
        authenticityAmount = (liquidity * pool.authenticityReserve) / pool.totalSupply;

        require(baseAmount >= baseAmountMin && authenticityAmount >= authenticityAmountMin, "Insufficient output amount");

        // Update pool state
        pool.baseReserve -= baseAmount;
        pool.authenticityReserve -= authenticityAmount;
        pool.totalSupply -= liquidity;
        pool.lastUpdate = block.timestamp;

        // Update user liquidity
        liquidityBalances[poolId][msg.sender] -= liquidity;

        // Burn LP tokens
        _burn(msg.sender, liquidity);

        // Check for impermanent loss compensation
        uint256 compensation = calculateImpermanentLossCompensation(poolId, msg.sender, liquidity);
        if (compensation > 0 && poolInsurance[poolId] >= compensation) {
            poolInsurance[poolId] -= compensation;
            IERC20(pool.baseToken).safeTransfer(to, compensation);
            emit ImpermanentLossCompensated(poolId, msg.sender, compensation);
        }

        // Transfer tokens
        IERC20(pool.baseToken).safeTransfer(to, baseAmount);
        IERC20(pool.authenticityToken).safeTransfer(to, authenticityAmount);

        emit LiquidityRemoved(poolId, msg.sender, baseAmount, authenticityAmount, liquidity);
    }

    /**
     * @dev Swap tokens with authenticity-based pricing
     */
    function swapWithAuthenticity(
        bytes32 poolId,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline,
        uint256 expectedAuthenticityScore
    ) external nonReentrant whenNotPaused poolExists(poolId) returns (uint256 amountOut) {
        require(deadline >= block.timestamp, "Expired");
        require(amountIn > 0, "Insufficient input amount");

        AuthenticityPool storage pool = pools[poolId];
        require(tokenIn == pool.baseToken || tokenIn == pool.authenticityToken, "Invalid token");

        bool isBaseToken = tokenIn == pool.baseToken;
        address tokenOut = isBaseToken ? pool.authenticityToken : pool.baseToken;
        
        uint256 reserveIn = isBaseToken ? pool.baseReserve : pool.authenticityReserve;
        uint256 reserveOut = isBaseToken ? pool.authenticityReserve : pool.baseReserve;

        // Calculate base amount out
        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

        // Apply authenticity score adjustment
        uint256 authenticityAdjustment = calculateAuthenticityPriceAdjustment(
            pool.authenticityScore,
            expectedAuthenticityScore,
            isBaseToken
        );
        
        amountOut = (amountOut * authenticityAdjustment) / 100;
        require(amountOut >= amountOutMin, "Insufficient output amount");

        // Calculate fees
        uint256 baseFee = (amountIn * config.baseFee) / 10000;
        uint256 authenticityBonus = calculateAuthenticityBonus(pool.authenticityScore);
        uint256 totalFee = baseFee - ((baseFee * authenticityBonus) / 10000);

        // Update reserves
        if (isBaseToken) {
            pool.baseReserve += amountIn;
            pool.authenticityReserve -= amountOut;
        } else {
            pool.authenticityReserve += amountIn;
            pool.baseReserve -= amountOut;
        }

        // Update price metrics
        updatePriceMetrics(poolId, amountIn, amountOut, isBaseToken);

        // Transfer tokens
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);

        // Distribute fees
        distributeTradingFees(poolId, totalFee, tokenIn);

        // Calculate price impact
        uint256 priceImpact = calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut);

        emit AuthenticitySwap(poolId, msg.sender, tokenIn, tokenOut, amountIn, amountOut, pool.authenticityScore, priceImpact);
    }

    /**
     * @dev Update authenticity score based on new verifications
     */
    function updateAuthenticityScore(
        bytes32 poolId,
        uint256 verificationId
    ) external onlyRole(ORACLE_ROLE) poolExists(poolId) {
        AuthenticityPool storage pool = pools[poolId];
        
        // Get verification data from the authenticity verifier
        (
            string memory productId,
            uint256 score,
            bytes32 evidenceHash,
            string memory method,
            string memory ruleId,
            address verifier,
            uint256 timestamp,
            bool disputed
        ) = authenticityVerifier.getVerification(verificationId);

        require(!disputed, "Cannot use disputed verification");
        require(timestamp > 0, "Invalid verification");

        uint256 oldScore = pool.authenticityScore;
        
        // Calculate new weighted average score
        uint256 totalWeight = pool.verificationCount + 1;
        uint256 newScore = ((pool.authenticityScore * pool.verificationCount) + score) / totalWeight;
        
        pool.authenticityScore = newScore;
        pool.verificationCount += 1;
        pool.lastUpdate = block.timestamp;

        // Update score history
        authenticityScoreHistory[poolId].push(newScore);
        
        // Update verifier contributions
        verifierContributions[poolId][verifier] += 1;
        
        // Distribute rewards to verifier
        uint256 verifierReward = (protocolFees[poolId] * config.verifierRewardShare) / 10000;
        if (verifierReward > 0) {
            verifierRewards[verifier] += verifierReward;
            protocolFees[poolId] -= verifierReward;
        }

        emit AuthenticityScoreUpdated(poolId, oldScore, newScore, verificationId);
        emit VerifierRewardDistributed(verifier, verifierReward, poolId);
    }

    /**
     * @dev Calculate authenticity multiplier for pricing
     */
    function calculateAuthenticityMultiplier(uint256 authenticityScore) public pure returns (uint256) {
        if (authenticityScore >= 95) return 110; // 10% bonus for excellent authenticity
        if (authenticityScore >= 90) return 105; // 5% bonus for very good authenticity
        if (authenticityScore >= 80) return 100; // No adjustment for good authenticity
        if (authenticityScore >= 70) return 95;  // 5% penalty for moderate authenticity
        return 90; // 10% penalty for low authenticity
    }

    /**
     * @dev Calculate authenticity-based price adjustment
     */
    function calculateAuthenticityPriceAdjustment(
        uint256 currentScore,
        uint256 expectedScore,
        bool isBuyingAuthenticity
    ) public pure returns (uint256) {
        if (currentScore == expectedScore) return 100;
        
        uint256 scoreDiff = currentScore > expectedScore ? 
            currentScore - expectedScore : expectedScore - currentScore;
        
        uint256 adjustment = 100 + (scoreDiff * 2); // 2% per authenticity point difference
        
        if (isBuyingAuthenticity) {
            return currentScore > expectedScore ? adjustment : (10000 / adjustment);
        } else {
            return currentScore > expectedScore ? (10000 / adjustment) : adjustment;
        }
    }

    /**
     * @dev Calculate authenticity bonus for fee reduction
     */
    function calculateAuthenticityBonus(uint256 authenticityScore) public view returns (uint256) {
        if (authenticityScore >= 95) return config.authenticityBonus;
        if (authenticityScore >= 90) return (config.authenticityBonus * 75) / 100;
        if (authenticityScore >= 80) return (config.authenticityBonus * 50) / 100;
        return 0;
    }

    /**
     * @dev Get amount out with authenticity adjustment
     */
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public view returns (uint256 amountOut) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        
        uint256 amountInWithFee = amountIn * (10000 - config.baseFee);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 10000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @dev Quote function for authenticity pools
     */
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        require(amountA > 0, "Insufficient amount");
        require(reserveA > 0 && reserveB > 0, "Insufficient liquidity");
        amountB = (amountA * reserveB) / reserveA;
    }

    /**
     * @dev Calculate price impact
     */
    function calculatePriceImpact(
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 amountIn,
        uint256 amountOut
    ) public pure returns (uint256) {
        uint256 priceBeforeTrade = (reserveOut * 1e18) / reserveIn;
        uint256 priceAfterTrade = ((reserveOut - amountOut) * 1e18) / (reserveIn + amountIn);
        
        if (priceBeforeTrade == 0) return 0;
        
        uint256 priceDiff = priceBeforeTrade > priceAfterTrade ? 
            priceBeforeTrade - priceAfterTrade : priceAfterTrade - priceBeforeTrade;
        
        return (priceDiff * 10000) / priceBeforeTrade; // Return in basis points
    }

    /**
     * @dev Update time-weighted average price and volatility
     */
    function updatePriceMetrics(
        bytes32 poolId,
        uint256 amountIn,
        uint256 amountOut,
        bool isBaseToken
    ) internal {
        AuthenticityPool storage pool = pools[poolId];
        
        uint256 price = isBaseToken ? 
            (amountOut * 1e18) / amountIn : 
            (amountIn * 1e18) / amountOut;
        
        // Update TWAP
        uint256 timeElapsed = block.timestamp - pool.lastUpdate;
        if (timeElapsed > 0) {
            timeWeightedAveragePrice[poolId] = 
                ((timeWeightedAveragePrice[poolId] * (86400 - timeElapsed)) + (price * timeElapsed)) / 86400;
        }
        
        // Update volatility index (simplified)
        if (timeWeightedAveragePrice[poolId] > 0) {
            uint256 priceDiff = price > timeWeightedAveragePrice[poolId] ? 
                price - timeWeightedAveragePrice[poolId] : 
                timeWeightedAveragePrice[poolId] - price;
            volatilityIndex[poolId] = (volatilityIndex[poolId] * 9 + (priceDiff * 1e18) / timeWeightedAveragePrice[poolId]) / 10;
        }
        
        // Update volume weighted price
        pool.volumeWeighted = ((pool.volumeWeighted * 9) + price) / 10;
    }

    /**
     * @dev Distribute liquidity rewards
     */
    function distributeLiquidityRewards(bytes32 poolId, address provider, uint256 liquidity) internal {
        uint256 rewards = (liquidity * config.liquidityIncentive) / 10000;
        if (rewards > 0) {
            stakingRewards[provider][poolId] += rewards;
            yieldFarmingRewards[poolId] += rewards;
        }
    }

    /**
     * @dev Distribute trading fees
     */
    function distributeTradingFees(bytes32 poolId, uint256 feeAmount, address feeToken) internal {
        // Protocol fee
        protocolFees[poolId] += (feeAmount * 30) / 100; // 30% to protocol
        
        // Insurance fund
        poolInsurance[poolId] += (feeAmount * 20) / 100; // 20% to insurance
        
        // LP rewards (remaining 50% stays in pool reserves)
        yieldFarmingRewards[poolId] += (feeAmount * 50) / 100;
    }

    /**
     * @dev Calculate impermanent loss compensation
     */
    function calculateImpermanentLossCompensation(
        bytes32 poolId,
        address provider,
        uint256 liquidity
    ) internal view returns (uint256) {
        // Simplified IL calculation - in production, this would be more sophisticated
        AuthenticityPool storage pool = pools[poolId];
        
        if (pool.impermanentLossProtection == 0) return 0;
        
        uint256 userShare = (liquidity * 1e18) / pool.totalSupply;
        uint256 maxCompensation = (pool.impermanentLossProtection * userShare) / 1e18;
        
        // Calculate actual IL based on price changes (simplified)
        uint256 currentPrice = (pool.baseReserve * 1e18) / pool.authenticityReserve;
        uint256 initialPrice = pool.volumeWeighted;
        
        if (initialPrice == 0 || currentPrice == initialPrice) return 0;
        
        uint256 priceRatio = currentPrice > initialPrice ? 
            (currentPrice * 1e18) / initialPrice : 
            (initialPrice * 1e18) / currentPrice;
        
        if (priceRatio <= 1.1e18) return 0; // No compensation for < 10% price change
        
        uint256 ilPercentage = (priceRatio - 1e18) / 1e16; // Approximate IL percentage
        uint256 compensation = (maxCompensation * ilPercentage) / 100;
        
        return Math.min(compensation, maxCompensation);
    }

    /**
     * @dev Claim verifier rewards
     */
    function claimVerifierRewards() external nonReentrant {
        uint256 rewards = verifierRewards[msg.sender];
        require(rewards > 0, "No rewards available");
        
        verifierRewards[msg.sender] = 0;
        
        // Pay rewards in base token (simplified - could be in governance token)
        payable(msg.sender).transfer(rewards);
    }

    /**
     * @dev Claim LP staking rewards
     */
    function claimLPRewards(bytes32 poolId) external nonReentrant poolExists(poolId) {
        uint256 rewards = stakingRewards[msg.sender][poolId];
        require(rewards > 0, "No rewards available");
        
        stakingRewards[msg.sender][poolId] = 0;
        
        // Mint reward tokens (could be governance tokens)
        _mint(msg.sender, rewards);
    }

    /**
     * @dev Get pool information
     */
    function getPoolInfo(bytes32 poolId) external view returns (AuthenticityPool memory) {
        return pools[poolId];
    }

    /**
     * @dev Get authenticity score history
     */
    function getAuthenticityHistory(bytes32 poolId) external view returns (uint256[] memory) {
        return authenticityScoreHistory[poolId];
    }

    /**
     * @dev Get all pools
     */
    function getAllPools() external view returns (bytes32[] memory) {
        return allPools;
    }

    /**
     * @dev Get user's LP positions
     */
    function getUserPools(address user) external view returns (bytes32[] memory) {
        return userPools[user];
    }

    /**
     * @dev Update AMM configuration
     */
    function updateConfig(AMMConfig memory newConfig) external onlyRole(ADMIN_ROLE) {
        require(newConfig.baseFee <= 1000, "Fee too high"); // Max 10%
        require(newConfig.maxSlippage <= 5000, "Slippage too high"); // Max 50%
        config = newConfig;
    }

    /**
     * @dev Pause/unpause AMM
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Emergency functions
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    receive() external payable {}
}