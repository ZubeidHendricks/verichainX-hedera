import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler';
import { hederaRoutes } from './routes/hedera';
import { healthRoutes } from './routes/health';
import { connectRedis } from './config/redis';
import { initializeHedera } from './config/hedera';
import { messageHandler } from './services/messageHandler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/hedera', hederaRoutes);

// Error handling
app.use(errorHandler);

// Startup function.
//
// Redis and Hedera are treated as OPTIONAL at boot: if they aren't configured
// yet (e.g. before credentials/Redis are provisioned), we log and continue so
// the HTTP server still starts and passes health checks. The features that need
// them surface a clear error when invoked.
async function startServer() {
  // Redis (pub/sub for the agent message bus) — optional.
  try {
    await connectRedis();
    console.log('✅ Redis connected successfully');
    await messageHandler.startListening();
    console.log('✅ Redis message handler started');
  } catch (error) {
    console.warn('⚠️  Redis unavailable — agent message bus disabled:', error instanceof Error ? error.message : error);
  }

  // Hedera operator client — optional (needed for signing on-chain txs).
  try {
    await initializeHedera();
    console.log('✅ Hedera client initialized');
  } catch (error) {
    console.warn('⚠️  Hedera client not initialized — set HEDERA_ACCOUNT_ID/HEDERA_PRIVATE_KEY:', error instanceof Error ? error.message : error);
  }

  // Always start the HTTP server so /health stays available.
  app.listen(PORT, () => {
    console.log(`🚀 Hedera Agent Service running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Network: ${process.env.HEDERA_NETWORK}`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Shutting down gracefully...');
  process.exit(0);
});

startServer();