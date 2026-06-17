/**
 * Tests for health endpoint.
 */

import request from 'supertest';
import express from 'express';
import { healthRoutes } from '../../src/routes/health';

describe('Health Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use('/health', healthRoutes);
  });

  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      services: {
        redis: 'connected',
        hedera: 'connected',
      },
    });

    expect(response.body.timestamp).toBeDefined();
    expect(response.body.version).toBeDefined();
    expect(response.body.environment).toBe('test');
  });

  it('stays live (200) and reports degraded deps when a dependency fails', async () => {
    // Mock Redis to fail — /health is a liveness probe, so it should still
    // return 200 but mark the dependency as unavailable (readiness in body).
    const mockError = new Error('Redis connection failed');
    const { getRedisClient } = require('../../src/config/redis');
    getRedisClient.mockReturnValueOnce({
      ping: jest.fn().mockRejectedValueOnce(mockError),
    });

    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.services.redis).toBe('unavailable');
    expect(response.body.timestamp).toBeDefined();
  });
});