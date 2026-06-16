/**
 * HCS (Hedera Consensus Service) Specialized Agent
 *
 * Performs HCS operations programmatically against the Hedera network using the
 * official @hashgraph/sdk. These are deterministic blockchain calls (no LLM) —
 * the natural-language path lives in HederaLangChainAgent (HederaAgentKit.ts).
 */

import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfoQuery,
} from '@hashgraph/sdk';
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
  private client: Client | null = null;

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
    client.setOperator(this.accountId, PrivateKey.fromString(this.privateKey));
    this.client = client;
    console.log(`🏛️ HCS Agent initialized on ${this.network}`);
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('HCS agent not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Create a new HCS topic.
   */
  async createTopic(memo: string, adminKey?: string): Promise<HcsOperation> {
    try {
      const client = this.requireClient();
      let tx = new TopicCreateTransaction().setTopicMemo(memo);
      if (adminKey) {
        tx = tx.setAdminKey(PrivateKey.fromString(adminKey).publicKey);
      }
      const response = await tx.execute(client);
      const receipt = await response.getReceipt(client);

      return {
        success: true,
        topicId: receipt.topicId?.toString(),
        transactionId: response.transactionId.toString(),
        message: `HCS topic created: ${receipt.topicId?.toString()}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create HCS topic: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Submit a message to an existing HCS topic.
   */
  async submitMessage(topicId: string, message: string): Promise<HcsOperation> {
    try {
      const client = this.requireClient();
      const response = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .execute(client);
      const receipt = await response.getReceipt(client);

      return {
        success: true,
        topicId,
        transactionId: response.transactionId.toString(),
        sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
        message: `Message submitted to HCS topic ${topicId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit message to HCS topic: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Look up information about an HCS topic.
   */
  async getTopicInfo(topicId: string): Promise<HcsOperation> {
    try {
      const client = this.requireClient();
      const info = await new TopicInfoQuery().setTopicId(topicId.trim()).execute(client);
      return {
        success: true,
        topicId,
        message: `Retrieved info for topic ${topicId}`,
        details: {
          memo: info.topicMemo,
          sequenceNumber: info.sequenceNumber?.toString(),
          runningHash: info.runningHash ? Buffer.from(info.runningHash).toString('hex') : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get topic info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Generic entry point used by the tool-calling service for custom HCS requests.
   * Structured operations should use the specific methods above; free-form
   * natural-language requests should go through HederaLangChainAgent.
   */
  async executeOperation(request: string): Promise<HcsOperation> {
    return {
      success: false,
      message:
        'Free-form HCS requests are handled by the natural-language agent. ' +
        'Use createTopic/submitMessage/getTopicInfo for direct operations.',
      details: { request, network: this.network, agent: 'HCS' },
    };
  }

  /**
   * Operations this agent supports (for status/introspection).
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    return [
      { name: 'create_hcs_topic', description: 'Create a new HCS topic for consensus messages.' },
      { name: 'submit_hcs_message', description: 'Submit a message to an existing HCS topic.' },
      { name: 'get_topic_info', description: 'Get information about an HCS topic.' },
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
};
