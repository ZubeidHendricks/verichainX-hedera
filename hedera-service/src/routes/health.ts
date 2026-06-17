import { Router, Request, Response } from 'express';
import { getRedisClient } from '../config/redis';
import { checkHederaConnection } from '../config/hedera';

const router = Router();

// Liveness + status probe. Always 200 while the process is up so platform health
// checks pass even before Redis/Hedera are configured; dependency state is
// reported in the body (readiness), not via the HTTP status code.
router.get('/', async (req: Request, res: Response) => {
  let redisStatus = 'disconnected';
  try {
    await getRedisClient().ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'unavailable';
  }

  let hederaStatus = 'disconnected';
  try {
    hederaStatus = (await checkHederaConnection()) ? 'connected' : 'disconnected';
  } catch {
    hederaStatus = 'unavailable';
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      redis: redisStatus,
      hedera: hederaStatus,
    },
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

export { router as healthRoutes };
