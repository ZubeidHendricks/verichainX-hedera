/**
 * Hedera Agent Kit Integration with LangChain
 * Provides natural language interface for Hedera blockchain operations
 */

// NOTE: hedera-agent-kit v3.x redesigned its API (HederaLangchainToolkit + plugins).
// These agents target the legacy HederaAgentKit class API and are pending migration to v3.
// Shimmed so the service compiles and runs; the natural-language agent path throws a clear
// error at runtime until migrated.
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicTool } from '@langchain/core/tools';

/** Legacy agent-kit client type, re-exported for dependent agents until the v3 migration lands. */
export type HederaAgentKit = any;

/** Placeholder for the legacy agent-kit client; surfaces a clear error if invoked pre-migration. */
export const createUnmigratedAgentKit = (..._args: any[]): any =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `hedera-agent-kit v3 migration pending: '${String(prop)}' is not wired to the new toolkit API yet.`
        );
      },
    }
  );
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export interface HederaAgentConfig {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  openaiApiKey?: string;
  model?: string;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  message: string;
  details?: any;
}

export class HederaLangChainAgent {
  private agentKit: any;
  private llm: ChatOpenAI;
  private agentExecutor: AgentExecutor | null = null;
  private tools: DynamicTool[] = [];

  constructor(private config: HederaAgentConfig) {
    // Initialize Hedera Agent Kit (legacy API — stubbed pending v3 migration)
    this.agentKit = createUnmigratedAgentKit({
      accountId: config.accountId,
      privateKey: config.privateKey,
      network: config.network,
    });

    // Initialize LangChain LLM
    this.llm = new ChatOpenAI({
      apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      model: config.model || 'gpt-4o-mini',
      temperature: 0.1,
    });

    this.initializeTools();
  }

  /**
   * Initialize LangChain tools for Hedera operations
   */
  private initializeTools(): void {
    // HCS (Hedera Consensus Service) Tools
    this.tools.push(
      new DynamicTool({
        name: 'create_topic',
        description: 'Create a new HCS topic for consensus messages. Input should be a topic memo/description.',
        func: async (memo: string) => {
          try {
            const result = await this.agentKit.createTopic(memo);
            return JSON.stringify({
              success: true,
              topicId: result.topicId,
              message: `Created topic ${result.topicId} with memo: ${memo}`,
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

    this.tools.push(
      new DynamicTool({
        name: 'submit_message_to_topic',
        description: 'Submit a message to an HCS topic. Input should be JSON with topicId and message.',
        func: async (input: string) => {
          try {
            const { topicId, message } = JSON.parse(input);
            const result = await this.agentKit.submitMessageToTopic(topicId, message);
            return JSON.stringify({
              success: true,
              transactionId: result.transactionId,
              message: `Message submitted to topic ${topicId}`,
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

    // HTS (Hedera Token Service) Tools
    this.tools.push(
      new DynamicTool({
        name: 'create_token',
        description: 'Create a new HTS token. Input should be JSON with name, symbol, decimals, and initialSupply.',
        func: async (input: string) => {
          try {
            const { name, symbol, decimals, initialSupply } = JSON.parse(input);
            const result = await this.agentKit.createToken(name, symbol, decimals, initialSupply);
            return JSON.stringify({
              success: true,
              tokenId: result.tokenId,
              message: `Created token ${symbol} (${name}) with ID ${result.tokenId}`,
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

    this.tools.push(
      new DynamicTool({
        name: 'mint_token',
        description: 'Mint additional tokens. Input should be JSON with tokenId and amount.',
        func: async (input: string) => {
          try {
            const { tokenId, amount } = JSON.parse(input);
            const result = await this.agentKit.mintToken(tokenId, amount);
            return JSON.stringify({
              success: true,
              transactionId: result.transactionId,
              message: `Minted ${amount} tokens for ${tokenId}`,
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

    this.tools.push(
      new DynamicTool({
        name: 'transfer_token',
        description: 'Transfer tokens between accounts. Input should be JSON with tokenId, toAccountId, and amount.',
        func: async (input: string) => {
          try {
            const { tokenId, toAccountId, amount } = JSON.parse(input);
            const result = await this.agentKit.transferToken(tokenId, toAccountId, amount);
            return JSON.stringify({
              success: true,
              transactionId: result.transactionId,
              message: `Transferred ${amount} of ${tokenId} to ${toAccountId}`,
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

    // Account and Balance Tools
    this.tools.push(
      new DynamicTool({
        name: 'get_account_balance',
        description: 'Get account balance for HBAR and tokens. Input should be accountId.',
        func: async (accountId: string) => {
          try {
            const balance = await this.agentKit.getAccountBalance(accountId);
            return JSON.stringify({
              success: true,
              accountId,
              balance: balance.hbars.toString(),
              tokens: balance.tokens || {},
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
              message: `Transferred ${amount} HBAR to ${toAccountId}`,
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
   * Initialize the LangChain agent with tools
   */
  async initializeAgent(): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful assistant that can interact with the Hedera blockchain.
        You have access to tools for:
        - Creating and managing HCS topics
        - Submitting messages to consensus
        - Creating and managing HTS tokens
        - Transferring HBAR and tokens
        - Checking account balances
        
        Always be careful with financial operations and ask for confirmation for high-value transactions.
        Provide clear explanations of what each operation does and its implications.
        
        When users ask to perform blockchain operations, use the appropriate tools.
        Always return structured responses with success status and relevant details.`,
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
  }

  /**
   * Process natural language request for blockchain operations
   */
  async processRequest(request: string): Promise<TransactionResult> {
    if (!this.agentExecutor) {
      await this.initializeAgent();
    }

    try {
      const result = await this.agentExecutor!.invoke({
        input: request,
      });

      return {
        success: true,
        message: result.output,
        details: {
          intermediateSteps: result.intermediateSteps,
        },
      };
    } catch (error) {
      console.error('Agent processing error:', error);
      return {
        success: false,
        message: `Failed to process request: ${error.message}`,
      };
    }
  }

  /**
   * Get available tools information
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Get current agent configuration
   */
  getConfig(): Partial<HederaAgentConfig> {
    return {
      accountId: this.config.accountId,
      network: this.config.network,
      model: this.config.model || 'gpt-4o-mini',
    };
  }

  /**
   * Check if agent is ready
   */
  isReady(): boolean {
    return this.agentExecutor !== null;
  }
}

/**
 * Factory function to create Hedera LangChain Agent
 */
export function createHederaAgent(config: HederaAgentConfig): HederaLangChainAgent {
  return new HederaLangChainAgent(config);
}

/**
 * Validation schemas for agent operations
 */
export const schemas = {
  createTopic: z.object({
    memo: z.string().min(1).max(100),
  }),
  
  submitMessage: z.object({
    topicId: z.string(),
    message: z.string().max(1024),
  }),
  
  createToken: z.object({
    name: z.string().min(1).max(100),
    symbol: z.string().min(1).max(10),
    decimals: z.number().min(0).max(18),
    initialSupply: z.number().min(0),
  }),
  
  transferToken: z.object({
    tokenId: z.string(),
    toAccountId: z.string(),
    amount: z.number().positive(),
  }),
  
  transferHbar: z.object({
    toAccountId: z.string(),
    amount: z.number().positive(),
  }),
};