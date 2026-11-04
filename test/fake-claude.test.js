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

test('ritardoDb: use("db") si risolve dopo il ritardo', async () => {
  const fake = globalThis.creaFakeClaude({ ritardoDb: 30 });
  const t0 = Date.now();
  assert.equal(typeof (await fake.use('db')).collection, 'function');
  assert.ok(Date.now() - t0 >= 25);
});

test('collezioni ordinate per id (come il db vero), anche con get()', async () => {
  const fake = globalThis.creaFakeClaude({ seme: { 'c/zeta': { n: 1 }, 'c/alfa': { n: 2 }, 'c/mu': { n: 3 } } });
  const db = await fake.use('db');
  assert.deepEqual((await db.collection('c').get()).docs.map((d) => d.id), ['alfa', 'mu', 'zeta']);
  const ids = await new Promise((ok) => { const off = db.collection('c').onSnapshot((s) => { off(); ok(s.docs.map((d) => d.id)); }); });
  assert.deepEqual(ids, ['alfa', 'mu', 'zeta']);
});

test('al massimo 64 sottoscrizioni attive: la 65ª riceve resource_exhausted', async () => {
  const fake = globalThis.creaFakeClaude({});
  const db = await fake.use('db');
  const offs = Array.from({ length: 64 }, (_, i) => db.collection(`c${i}`).onSnapshot(() => {}, assert.fail));
  assert.equal(fake.iscrizioniAttive(), 64);
  const e = await new Promise((ok) => db.collection('extra').onSnapshot(() => assert.fail('non deve emettere'), ok));
  assert.equal(e.code, 'resource_exhausted');
  offs[0]();
  const s = await new Promise((ok, ko) => db.collection('extra').onSnapshot(ok, ko));
  assert.equal(s.size, 0);
  offs.forEach((o) => o());
});

test('mcp registra le chiamate; default null', async () => {
  assert.equal(await globalThis.creaFakeClaude({}).use('mcp'), null);
  const fake = globalThis.creaFakeClaude({ mcp: true });
  const mcp = await fake.use('mcp');
  assert.deepEqual(await mcp.callTool('S', 't', { a: 1 }, { cache: false }), {});
  assert.deepEqual(fake.chiamateMcp(), [{ server: 'S', tool: 't', input: { a: 1 } }]);
});
