/**
 * Jest test setup for Hedera Agent Service.
 */

import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.HEDERA_NETWORK = 'testnet';
process.env.HEDERA_ACCOUNT_ID = '0.0.123456';
process.env.HEDERA_PRIVATE_KEY = '302e020100300506032b657004220420000000000000000000000000000000000000000000000000000000000000000000';
process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use different DB for tests
process.env.PORT = '3002';

// Mock Redis client for tests
jest.mock('../src/config/redis', () => ({
  connectRedis: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn().mockReturnValue({
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
  }),
  publishToChannel: jest.fn().mockResolvedValue(undefined),
  subscribeToChannel: jest.fn().mockResolvedValue(undefined),
}));

// Mock Hedera client for tests
jest.mock('../src/config/hedera', () => ({
  initializeHedera: jest.fn().mockResolvedValue(undefined),
  getHederaClient: jest.fn().mockReturnValue({
    // Minimal stub; Hedera SDK queries are mocked per-test where needed.
    execute: jest.fn().mockResolvedValue({}),
  }),
  checkHederaConnection: jest.fn().mockResolvedValue(true),
}));

// Global test timeout
jest.setTimeout(10000);