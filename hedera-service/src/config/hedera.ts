import { Client, AccountId, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';

let hederaClient: Client;

export async function initializeHedera(): Promise<void> {
  const network = process.env.HEDERA_NETWORK || 'testnet';
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    throw new Error('Hedera credentials not configured. Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY');
  }

  try {
    // Create client for testnet or mainnet
    if (network === 'testnet') {
      hederaClient = Client.forTestnet();
    } else if (network === 'mainnet') {
      hederaClient = Client.forMainnet();
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Set operator
    hederaClient.setOperator(
      AccountId.fromString(accountId),
      PrivateKey.fromString(privateKey)
    );

    console.log(`Hedera client initialized for ${network}`);
    console.log(`Operator Account ID: ${accountId}`);
  } catch (error) {
    console.error('Failed to initialize Hedera client:', error);
    throw error;
  }
}

export function getHederaClient(): Client {
  if (!hederaClient) {
    throw new Error('Hedera client not initialized. Call initializeHedera() first.');
  }
  return hederaClient;
}

export async function checkHederaConnection(): Promise<boolean> {
  try {
    const accountId = process.env.HEDERA_ACCOUNT_ID;

    // Not configured (or still the deploy placeholder) — report disconnected
    // quietly instead of throwing on every health probe.
    if (!accountId || accountId.includes('REPLACE') || accountId.includes('demo')) {
      return false;
    }

    const client = getHederaClient();

    // Simple balance query to test connection
    await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(client);
    return true;
  } catch (error) {
    console.error('Hedera connection check failed:', error instanceof Error ? error.message : error);
    return false;
  }
}