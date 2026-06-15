/**
 * Tests for Hedera Agent Kit integration
 */

import { HederaLangChainAgent, createHederaAgent } from '../../src/agents/HederaAgentKit';

// Mock the dependencies
jest.mock('hedera-agent-kit');
jest.mock('@langchain/openai');
jest.mock('langchain/agents');

describe('HederaLangChainAgent', () => {
  let agent: HederaLangChainAgent;
  const mockConfig = {
    accountId: '0.0.123456',
    privateKey: 'mock-private-key',
    network: 'testnet' as const,
    openaiApiKey: 'mock-openai-key',
    model: 'gpt-4o-mini',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    agent = createHederaAgent(mockConfig);
  });

  describe('initialization', () => {
    it('should create agent with valid configuration', () => {
      expect(agent).toBeInstanceOf(HederaLangChainAgent);
    });

    it('should return correct configuration', () => {
      const config = agent.getConfig();
      expect(config.accountId).toBe(mockConfig.accountId);
      expect(config.network).toBe(mockConfig.network);
      expect(config.model).toBe(mockConfig.model);
    });

    it('should not be ready before initialization', () => {
      expect(agent.isReady()).toBe(false);
    });
  });

  describe('tools', () => {
    it('should have all required tools available', () => {
      const tools = agent.getAvailableTools();
      
      const expectedTools = [
        'create_topic',
        'submit_message_to_topic',
        'create_token',
        'mint_token',
        'transfer_token',
        'get_account_balance',
        'transfer_hbar',
      ];

      expectedTools.forEach(toolName => {
        expect(tools.some(tool => tool.name === toolName)).toBe(true);
      });
    });

    it('should have descriptive tool descriptions', () => {
      const tools = agent.getAvailableTools();
      
      tools.forEach(tool => {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('natural language processing', () => {
    beforeEach(async () => {
      // Mock successful agent initialization
      const mockAgentExecutor = {
        invoke: jest.fn(),
      };
      
      // Mock the createToolCallingAgent function
      const { createToolCallingAgent } = require('langchain/agents');
      createToolCallingAgent.mockResolvedValue({});
      
      const { AgentExecutor } = require('langchain/agents');
      AgentExecutor.mockImplementation(() => mockAgentExecutor);
      
      await agent.initializeAgent();
    });

    it('should process successful requests', async () => {
      const mockAgentExecutor = require('langchain/agents').AgentExecutor();
      mockAgentExecutor.invoke.mockResolvedValue({
        output: 'Successfully created topic with ID 0.0.123456',
        intermediateSteps: [],
      });

      const result = await agent.processRequest('Create a topic for logging product authenticity');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully created topic');
    });

    it('should handle processing errors gracefully', async () => {
      const mockAgentExecutor = require('langchain/agents').AgentExecutor();
      mockAgentExecutor.invoke.mockRejectedValue(new Error('Processing failed'));

      const result = await agent.processRequest('Invalid request');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to process request');
    });

    it('should be ready after initialization', async () => {
      expect(agent.isReady()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing OpenAI API key', () => {
      const configWithoutKey: any = { ...mockConfig };
      delete configWithoutKey.openaiApiKey;
      
      // Should use environment variable fallback
      const agentWithoutKey = createHederaAgent(configWithoutKey);
      expect(agentWithoutKey).toBeInstanceOf(HederaLangChainAgent);
    });

    it('should handle invalid network configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        network: 'invalid' as any,
      };
      
      // Should still create agent (validation happens in Hedera SDK)
      const agentWithInvalidNetwork = createHederaAgent(invalidConfig);
      expect(agentWithInvalidNetwork).toBeInstanceOf(HederaLangChainAgent);
    });
  });
});

describe('Tool validation schemas', () => {
  const { schemas } = require('../../src/agents/HederaAgentKit');

  describe('createTopic schema', () => {
    it('should validate valid topic creation', () => {
      const validData = { memo: 'Product authenticity log' };
      const result = schemas.createTopic.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty memo', () => {
      const invalidData = { memo: '' };
      const result = schemas.createTopic.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject oversized memo', () => {
      const invalidData = { memo: 'a'.repeat(101) };
      const result = schemas.createTopic.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('createToken schema', () => {
    it('should validate valid token creation', () => {
      const validData = {
        name: 'VeriChain Token',
        symbol: 'VCT',
        decimals: 8,
        initialSupply: 1000000,
      };
      const result = schemas.createToken.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid token parameters', () => {
      const invalidData = {
        name: '',
        symbol: 'TOOLONGSYMBOL',
        decimals: -1,
        initialSupply: -100,
      };
      const result = schemas.createToken.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('transferToken schema', () => {
    it('should validate valid token transfer', () => {
      const validData = {
        tokenId: '0.0.123456',
        toAccountId: '0.0.789012',
        amount: 100,
      };
      const result = schemas.transferToken.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative amounts', () => {
      const invalidData = {
        tokenId: '0.0.123456',
        toAccountId: '0.0.789012',
        amount: -50,
      };
      const result = schemas.transferToken.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});