import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source.replace('import.meta.env.VITE_API_BASE', 'undefined'));
const { sendMessage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('API client sends JSON without a subscription key or explicit authorization', async (t) => {
  const response = { id: 'test-response', output: [], status: 'completed' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/uc2/responses');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(options.body), { input: 'test input' });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(response);
  });

  assert.deepEqual(await sendMessage('test input'), response);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('client source and built JavaScript do not reference the removed key or build canary', () => {
  assert.doesNotMatch(source, /VITE_API_KEY|Ocp-Apim-Subscription-Key/i);
  const assets = new URL('../dist/assets/', import.meta.url);
  for (const file of readdirSync(assets).filter((name) => name.endsWith('.js'))) {
    const contents = readFileSync(new URL(file, assets), 'utf8');
    assert.doesNotMatch(contents, /VITE_API_KEY|build-only-secret-canary/);
  }
});
