/**
 * HTS (Hedera Token Service) Specialized Agent
 *
 * Performs HTS operations programmatically against the Hedera network using the
 * official @hashgraph/sdk. These are deterministic blockchain calls (no LLM) —
 * the natural-language path lives in HederaLangChainAgent (HederaAgentKit.ts).
 */

import {
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TransferTransaction,
  TokenType,
  TokenSupplyType,
} from '@hashgraph/sdk';
import { z } from 'zod';

export interface HtsOperation {
  success: boolean;
  transactionId?: string;
  tokenId?: string;
  serialNumber?: number;
  amount?: number;
  balance?: string;
  message: string;
  details?: any;
}

export class HtsAgent {
  private client: Client | null = null;
  private operatorKey: PrivateKey | null = null;

  constructor(
    private accountId: string,
    private privateKey: string,
    private network: 'testnet' | 'mainnet' = 'testnet'
  ) {}

  /**
   * Initialize the Hedera client/operator for this agent.
   */
  async initialize(): Promise<void> {
    const client = this.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.operatorKey = PrivateKey.fromString(this.privateKey);
    client.setOperator(this.accountId, this.operatorKey);
    this.client = client;
    console.log(`🪙 HTS Agent initialized on ${this.network}`);
  }

  private requireClient(): Client {
    if (!this.client || !this.operatorKey) {
      throw new Error('HTS agent not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Create a fungible token with the operator as treasury.
   */
  async createFungibleToken(
    name: string,
    symbol: string,
    decimals: number,
    initialSupply: number
  ): Promise<HtsOperation> {
    try {
      const client = this.requireClient();
      const response = await new TokenCreateTransaction()
        .setTokenName(name)
        .setTokenSymbol(symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(decimals)
        .setInitialSupply(initialSupply)
        .setTreasuryAccountId(this.accountId)
        .setAdminKey(this.operatorKey!.publicKey)
        .setSupplyKey(this.operatorKey!.publicKey)
        .execute(client);
      const receipt = await response.getReceipt(client);

      return {
        success: true,
        tokenId: receipt.tokenId?.toString(),
        transactionId: response.transactionId.toString(),
        message: `Fungible token created: ${receipt.tokenId?.toString()}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create fungible token: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Create a non-fungible token collection with the operator as treasury.
   */
  async createNftCollection(name: string, symbol: string): Promise<HtsOperation> {
    try {
      const client = this.requireClient();
      const response = await new TokenCreateTransaction()
        .setTokenName(name)
        .setTokenSymbol(symbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setDecimals(0)
        .setInitialSupply(0)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(10000)
        .setTreasuryAccountId(this.accountId)
        .setAdminKey(this.operatorKey!.publicKey)
        .setSupplyKey(this.operatorKey!.publicKey)
        .execute(client);
      const receipt = await response.getReceipt(client);

      return {
        success: true,
        tokenId: receipt.tokenId?.toString(),
        transactionId: response.transactionId.toString(),
        message: `NFT collection created: ${receipt.tokenId?.toString()}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create NFT collection: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Mint a single NFT (with metadata) into an existing collection.
   */
  async mintNft(tokenId: string, metadata: any): Promise<HtsOperation> {
    try {
      const client = this.requireClient();
      const encoded = Buffer.from(typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
      const response = await new TokenMintTransaction()
        .setTokenId(tokenId)
        .setMetadata([encoded])
        .execute(client);
      const receipt = await response.getReceipt(client);
      const serial = receipt.serials && receipt.serials.length > 0 ? receipt.serials[0].toNumber() : undefined;

      return {
        success: true,
        tokenId,
        transactionId: response.transactionId.toString(),
        serialNumber: serial,
        message: `NFT minted with serial ${serial}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to mint NFT: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Transfer fungible tokens from the operator to another account.
   */
  async transferToken(
    tokenId: string,
    toAccountId: string,
    amount: number
  ): Promise<HtsOperation> {
    try {
      const client = this.requireClient();
      const response = await new TransferTransaction()
        .addTokenTransfer(tokenId, this.accountId, -amount)
        .addTokenTransfer(tokenId, toAccountId, amount)
        .execute(client);
      const receipt = await response.getReceipt(client);

      return {
        success: true,
        tokenId,
        transactionId: response.transactionId.toString(),
        amount,
        message: `Transferred ${amount} of ${tokenId} to ${toAccountId} (${receipt.status.toString()})`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to transfer tokens: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Generic entry point used by the tool-calling service for custom HTS requests.
   * Structured operations should use the specific methods above; free-form
   * natural-language requests should go through HederaLangChainAgent.
   */
  async executeOperation(request: string): Promise<HtsOperation> {
    return {
      success: false,
      message:
        'Free-form HTS requests are handled by the natural-language agent. ' +
        'Use createFungibleToken/createNftCollection/mintNft/transferToken for direct operations.',
      details: { request, network: this.network, agent: 'HTS' },
    };
  }

  /**
   * Operations this agent supports (for status/introspection).
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    return [
      { name: 'create_fungible_token', description: 'Create a fungible HTS token.' },
      { name: 'create_nft_collection', description: 'Create an NFT collection.' },
      { name: 'mint_nft', description: 'Mint an NFT with metadata into a collection.' },
      { name: 'transfer_token', description: 'Transfer fungible tokens between accounts.' },
    ];
  }

  getStatus(): { network: string; accountId: string; ready: boolean } {
    return {
      network: this.network,
      accountId: this.accountId,
      ready: this.client !== null,
    };
  }
}

/**
 * Validation schemas for HTS operations
 */
export const htsSchemas = {
  createFungibleToken: z.object({
    name: z.string().min(1).max(100),
    symbol: z.string().min(1).max(10).toUpperCase(),
    decimals: z.number().min(0).max(18),
    initialSupply: z.number().min(0),
  }),

  createNftToken: z.object({
    name: z.string().min(1).max(100),
    symbol: z.string().min(1).max(10).toUpperCase(),
  }),

  mintTokens: z.object({
    tokenId: z.string().regex(/^0\.0\.\d+$/),
    amount: z.number().positive().optional(),
    metadata: z.any().optional(),
  }),

  transferTokens: z.object({
    tokenId: z.string().regex(/^0\.0\.\d+$/),
    toAccountId: z.string().regex(/^0\.0\.\d+$/),
    amount: z.number().positive().optional(),
    serialNumber: z.number().positive().optional(),
  }),
};
