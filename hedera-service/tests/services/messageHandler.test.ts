/**
 * Tests for MessageHandler service.
 */

import { MessageHandler } from '../../src/services/messageHandler';

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
    jest.clearAllMocks();
  });

  describe('startListening', () => {
    it('should start listening to Redis channels', async () => {
      const { getRedisClient } = require('../../src/config/redis');
      const mockSubscribe = jest.fn().mockResolvedValue(undefined);
      getRedisClient.mockReturnValue({
        subscribe: mockSubscribe,
      });

      await messageHandler.startListening();

      expect(mockSubscribe).toHaveBeenCalledWith(
        'hedera.agent.commands',
        expect.any(Function)
      );
    });

    it('should not start listening if already listening', async () => {
      const { getRedisClient } = require('../../src/config/redis');
      const mockSubscribe = jest.fn().mockResolvedValue(undefined);
      getRedisClient.mockReturnValue({
        subscribe: mockSubscribe,
      });

      // Start listening first time — subscribes to the 3 command channels
      await messageHandler.startListening();
      expect(mockSubscribe).toHaveBeenCalledTimes(3);

      // Try to start again — guarded by isListening, so no new subscriptions
      await messageHandler.startListening();
      expect(mockSubscribe).toHaveBeenCalledTimes(3); // Should not subscribe again
    });
  });

  describe('message handling', () => {
    it('should handle ping messages correctly', async () => {
      const { publishToChannel } = require('../../src/config/redis');
      publishToChannel.mockResolvedValue(undefined);

      const pingMessage = JSON.stringify({
        type: 'ping',
        source: 'python-service',
        correlation_id: 'test-123',
        payload: { message: 'ping' },
        timestamp: '2025-08-04T00:00:00Z',
      });

      // Access private method through reflection for testing
      await (messageHandler as any).handleMessage(pingMessage);

      expect(publishToChannel).toHaveBeenCalledWith(
        'hedera.agent.responses',
        expect.objectContaining({
          type: 'ping_response',
          source: 'hedera-service',
          correlation_id: 'test-123',
          payload: expect.objectContaining({
            message: 'pong from TypeScript service',
          }),
        })
      );
    });

    it('should handle test_connection messages', async () => {
      const { publishToChannel } = require('../../src/config/redis');
      publishToChannel.mockResolvedValue(undefined);

      const testMessage = JSON.stringify({
        type: 'test_connection',
        source: 'python-service',
        correlation_id: 'test-456',
        payload: {},
        timestamp: '2025-08-04T00:00:00Z',
      });

      await (messageHandler as any).handleMessage(testMessage);

      expect(publishToChannel).toHaveBeenCalledWith(
        'hedera.agent.responses',
        expect.objectContaining({
          type: 'test_connection_response',
          payload: expect.objectContaining({
            success: true,
            network: 'testnet',
            account_id: '0.0.123456',
            status: 'connected',
          }),
        })
      );
    });

    it('should handle unknown message types gracefully', async () => {
      const { publishToChannel } = require('../../src/config/redis');
      publishToChannel.mockResolvedValue(undefined);

      const unknownMessage = JSON.stringify({
        type: 'unknown_type',
        source: 'python-service',
        correlation_id: 'test-789',
        payload: {},
        timestamp: '2025-08-04T00:00:00Z',
      });

      await (messageHandler as any).handleMessage(unknownMessage);

      expect(publishToChannel).toHaveBeenCalledWith(
        'hedera.agent.responses',
        expect.objectContaining({
          type: 'error_response',
          payload: expect.objectContaining({
            success: false,
            error: 'Unknown message type: unknown_type',
          }),
        })
      );
    });

    it('should handle malformed JSON messages', async () => {
      const { publishToChannel } = require('../../src/config/redis');
      publishToChannel.mockResolvedValue(undefined);

      const malformedMessage = 'invalid json {';

      // Should not throw
      await (messageHandler as any).handleMessage(malformedMessage);

      // Should not call publishToChannel since message can't be parsed
      expect(publishToChannel).not.toHaveBeenCalled();
    });
  });
});