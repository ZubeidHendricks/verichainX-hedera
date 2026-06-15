/**
 * HTS (Hedera Token Service) Specialized Agent
 * Handles token creation, minting, transfers, and NFT operations
 */

import { HederaAgentKit, createUnmigratedAgentKit } from './HederaAgentKit';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicTool } from '@langchain/core/tools';
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
  private agentKit: any;
  private llm: ChatOpenAI;
  private agentExecutor: AgentExecutor | null = null;
  private tools: DynamicTool[] = [];

  constructor(
    private accountId: string,
    private privateKey: string,
    private network: 'testnet' | 'mainnet' = 'testnet'
  ) {
    this.agentKit = createUnmigratedAgentKit({
      accountId: this.accountId,
      privateKey: this.privateKey,
      network: this.network,
    });

    this.llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-mini',
      temperature: 0.1,
    });

    this.initializeHtsTools();
  }

  /**
   * Initialize HTS-specific tools
   */
  private initializeHtsTools(): void {
    // Create Fungible Token Tool
    this.tools.push(
      new DynamicTool({
        name: 'create_fungible_token',
        description: 'Create a new fungible token. Input should be JSON with name, symbol, decimals, and initialSupply.',
        func: async (input: string) => {
          try {
            const { name, symbol, decimals, initialSupply } = JSON.parse(input);
            const result = await this.agentKit.createToken(name, symbol, decimals, initialSupply);
            return JSON.stringify({
              success: true,
              tokenId: result.tokenId,
              transactionId: result.transactionId,
              message: `Successfully created fungible token ${symbol} (${name})`,
              tokenInfo: { name, symbol, decimals, initialSupply },
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );

    // Create NFT Token Tool
    this.tools.push(
      new DynamicTool({
        name: 'create_nft_token',
        description: 'Create a new NFT collection. Input should be JSON with name and symbol.',
        func: async (input: string) => {
          try {
            const { name, symbol } = JSON.parse(input);
            // NFTs have 0 decimals and 0 initial supply
            const result = await this.agentKit.createToken(name, symbol, 0, 0);
            return JSON.stringify({
              success: true,
              tokenId: result.tokenId,
              transactionId: result.transactionId,
              message: `Successfully created NFT collection ${symbol} (${name})`,
              tokenInfo: { name, symbol, type: 'NFT' },
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );

    // Mint Token Tool
    this.tools.push(
      new DynamicTool({
        name: 'mint_tokens',
        description: 'Mint additional tokens or NFTs. Input should be JSON with tokenId and amount (or metadata for NFTs).',
        func: async (input: string) => {
          try {
            const { tokenId, amount, metadata } = JSON.parse(input);
            let result;
            
            if (metadata) {
              // Mint NFT with metadata
              result = await this.agentKit.mintNFT(tokenId, metadata);
            } else {
              // Mint fungible tokens
              result = await this.agentKit.mintToken(tokenId, amount);
            }
            
            return JSON.stringify({
              success: true,
              tokenId: tokenId,
              transactionId: result.transactionId,
              serialNumber: result.serialNumber,
              amount: amount,
              message: metadata 
                ? `Successfully minted NFT with serial ${result.serialNumber}` 
                : `Successfully minted ${amount} tokens`,
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );

    // Transfer Token Tool
    this.tools.push(
      new DynamicTool({
        name: 'transfer_tokens',
        description: 'Transfer tokens between accounts. Input should be JSON with tokenId, toAccountId, amount, and optionally serialNumber for NFTs.',
        func: async (input: string) => {
          try {
            const { tokenId, toAccountId, amount, serialNumber } = JSON.parse(input);
            let result;
            
            if (serialNumber) {
              // Transfer NFT
              result = await this.agentKit.transferNFT(tokenId, toAccountId, serialNumber);
            } else {
              // Transfer fungible tokens
              result = await this.agentKit.transferToken(tokenId, toAccountId, amount);
            }
            
            return JSON.stringify({
              success: true,
              tokenId: tokenId,
              transactionId: result.transactionId,
              toAccountId: toAccountId,
              amount: amount,
              serialNumber: serialNumber,
              message: serialNumber 
                ? `Successfully transferred NFT serial ${serialNumber} to ${toAccountId}`
                : `Successfully transferred ${amount} tokens to ${toAccountId}`,
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );

    // Transfer HBAR Tool
    this.tools.push(
      new DynamicTool({
        name: 'transfer_hbar',
        description: 'Transfer HBAR between accounts. Input should be JSON with toAccountId and amount.',
        func: async (input: string) => {
          try {
            const { toAccountId, amount } = JSON.parse(input);
            const result = await this.agentKit.transferHBAR(toAccountId, amount);
            return JSON.stringify({
              success: true,
              transactionId: result.transactionId,
              toAccountId: toAccountId,
              amount: amount,
              message: `Successfully transferred ${amount} HBAR to ${toAccountId}`,
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );

    // Get Token Balance Tool
    this.tools.push(
      new DynamicTool({
        name: 'get_token_balance',
        description: 'Get token balance for an account. Input should be JSON with accountId and optionally tokenId.',
        func: async (input: string) => {
          try {
            const { accountId, tokenId } = JSON.parse(input);
            const balance = await this.agentKit.getAccountBalance(accountId);
            
            if (tokenId) {
              const tokenBalance = balance.tokens?.[tokenId] || 0;
              return JSON.stringify({
                success: true,
                accountId: accountId,
                tokenId: tokenId,
                balance: tokenBalance.toString(),
                message: `Token ${tokenId} balance: ${tokenBalance}`,
              });
            } else {
              return JSON.stringify({
                success: true,
                accountId: accountId,
                hbarBalance: balance.hbars.toString(),
                tokens: balance.tokens || {},
                message: `Account ${accountId} balance retrieved`,
              });
            }
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );

    // Get Token Info Tool
    this.tools.push(
      new DynamicTool({
        name: 'get_token_info',
        description: 'Get detailed information about a token. Input should be the tokenId as a string.',
        func: async (tokenId: string) => {
          try {
            const info = await this.agentKit.getTokenInfo(tokenId.trim());
            return JSON.stringify({
              success: true,
              tokenId: tokenId,
              tokenInfo: info,
              message: `Retrieved info for token ${tokenId}`,
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error.message,
            });
          }
        },
      })
    );
  }

  /**
   * Initialize the HTS agent with specialized tools
   */
  async initialize(): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a specialized Hedera Token Service (HTS) agent.
        
        Your capabilities include:
        - Creating fungible tokens and NFT collections
        - Minting tokens and NFTs with metadata
        - Transferring tokens and NFTs between accounts
        - Managing HBAR transfers
        - Retrieving account balances and token information
        
        You are particularly focused on:
        - VeriChainX authenticity certificates as NFTs
        - Supply chain token tracking
        - Product verification badges
        - Reward tokens for verified products
        
        Always provide clear explanations of HTS operations and their implications for tokenomics.
        Ensure all operations are optimized for the {network} network.
        
        When handling requests, use the appropriate HTS tools and provide structured responses.
        Be careful with token transfers and always verify recipient accounts.`,
      ],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    const agent = await createToolCallingAgent({
      llm: this.llm as any,
      tools: this.tools as any,
      prompt: prompt as any,
    });

    this.agentExecutor = new AgentExecutor({
      agent,
      tools: this.tools as any,
      verbose: true,
      maxIterations: 3,
    });

    console.log('🎫 HTS Agent initialized successfully');
  }

  /**
   * Execute HTS operation via natural language
   */
  async executeOperation(request: string): Promise<HtsOperation> {
    if (!this.agentExecutor) {
      await this.initialize();
    }

    try {
      const result = await this.agentExecutor!.invoke({
        input: request,
        network: this.network,
      });

      return {
        success: true,
        message: result.output,
        details: {
          intermediateSteps: result.intermediateSteps,
          network: this.network,
          agent: 'HTS',
        },
      };
    } catch (error) {
      console.error('HTS operation error:', error);
      return {
        success: false,
        message: `HTS operation failed: ${error.message}`,
      };
    }
  }

  /**
   * Direct HTS operations (non-LLM)
   */
  async createFungibleToken(
    name: string,
    symbol: string,
    decimals: number,
    initialSupply: number
  ): Promise<HtsOperation> {
    try {
      const result = await this.agentKit.createToken(name, symbol, decimals, initialSupply);
      return {
        success: true,
        tokenId: result.tokenId,
        transactionId: result.transactionId,
        message: `Fungible token created: ${result.tokenId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create fungible token: ${error.message}`,
      };
    }
  }

  async createNftCollection(name: string, symbol: string): Promise<HtsOperation> {
    try {
      const result = await this.agentKit.createToken(name, symbol, 0, 0);
      return {
        success: true,
        tokenId: result.tokenId,
        transactionId: result.transactionId,
        message: `NFT collection created: ${result.tokenId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create NFT collection: ${error.message}`,
      };
    }
  }

  async mintNft(tokenId: string, metadata: any): Promise<HtsOperation> {
    try {
      const result = await this.agentKit.mintNFT(tokenId, metadata);
      return {
        success: true,
        tokenId: tokenId,
        transactionId: result.transactionId,
        serialNumber: result.serialNumber,
        message: `NFT minted with serial ${result.serialNumber}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to mint NFT: ${error.message}`,
      };
    }
  }

  async transferToken(
    tokenId: string,
    toAccountId: string,
    amount: number
  ): Promise<HtsOperation> {
    try {
      const result = await this.agentKit.transferToken(tokenId, toAccountId, amount);
      return {
        success: true,
        tokenId: tokenId,
        transactionId: result.transactionId,
        amount: amount,
        message: `Transferred ${amount} tokens to ${toAccountId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to transfer tokens: ${error.message}`,
      };
    }
  }

  /**
   * Get available HTS tools
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Get agent status
   */
  getStatus(): { network: string; accountId: string; ready: boolean } {
    return {
      network: this.network,
      accountId: this.accountId,
      ready: this.agentExecutor !== null,
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

  transferHbar: z.object({
    toAccountId: z.string().regex(/^0\.0\.\d+$/),
    amount: z.number().positive(),
  }),

  getTokenBalance: z.object({
    accountId: z.string().regex(/^0\.0\.\d+$/),
    tokenId: z.string().regex(/^0\.0\.\d+$/).optional(),
  }),
};