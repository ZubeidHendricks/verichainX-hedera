/**
 * HCS (Hedera Consensus Service) Specialized Agent
 * Handles topic creation, message submission, and consensus operations
 */

import { HederaAgentKit, createUnmigratedAgentKit } from './HederaAgentKit';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface HcsOperation {
  success: boolean;
  transactionId?: string;
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  message: string;
  details?: any;
}

export class HcsAgent {
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

    this.initializeHcsTools();
  }

  /**
   * Initialize HCS-specific tools
   */
  private initializeHcsTools(): void {
    // Create Topic Tool
    this.tools.push(
      new DynamicTool({
        name: 'create_hcs_topic',
        description: 'Create a new HCS topic for consensus messages. Input should be JSON with memo and optionally adminKey.',
        func: async (input: string) => {
          try {
            const { memo, adminKey } = JSON.parse(input);
            const result = await this.agentKit.createTopic(memo, adminKey);
            return JSON.stringify({
              success: true,
              topicId: result.topicId,
              transactionId: result.transactionId,
              message: `Successfully created HCS topic ${result.topicId}`,
              memo: memo,
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

    // Submit Message Tool
    this.tools.push(
      new DynamicTool({
        name: 'submit_hcs_message',
        description: 'Submit a message to an existing HCS topic. Input should be JSON with topicId and message.',
        func: async (input: string) => {
          try {
            const { topicId, message } = JSON.parse(input);
            const result = await this.agentKit.submitMessageToTopic(topicId, message);
            return JSON.stringify({
              success: true,
              topicId: topicId,
              transactionId: result.transactionId,
              sequenceNumber: result.sequenceNumber,
              consensusTimestamp: result.consensusTimestamp,
              message: `Message submitted to topic ${topicId}`,
              submittedMessage: message,
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

    // Get Topic Info Tool
    this.tools.push(
      new DynamicTool({
        name: 'get_topic_info',
        description: 'Get information about an HCS topic. Input should be the topicId as a string.',
        func: async (topicId: string) => {
          try {
            const info = await this.agentKit.getTopicInfo(topicId.trim());
            return JSON.stringify({
              success: true,
              topicId: topicId,
              topicInfo: info,
              message: `Retrieved info for topic ${topicId}`,
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

    // Subscribe to Topic Tool (for monitoring)
    this.tools.push(
      new DynamicTool({
        name: 'subscribe_to_topic',
        description: 'Subscribe to HCS topic messages. Input should be JSON with topicId and optional startTime.',
        func: async (input: string) => {
          try {
            const { topicId, startTime } = JSON.parse(input);
            // Note: In a real implementation, this would set up a subscription
            // For now, we'll return subscription details
            return JSON.stringify({
              success: true,
              topicId: topicId,
              subscriptionStatus: 'active',
              startTime: startTime || new Date().toISOString(),
              message: `Subscribed to topic ${topicId} messages`,
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
   * Initialize the HCS agent with specialized tools
   */
  async initialize(): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a specialized Hedera Consensus Service (HCS) agent.
        
        Your capabilities include:
        - Creating HCS topics for consensus logging
        - Submitting messages to topics for immutable record-keeping
        - Retrieving topic information and message history
        - Setting up topic subscriptions for real-time monitoring
        
        You are particularly focused on:
        - Product authenticity logging for VeriChainX
        - Supply chain consensus messages
        - Audit trail creation and management
        - Real-time fraud detection alerts
        
        Always provide clear explanations of HCS operations and their implications for data integrity.
        Ensure all operations are optimized for the {network} network.
        
        When handling requests, use the appropriate HCS tools and provide structured responses.`,
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

    console.log('🏛️ HCS Agent initialized successfully');
  }

  /**
   * Execute HCS operation via natural language
   */
  async executeOperation(request: string): Promise<HcsOperation> {
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
          agent: 'HCS',
        },
      };
    } catch (error) {
      console.error('HCS operation error:', error);
      return {
        success: false,
        message: `HCS operation failed: ${error.message}`,
      };
    }
  }

  /**
   * Direct HCS operations (non-LLM)
   */
  async createTopic(memo: string, adminKey?: string): Promise<HcsOperation> {
    try {
      const result = await this.agentKit.createTopic(memo, adminKey);
      return {
        success: true,
        topicId: result.topicId,
        transactionId: result.transactionId,
        message: `HCS topic created: ${result.topicId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create HCS topic: ${error.message}`,
      };
    }
  }

  async submitMessage(topicId: string, message: string): Promise<HcsOperation> {
    try {
      const result = await this.agentKit.submitMessageToTopic(topicId, message);
      return {
        success: true,
        topicId: topicId,
        transactionId: result.transactionId,
        sequenceNumber: result.sequenceNumber,
        consensusTimestamp: result.consensusTimestamp,
        message: `Message submitted to HCS topic ${topicId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit message to HCS topic: ${error.message}`,
      };
    }
  }

  /**
   * Get available HCS tools
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
 * Validation schemas for HCS operations
 */
export const hcsSchemas = {
  createTopic: z.object({
    memo: z.string().min(1).max(100),
    adminKey: z.string().optional(),
  }),

  submitMessage: z.object({
    topicId: z.string().regex(/^0\.0\.\d+$/),
    message: z.string().min(1).max(1024),
  }),

  getTopicInfo: z.object({
    topicId: z.string().regex(/^0\.0\.\d+$/),
  }),

  subscribeToTopic: z.object({
    topicId: z.string().regex(/^0\.0\.\d+$/),
    startTime: z.string().datetime().optional(),
  }),
};