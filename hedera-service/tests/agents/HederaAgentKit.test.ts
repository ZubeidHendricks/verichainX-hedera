/**
 * Tests for the Hedera Agent Kit (v3) integration.
 */

// Mock the Hedera SDK so the agent constructor doesn't touch the network.
jest.mock('@hashgraph/sdk', () => {
  const client = { setOperator: jest.fn() };
  return {
    Client: { forTestnet: jest.fn(() => client), forMainnet: jest.fn(() => client) },
    PrivateKey: { fromString: jest.fn(() => ({ publicKey: 'mock-public-key' })) },
  };
});

// Mock hedera-agent-kit v3: the toolkit exposes getTools().
const fakeTools = [
  { name: 'create_topic', description: 'Create an HCS topic for consensus messages.' },
  { name: 'submit_topic_message', description: 'Submit a message to an HCS topic.' },
  { name: 'create_fungible_token', description: 'Create a fungible HTS token.' },
  { name: 'transfer_hbar', description: 'Transfer HBAR between accounts.' },
  { name: 'get_account_balance', description: 'Get the HBAR/token balance for an account.' },
];
jest.mock('hedera-agent-kit', () => ({
  HederaLangchainToolkit: jest.fn().mockImplementation(() => ({
    getTools: () => fakeTools,
  })),
  AgentMode: { AUTONOMOUS: 'autonomous', RETURN_BYTES: 'returnBytes' },
  coreHTSPlugin: {},
  coreConsensusPlugin: {},
  coreAccountPlugin: {},
  coreQueriesPlugin: {},
}));

// Mock the langchain agent factory.
const mockInvoke = jest.fn();
jest.mock('langchain', () => ({
  createAgent: jest.fn(() => ({ invoke: mockInvoke })),
}));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));

import { HederaLangChainAgent, createHederaAgent } from '../../src/agents/HederaAgentKit';

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
    it('should expose the Hedera toolkit tools', () => {
      const tools = agent.getAvailableTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.name === 'create_topic')).toBe(true);
      expect(tools.some(t => t.name === 'transfer_hbar')).toBe(true);
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
      await agent.initializeAgent();
    });

    it('should be ready after initialization', () => {
      expect(agent.isReady()).toBe(true);
    });

    it('should process successful requests', async () => {
      mockInvoke.mockResolvedValue({
        messages: [{ content: 'Successfully created topic with ID 0.0.123456' }],
      });

      const result = await agent.processRequest('Create a topic for logging product authenticity');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully created topic');
    });

    it('should handle processing errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Processing failed'));

      const result = await agent.processRequest('Invalid request');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to process request');
    });
  });

  describe('configuration handling', () => {
    it('should construct without an explicit OpenAI key (env fallback)', () => {
      const configWithoutKey: any = { ...mockConfig };
      delete configWithoutKey.openaiApiKey;
      const agentWithoutKey = createHederaAgent(configWithoutKey);
      expect(agentWithoutKey).toBeInstanceOf(HederaLangChainAgent);
    });
  });
});

describe('Tool validation schemas', () => {
  const { schemas } = require('../../src/agents/HederaAgentKit');

  describe('createTopic schema', () => {
    it('should validate valid topic creation', () => {
      const result = schemas.createTopic.safeParse({ memo: 'Product authenticity log' });
      expect(result.success).toBe(true);
    });

    it('should reject empty memo', () => {
      const result = schemas.createTopic.safeParse({ memo: '' });
      expect(result.success).toBe(false);
    });

    it('should reject oversized memo', () => {
      const result = schemas.createTopic.safeParse({ memo: 'a'.repeat(101) });
      expect(result.success).toBe(false);
    });
  });

  describe('createToken schema', () => {
    it('should validate valid token creation', () => {
      const result = schemas.createToken.safeParse({
        name: 'VeriChain Token',
        symbol: 'VCT',
        decimals: 8,
        initialSupply: 1000000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid token parameters', () => {
      const result = schemas.createToken.safeParse({
        name: '',
        symbol: 'TOOLONGSYMBOL',
        decimals: -1,
        initialSupply: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('transferToken schema', () => {
    it('should validate valid token transfer', () => {
      const result = schemas.transferToken.safeParse({
        tokenId: '0.0.123456',
        toAccountId: '0.0.789012',
        amount: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative amounts', () => {
      const result = schemas.transferToken.safeParse({
        tokenId: '0.0.123456',
        toAccountId: '0.0.789012',
        amount: -50,
      });
      expect(result.success).toBe(false);
    });
  });
});
