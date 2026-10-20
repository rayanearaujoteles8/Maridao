import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { app } from '../src/app.ts';

test('API informa disponibilidade e trata requisições inválidas sem expor detalhes', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.deepEqual(await health.json(), { status: 'ok', service: 'maridao-api' });
    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 404);
    const invalid = await fetch(`${base}/missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'JSON inválido.' });
    const large = await fetch(`${base}/missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'a'.repeat(20000) }) });
    assert.equal(large.status, 413);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
