import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support/fake-claude.js';

test('senzaDb: use("db") restituisce null, user resta disponibile', async () => {
  const fake = globalThis.creaFakeClaude({ senzaDb: true });
  assert.equal(await fake.use('db'), null);
  assert.equal(typeof (await fake.use('user')).id, 'function');
});

test('senza opzione: use("db") restituisce il db', async () => {
  const fake = globalThis.creaFakeClaude({});
  assert.equal(typeof (await fake.use('db')).collection, 'function');
});
