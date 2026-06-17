import { Router, Request, Response } from 'express';
import { getHederaClient } from '../config/hedera';
import { publishToChannel } from '../config/redis';
import { testHederaConnection, createTestTransaction } from '../utils/hederaTest';
import { HcsAgent } from '../agents/HcsAgent';

const router = Router();

const HEDERA_NETWORK = (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet';

function looksUnset(value?: string): boolean {
  return !value || value.includes('REPLACE') || value.includes('demo');
}

// Lazily-initialised HCS agent (needs real operator credentials).
let _hcsAgent: HcsAgent | null = null;
async function getHcsAgent(): Promise<HcsAgent> {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (looksUnset(accountId) || looksUnset(privateKey)) {
    throw new Error(
      'Hedera operator credentials not configured. Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY.'
    );
  }
  if (!_hcsAgent) {
    _hcsAgent = new HcsAgent(accountId as string, privateKey as string, HEDERA_NETWORK);
    await _hcsAgent.initialize();
  }
  return _hcsAgent;
}

const hashscan = (kind: string, id?: string) =>
  id ? `https://hashscan.io/${HEDERA_NETWORK}/${kind}/${id}` : undefined;

// Basic ping-pong test endpoint for cross-service communication
router.post('/ping', async (req: Request, res: Response) => {
  try {
    const { message, source } = req.body;

    // Log the ping request
    console.log(`Received ping from ${source}: ${message}`);

    // Publish response to Redis channel for Python service
    await publishToChannel('hedera.agent.responses', {
      type: 'ping_response',
      message: 'pong',
      source: 'hedera-service',
      timestamp: new Date().toISOString(),
      original_message: message,
    });

    res.json({
      success: true,
      response: 'pong',
      timestamp: new Date().toISOString(),
      received_from: source,
    });
  } catch (error) {
    console.error('Ping endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Hedera connection test endpoint
router.get('/status', async (req: Request, res: Response) => {
  try {
    const client = getHederaClient();
    const accountId = process.env.HEDERA_ACCOUNT_ID;

    res.json({
      success: true,
      network: process.env.HEDERA_NETWORK || 'testnet',
      account_id: accountId,
      client_status: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Hedera status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Hedera client not available',
    });
  }
});

// Hedera SDK connectivity test endpoint
router.get('/test-connection', async (req: Request, res: Response) => {
  try {
    const result = await testHederaConnection();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Hedera connection test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
});

// Mock transaction test endpoint
router.post('/test-transaction', async (req: Request, res: Response) => {
  try {
    const result = await createTestTransaction();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Test transaction error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Test transaction failed',
    });
  }
});

// Anchor an authenticity verdict to a Hedera Consensus Service topic.
// Creates a topic on first use (or reuses HEDERA_TOPIC_ID / the provided topicId),
// submits the verdict as an immutable consensus message, and returns the real
// sequence number + HashScan link. Requires operator credentials.
router.post('/anchor', async (req: Request, res: Response) => {
  try {
    const { productId, productName, verdict, score, topicId } = req.body || {};
    const agent = await getHcsAgent();

    let useTopicId: string | undefined = topicId || process.env.HEDERA_TOPIC_ID;
    if (!useTopicId) {
      const created = await agent.createTopic('VeriChainX authenticity verification log');
      if (!created.success || !created.topicId) {
        return res.status(502).json({ success: false, error: created.message });
      }
      useTopicId = created.topicId;
    }

    const message = JSON.stringify({
      type: 'authenticity_verification',
      productId: productId ?? null,
      productName: productName ?? null,
      verdict: verdict ?? null,
      score: score ?? null,
      timestamp: new Date().toISOString(),
    });

    const result = await agent.submitMessage(useTopicId, message);
    if (!result.success) {
      return res.status(502).json({ success: false, error: result.message });
    }

    return res.json({
      success: true,
      topicId: useTopicId,
      sequenceNumber: result.sequenceNumber,
      transactionId: result.transactionId,
      consensusTimestamp: result.consensusTimestamp,
      explorerUrl: hashscan('topic', useTopicId),
      network: HEDERA_NETWORK,
    });
  } catch (error) {
    // 503: feature requires credentials that aren't configured yet.
    return res.status(503).json({
      success: false,
      error: error instanceof Error ? error.message : 'Anchor failed',
    });
  }
});

export { router as hederaRoutes };