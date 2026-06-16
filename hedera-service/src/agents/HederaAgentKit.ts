/**
 * Hedera Agent Kit integration — natural-language interface for Hedera operations.
 *
 * Uses hedera-agent-kit v3's HederaLangchainToolkit (HTS / HCS / account / query
 * plugins) together with a langchain tool-calling agent so users can drive Hedera
 * with plain English ("create a topic", "what's my balance?", ...).
 */

import { Client, PrivateKey } from '@hashgraph/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import {
  HederaLangchainToolkit,
  AgentMode,
  coreHTSPlugin,
  coreConsensusPlugin,
  coreAccountPlugin,
  coreQueriesPlugin,
} from 'hedera-agent-kit';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Backwards-compatible alias retained for the DeFi/AMM/Bridge/SmartContract agents
 * that reference the agent-kit type. The concrete client is the @hashgraph/sdk Client.
 */
export type HederaAgentKit = any;

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
  private client: Client;
  private toolkit: HederaLangchainToolkit;
  private tools: any[];
  private agent: any = null;

  constructor(private config: HederaAgentConfig) {
    // Hedera client / operator
    this.client = (config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet());
    this.client.setOperator(config.accountId, PrivateKey.fromString(config.privateKey));

    // Hedera Agent Kit toolkit with the core plugins (HTS, HCS, account, queries)
    this.toolkit = new HederaLangchainToolkit({
      // Cast bridges the duplicate @hashgraph/sdk copy bundled by hedera-agent-kit
      // (2.80.0) vs the project's (2.81.0); they are runtime-compatible.
      client: this.client as any,
      configuration: {
        plugins: [coreHTSPlugin, coreConsensusPlugin, coreAccountPlugin, coreQueriesPlugin],
        context: {
          mode: AgentMode.AUTONOMOUS,
          accountId: config.accountId,
        },
      },
    });
    this.tools = this.toolkit.getTools();
  }

  /**
   * Build the langchain agent over the Hedera tools.
   */
  async initializeAgent(): Promise<void> {
    const apiKey = this.config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured for the Hedera agent.');
    }

    const llm = new ChatOpenAI({
      apiKey,
      model: this.config.model || 'gpt-4o-mini',
      temperature: 0.1,
    });

    this.agent = createAgent({
      model: llm,
      tools: this.tools,
      systemPrompt:
        'You are a helpful assistant that can interact with the Hedera blockchain ' +
        '(HTS tokens, HCS topics, HBAR transfers, account balances). Be careful with ' +
        'financial operations, explain what each action does, and return clear, ' +
        'structured results.',
    });
  }

  /**
   * Process a natural-language request and return a structured result.
   */
  async processRequest(request: string): Promise<TransactionResult> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    try {
      const response = await this.agent.invoke({
        messages: [{ role: 'user', content: request }],
      });

      const messages = response?.messages || [];
      const last = messages[messages.length - 1];
      const output =
        last == null
          ? ''
          : typeof last.content === 'string'
          ? last.content
          : JSON.stringify(last.content);

      return {
        success: true,
        message: output,
        details: { messageCount: messages.length },
      };
    } catch (error) {
      console.error('Agent processing error:', error);
      return {
        success: false,
        message: `Failed to process request: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * List the Hedera tools available to the agent.
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    return this.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  getConfig(): Partial<HederaAgentConfig> {
    return {
      accountId: this.config.accountId,
      network: this.config.network,
      model: this.config.model || 'gpt-4o-mini',
    };
  }

  isReady(): boolean {
    return this.agent !== null;
  }
}

/**
 * Factory function to create a Hedera LangChain agent.
 */
export function createHederaAgent(config: HederaAgentConfig): HederaLangChainAgent {
  return new HederaLangChainAgent(config);
}

/**
 * Validation schemas for agent operations.
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
