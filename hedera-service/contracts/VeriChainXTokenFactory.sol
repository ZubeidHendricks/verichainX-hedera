// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./VeriChainXAuthenticityVerifier.sol";

/**
 * @title VeriChainX Token Factory
 * @dev Factory contract for creating authenticity certificates and reward tokens
 * @author VeriChainX Team
 * 
 * Features:
 * - Dynamic NFT creation for authenticity certificates
 * - ERC20 reward token minting
 * - Integration with authenticity verifier contract
 * - Upgradeable metadata and token standards
 * - Gas-optimized batch operations
 */
contract VeriChainXTokenFactory is AccessControl, Pausable {
    using Counters for Counters.Counter;

    // ============ CONSTANTS ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============ STATE VARIABLES ============
    VeriChainXAuthenticityVerifier public authenticityVerifier;
    VeriChainXRewardToken public rewardToken;
    
    Counters.Counter private _certificateIds;
    
    mapping(string => address) public certificateCollections;
    mapping(address => bool) public approvedCollections;
    mapping(string => CertificateTemplate) public certificateTemplates;
    
    struct CertificateTemplate {
        string name;
        string description;
        string baseURI;
        uint256 mintCost;
        bool requiresVerification;
        uint256 minVerificationScore;
        bool isActive;
    }

    // ============ EVENTS ============
    event CertificateCollectionCreated(
        string indexed collectionId,
        address indexed collectionAddress,
        string name,
        string symbol
    );
    
    event CertificateMinted(
        address indexed collection,
        uint256 indexed tokenId,
        string indexed productId,
        address recipient,
        uint256 verificationScore
    );
    
    event TemplateCreated(
        string indexed templateId,
        string name,
        uint256 mintCost,
        bool requiresVerification
    );

    // ============ CONSTRUCTOR ============
    constructor(
        address admin,
        address _authenticityVerifier
    ) {
        require(admin != address(0), "Admin cannot be zero address");
        require(_authenticityVerifier != address(0), "Verifier cannot be zero address");
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        
        authenticityVerifier = VeriChainXAuthenticityVerifier(payable(_authenticityVerifier));
        
        // Deploy reward token
        rewardToken = new VeriChainXRewardToken(admin);
        
        // Initialize default templates
        _initializeDefaultTemplates();
    }

    // ============ COLLECTION MANAGEMENT ============
    
    /**
     * @dev Create a new certificate collection (NFT contract)
     * @param collectionId Unique identifier for the collection
     * @param name Name of the NFT collection
     * @param symbol Symbol of the NFT collection
     * @param baseURI Base URI for token metadata
     */
    function createCertificateCollection(
        string memory collectionId,
        string memory name,
        string memory symbol,
        string memory baseURI
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(bytes(collectionId).length > 0, "Collection ID cannot be empty");
        require(certificateCollections[collectionId] == address(0), "Collection already exists");
        
        VeriChainXCertificate newCollection = new VeriChainXCertificate(
            name,
            symbol,
            baseURI,
            address(this)
        );
        
        certificateCollections[collectionId] = address(newCollection);
        approvedCollections[address(newCollection)] = true;
        
        emit CertificateCollectionCreated(collectionId, address(newCollection), name, symbol);
    }

    /**
     * @dev Create certificate template
     * @param templateId Unique template identifier
     * @param name Template name
     * @param description Template description
     * @param baseURI Base URI for metadata
     * @param mintCost Cost to mint certificate
     * @param requiresVerification Whether verification is required
     * @param minVerificationScore Minimum verification score required
     */
    function createCertificateTemplate(
        string memory templateId,
        string memory name,
        string memory description,
        string memory baseURI,
        uint256 mintCost,
        bool requiresVerification,
        uint256 minVerificationScore
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(templateId).length > 0, "Template ID cannot be empty");
        require(!certificateTemplates[templateId].isActive, "Template already exists");
        
        certificateTemplates[templateId] = CertificateTemplate({
            name: name,
            description: description,
            baseURI: baseURI,
            mintCost: mintCost,
            requiresVerification: requiresVerification,
            minVerificationScore: minVerificationScore,
            isActive: true
        });
        
        emit TemplateCreated(templateId, name, mintCost, requiresVerification);
    }

    // ============ CERTIFICATE MINTING ============
    
    /**
     * @dev Mint authenticity certificate NFT
     * @param collectionId Collection to mint in
     * @param productId Product identifier
     * @param recipient Address to receive the certificate
     * @param templateId Template to use for minting
     * @param verificationId Associated verification ID (if required)
     */
    function mintCertificate(
        string memory collectionId,
        string memory productId,
        address recipient,
        string memory templateId,
        uint256 verificationId
    ) external payable onlyRole(MINTER_ROLE) whenNotPaused {
        require(bytes(collectionId).length > 0, "Collection ID cannot be empty");
        require(bytes(productId).length > 0, "Product ID cannot be empty");
        require(recipient != address(0), "Recipient cannot be zero address");
        
        address collectionAddress = certificateCollections[collectionId];
        require(collectionAddress != address(0), "Collection does not exist");
        
        CertificateTemplate memory template = certificateTemplates[templateId];
        require(template.isActive, "Template not active");
        require(msg.value >= template.mintCost, "Insufficient payment");
        
        uint256 verificationScore = 0;
        
        // Check verification requirements
        if (template.requiresVerification) {
            require(verificationId > 0, "Verification ID required");
            
            VeriChainXAuthenticityVerifier.VerificationRecord memory verification = 
                authenticityVerifier.getVerification(verificationId);
            
            require(
                keccak256(bytes(verification.productId)) == keccak256(bytes(productId)),
                "Verification product mismatch"
            );
            require(
                verification.status == VeriChainXAuthenticityVerifier.VerificationStatus.VERIFIED_AUTHENTIC,
                "Product not verified as authentic"
            );
            require(
                verification.score >= template.minVerificationScore,
                "Verification score too low"
            );
            
            verificationScore = verification.score;
        }
        
        // Mint the certificate
        _certificateIds.increment();
        uint256 tokenId = _certificateIds.current();
        
        VeriChainXCertificate collection = VeriChainXCertificate(collectionAddress);
        collection.mintCertificate(recipient, tokenId, productId, templateId, verificationScore);
        
        emit CertificateMinted(collectionAddress, tokenId, productId, recipient, verificationScore);
        
        // Mint reward tokens to the recipient
        uint256 rewardAmount = _calculateRewardAmount(verificationScore, template.mintCost);
        if (rewardAmount > 0) {
            rewardToken.mint(recipient, rewardAmount);
        }
    }

    /**
     * @dev Batch mint certificates for multiple products
     * @param collectionId Collection to mint in
     * @param productIds Array of product identifiers
     * @param recipients Array of recipient addresses
     * @param templateId Template to use for all certificates
     * @param verificationIds Array of verification IDs
     */
    function batchMintCertificates(
        string memory collectionId,
        string[] memory productIds,
        address[] memory recipients,
        string memory templateId,
        uint256[] memory verificationIds
    ) external payable onlyRole(MINTER_ROLE) whenNotPaused {
        require(productIds.length == recipients.length, "Array length mismatch");
        require(productIds.length == verificationIds.length, "Array length mismatch");
        require(productIds.length > 0, "Empty arrays");
        
        CertificateTemplate memory template = certificateTemplates[templateId];
        require(template.isActive, "Template not active");
        require(msg.value >= template.mintCost * productIds.length, "Insufficient payment");
        
        for (uint256 i = 0; i < productIds.length; i++) {
            _mintSingleCertificate(
                collectionId,
                productIds[i],
                recipients[i],
                templateId,
                verificationIds[i]
            );
        }
    }

    /**
     * @dev Internal function to mint a single certificate
     */
    function _mintSingleCertificate(
        string memory collectionId,
        string memory productId,
        address recipient,
        string memory templateId,
        uint256 verificationId
    ) internal {
        address collectionAddress = certificateCollections[collectionId];
        CertificateTemplate memory template = certificateTemplates[templateId];
        
        uint256 verificationScore = 0;
        
        if (template.requiresVerification && verificationId > 0) {
            VeriChainXAuthenticityVerifier.VerificationRecord memory verification = 
                authenticityVerifier.getVerification(verificationId);
            
            if (verification.status == VeriChainXAuthenticityVerifier.VerificationStatus.VERIFIED_AUTHENTIC &&
                verification.score >= template.minVerificationScore) {
                verificationScore = verification.score;
            }
        }
        
        _certificateIds.increment();
        uint256 tokenId = _certificateIds.current();
        
        VeriChainXCertificate collection = VeriChainXCertificate(collectionAddress);
        collection.mintCertificate(recipient, tokenId, productId, templateId, verificationScore);
        
        emit CertificateMinted(collectionAddress, tokenId, productId, recipient, verificationScore);
        
        uint256 rewardAmount = _calculateRewardAmount(verificationScore, template.mintCost);
        if (rewardAmount > 0) {
            rewardToken.mint(recipient, rewardAmount);
        }
    }

    // ============ REWARD CALCULATION ============
    
    /**
     * @dev Calculate reward amount based on verification score and mint cost
     * @param verificationScore Score from verification (0-100)
     * @param mintCost Cost paid for minting
     */
    function _calculateRewardAmount(
        uint256 verificationScore,
        uint256 mintCost
    ) internal pure returns (uint256) {
        if (verificationScore < 70) {
            return 0; // No rewards for low-quality verifications
        }
        
        // Reward formula: higher scores get more rewards
        uint256 baseReward = mintCost / 10; // 10% of mint cost as base
        uint256 scoreBonus = (verificationScore - 70) * baseReward / 30; // Bonus for high scores
        
        return baseReward + scoreBonus;
    }

    // ============ TEMPLATE MANAGEMENT ============
    
    /**
     * @dev Initialize default certificate templates
     */
    function _initializeDefaultTemplates() internal {
        // Standard authenticity certificate
        certificateTemplates["STANDARD"] = CertificateTemplate({
            name: "Standard Authenticity Certificate",
            description: "Basic authenticity certificate for verified products",
            baseURI: "https://api.verichainx.com/metadata/standard/",
            mintCost: 0.01 ether,
            requiresVerification: true,
            minVerificationScore: 70,
            isActive: true
        });
        
        // Premium authenticity certificate
        certificateTemplates["PREMIUM"] = CertificateTemplate({
            name: "Premium Authenticity Certificate",
            description: "Premium certificate for high-value verified products",
            baseURI: "https://api.verichainx.com/metadata/premium/",
            mintCost: 0.05 ether,
            requiresVerification: true,
            minVerificationScore: 90,
            isActive: true
        });
        
        // Commemorative certificate (no verification required)
        certificateTemplates["COMMEMORATIVE"] = CertificateTemplate({
            name: "Commemorative Certificate",
            description: "Special commemorative certificate for events and milestones",
            baseURI: "https://api.verichainx.com/metadata/commemorative/",
            mintCost: 0.005 ether,
            requiresVerification: false,
            minVerificationScore: 0,
            isActive: true
        });
    }

    // ============ VIEW FUNCTIONS ============
    
    /**
     * @dev Get certificate template details
     * @param templateId Template identifier
     */
    function getCertificateTemplate(string memory templateId) 
        external 
        view 
        returns (CertificateTemplate memory) 
    {
        return certificateTemplates[templateId];
    }

    /**
     * @dev Get collection address by ID
     * @param collectionId Collection identifier
     */
    function getCollectionAddress(string memory collectionId)
        external
        view
        returns (address)
    {
        return certificateCollections[collectionId];
    }

    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Pause contract functions
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract functions
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Emergency withdrawal
     */
    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        payable(msg.sender).transfer(address(this).balance);
    }

    // ============ RECEIVE FUNCTION ============
    receive() external payable {}
}

/**
 * @title VeriChainX Certificate NFT Contract
 * @dev Individual NFT contract for authenticity certificates
 */
contract VeriChainXCertificate is ERC721, ERC721URIStorage, ERC721Burnable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    string private _baseTokenURI;
    address public factory;
    
    mapping(uint256 => CertificateData) public certificateData;
    
    struct CertificateData {
        string productId;
        string templateId;
        uint256 verificationScore;
        uint256 mintTimestamp;
        bool isTransferable;
    }

    event CertificateDataSet(
        uint256 indexed tokenId,
        string productId,
        uint256 verificationScore
    );

    constructor(
        string memory name,
        string memory symbol,
        string memory baseURI,
        address _factory
    ) ERC721(name, symbol) {
        _baseTokenURI = baseURI;
        factory = _factory;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _factory);
        _grantRole(MINTER_ROLE, _factory);
    }

    /**
     * @dev Mint certificate with metadata
     */
    function mintCertificate(
        address to,
        uint256 tokenId,
        string memory productId,
        string memory templateId,
        uint256 verificationScore
    ) external onlyRole(MINTER_ROLE) {
        _safeMint(to, tokenId);
        
        certificateData[tokenId] = CertificateData({
            productId: productId,
            templateId: templateId,
            verificationScore: verificationScore,
            mintTimestamp: block.timestamp,
            isTransferable: true
        });
        
        emit CertificateDataSet(tokenId, productId, verificationScore);
    }

    /**
     * @dev Override base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Set new base URI
     */
    function setBaseURI(string memory newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = newBaseURI;
    }

    // Required overrides
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

/**
 * @title VeriChainX Reward Token
 * @dev ERC20 reward token for the VeriChainX ecosystem
 */
contract VeriChainXRewardToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    uint256 public constant MAX_SUPPLY = 1000000000 * 10**18; // 1 billion tokens
    
    constructor(address admin) ERC20("VeriChainX Reward Token", "VCRX") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /**
     * @dev Mint reward tokens
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
}