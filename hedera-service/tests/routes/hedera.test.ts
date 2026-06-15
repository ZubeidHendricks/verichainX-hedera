/**
 * Tests for Hedera routes.
 */

import request from 'supertest';
import express from 'express';

// Mock the Hedera test helpers so route tests don't need a live Hedera node.
jest.mock('../../src/utils/hederaTest', () => ({
  testHederaConnection: jest.fn().mockResolvedValue({
    success: true,
    account_id: '0.0.123456',
    balance: '100 ℏ',
    network: 'testnet',
  }),
  createTestTransaction: jest.fn().mockResolvedValue({
    success: true,
    transaction_id: 'mock-transaction-id-for-testing',
  }),
}));

import { hederaRoutes } from '../../src/routes/hedera';

describe('Hedera Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/hedera', hederaRoutes);
  });

  describe('POST /ping', () => {
    it('should respond to ping with pong', async () => {
      const pingData = {
        message: 'test ping',
        source: 'test-client'
      };

      const response = await request(app)
        .post('/api/v1/hedera/ping')
        .send(pingData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        response: 'pong',
        received_from: 'test-client',
      });

      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle ping errors gracefully', async () => {
      // Mock publishToChannel to fail
      const { publishToChannel } = require('../../src/config/redis');
      publishToChannel.mockRejectedValueOnce(new Error('Redis publish failed'));

      const response = await request(app)
        .post('/api/v1/hedera/ping')
        .send({ message: 'test', source: 'test' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Redis publish failed',
      });
    });
  });

  describe('GET /status', () => {
    it('should return Hedera status', async () => {
      const response = await request(app)
        .get('/api/v1/hedera/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        network: 'testnet',
        account_id: '0.0.123456',
        client_status: 'connected',
      });

      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /test-connection', () => {
    it('should test Hedera connection successfully', async () => {
      const response = await request(app)
        .get('/api/v1/hedera/test-connection')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        network: 'testnet',
        account_id: '0.0.123456',
      });
    });
  });

  describe('POST /test-transaction', () => {
    it('should create test transaction', async () => {
      const response = await request(app)
        .post('/api/v1/hedera/test-transaction')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        transaction_id: 'mock-transaction-id-for-testing',
      });
    });
  });
});