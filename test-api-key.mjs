import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const lines = fs.readFileSync('.env.local', 'utf-8').split('\n');
const keyLine = lines.find(l => l.startsWith('ANTHROPIC_API_KEY'));
const key = keyLine?.split('=').slice(1).join('=');
console.log('Key prefix:', key?.substring(0, 12) + '...');

const client = new Anthropic({ apiKey: key });

// Try listing models
try {
  const r = await client.models.list();
  console.log('Available models:', r.data.map(m => m.id));
} catch (e) {
  console.log('models.list() failed:', e.status, '- trying individual models...');
}

// Try each model in the fallback chain
const models = [
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229',
];

for (const model of models) {
  try {
    const r = await client.messages.create({
      model,
      messages: [{ role: 'user', content: 'Say hi in 3 words' }],
      max_tokens: 20,
    });
    console.log(`✓ ${model} WORKS:`, r.content[0]?.text);
  } catch (e) {
    console.log(`✗ ${model} FAILED: ${e.status} ${e.message?.substring(0, 80)}`);
  }
}
