/**
 * End-to-end smoke test for the Hedera agents.
 *
 * Safe to run anytime: with no credentials it prints setup instructions and exits 0.
 * With HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY (and OPENAI_API_KEY for the NL agent),
 * it performs real testnet operations:
 *   1. HcsAgent: create a topic + submit a message
 *   2. HtsAgent: create a fungible token
 *   3. HederaLangChainAgent: answer a natural-language balance query
 *
 * Usage:
 *   HEDERA_ACCOUNT_ID=0.0.x HEDERA_PRIVATE_KEY=302e... OPENAI_API_KEY=sk-... \
 *     npm run smoke:agents
 */

import dotenv from 'dotenv';
import { HcsAgent } from '../src/agents/HcsAgent';
import { HtsAgent } from '../src/agents/HtsAgent';
import { createHederaAgent } from '../src/agents/HederaAgentKit';

dotenv.config();

const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKey = process.env.HEDERA_PRIVATE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const network = (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet';

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

async function main() {
  if (!accountId || !privateKey) {
    console.log(
      [
        'Hedera credentials not set — skipping live smoke test.',
        '',
        'To run the full end-to-end test, provide:',
        '  HEDERA_ACCOUNT_ID   (e.g. 0.0.12345)',
        '  HEDERA_PRIVATE_KEY  (DER-encoded private key)',
        '  OPENAI_API_KEY      (sk-...; only needed for the natural-language agent)',
        '',
        'Example:',
        '  HEDERA_ACCOUNT_ID=0.0.x HEDERA_PRIVATE_KEY=302e... OPENAI_API_KEY=sk-... npm run smoke:agents',
      ].join('\n')
    );
    process.exit(0);
  }

  console.log(`Running Hedera agent smoke test on ${network} as ${accountId}`);

  // 1. HCS — create a topic and submit a message
  section('1. HCS Agent — create topic + submit message');
  const hcs = new HcsAgent(accountId, privateKey, network);
  await hcs.initialize();
  const topic = await hcs.createTopic(`VeriChainX smoke test ${new Date().toISOString()}`);
  console.log('createTopic:', topic);
  if (topic.success && topic.topicId) {
    const msg = await hcs.submitMessage(topic.topicId, 'hello from the smoke test');
    console.log('submitMessage:', msg);
  }

  // 2. HTS — create a fungible token
  section('2. HTS Agent — create fungible token');
  const hts = new HtsAgent(accountId, privateKey, network);
  await hts.initialize();
  const token = await hts.createFungibleToken('SmokeTest Token', 'SMOKE', 2, 1000);
  console.log('createFungibleToken:', token);

  // 3. Natural-language agent — balance query (requires OpenAI)
  section('3. HederaLangChainAgent — natural-language query');
  if (!openaiKey) {
    console.log('OPENAI_API_KEY not set — skipping the natural-language agent step.');
  } else {
    const agent = createHederaAgent({ accountId, privateKey, network, openaiApiKey: openaiKey });
    await agent.initializeAgent();
    const reply = await agent.processRequest("What is my account's HBAR balance?");
    console.log('processRequest:', reply);
  }

  section('Smoke test complete');
}

main().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
