import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaClientHevy } from '../src/sync/hevy/client.js';
import { ErroreSync } from '../src/sync/errore.js';
import { ErroreSync as ErroreSyncGoogle } from '../src/sync/googleHealth/client.js';

const env = { HEVY_API_KEY: 'chiave-segreta' };
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

// fetch finto: `risposte` è un array di risposte (o errori) servite in ordine; l'ultima si ripete.
function finto(risposte) {
  const chiamate = [];
  const fetch = async (url, opzioni = {}) => {
    chiamate.push({ url: new URL(String(url)), opzioni });
    const r = risposte[Math.min(chiamate.length - 1, risposte.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r(new URL(String(url))) : r.clone();
  };
  return { fetch, chiamate };
}
const client = (f, attese = []) => creaClientHevy({ env, fetch: f.fetch, attendi: async (ms) => { attese.push(ms); } });

test('ErroreSync condiviso', () => {
  assert.equal(ErroreSync, ErroreSyncGoogle);
});

test('header api-key', async () => {
  const f = finto([json({ page: 1, page_count: 1, events: [] })]);
  await client(f).elencaEventi('2026-11-01T08:52:00.000Z');
  assert.equal(f.chiamate[0].opzioni.headers['api-key'], 'chiave-segreta');
});

test('eventi su più pagine', async () => {
  const f = finto([
    (u) => json({ page: Number(u.searchParams.get('page')), page_count: 2, events: [{ n: u.searchParams.get('page') }] }),
  ]);
  const eventi = await client(f).elencaEventi('2026-11-01T08:52:00.000Z');
  assert.deepEqual(eventi, [{ n: '1' }, { n: '2' }]);
  assert.equal(f.chiamate.length, 2);
  for (const [i, c] of f.chiamate.entries()) {
    assert.equal(c.url.origin + c.url.pathname, 'https://api.hevyapp.com/v1/workouts/events');
    assert.equal(c.url.searchParams.get('page'), String(i + 1));
    assert.equal(c.url.searchParams.get('pageSize'), '10');
    assert.equal(c.url.searchParams.get('since'), '2026-11-01T08:52:00.000Z');
  }
});

test('chiave events o workouts', async () => {
  const f = finto([
    (u) => (u.searchParams.get('page') === '1'
      ? json({ page: 1, page_count: 2, events: [{ a: 1 }] })
      : json({ page: 2, page_count: 2, workouts: [{ b: 2 }] })),
  ]);
  assert.deepEqual(await client(f).elencaEventi('x'), [{ a: 1 }, { b: 2 }]);
});

test('template a pagine da 100', async () => {
  const f = finto([json({ page: 1, page_count: 1, exercise_templates: [{ id: 't1' }] })]);
  assert.deepEqual(await client(f).elencaTemplate(), [{ id: 't1' }]);
  const u = f.chiamate[0].url;
  assert.equal(u.pathname, '/v1/exercise_templates');
  assert.equal(u.searchParams.get('pageSize'), '100');
  assert.equal(u.searchParams.get('page'), '1');
});

test('429 poi ok', async () => {
  const attese = [];
  const f = finto([json({}, 429), json({ page: 1, page_count: 1, events: [] })]);
  await client(f, attese).elencaEventi('x');
  assert.equal(f.chiamate.length, 2);
  assert.deepEqual(attese, [2000]);
});

test('5xx sempre', async () => {
  const attese = [];
  const f = finto([json({}, 503)]);
  await assert.rejects(client(f, attese).elencaEventi('x'), (e) => e instanceof ErroreSync && e.codice === 'rete');
  assert.equal(f.chiamate.length, 4);
  assert.deepEqual(attese, [2000, 4000, 8000]);
});

test('rete assente sempre', async () => {
  const f = finto([new TypeError('fetch failed')]);
  await assert.rejects(client(f).elencaTemplate(), (e) => e instanceof ErroreSync && e.codice === 'rete');
  assert.equal(f.chiamate.length, 4);
});

for (const stato of [401, 403]) {
  test(`${stato} senza tentativi`, async () => {
    const f = finto([json({ error: 'no' }, stato)]);
    await assert.rejects(client(f).elencaEventi('x'), (e) => e instanceof ErroreSync && e.codice === 'autorizzazione');
    assert.equal(f.chiamate.length, 1);
  });
}

test('chiave mancante', async () => {
  const f = finto([json({})]);
  await assert.rejects(creaClientHevy({ env: {}, fetch: f.fetch }).elencaEventi('x'), (e) => e instanceof ErroreSync && e.codice === 'configurazione');
  assert.equal(f.chiamate.length, 0);
});

test('chiave mai nei messaggi', async () => {
  const f = finto([json({ error: 'chiave-segreta non valida' }, 400)]);
  await assert.rejects(client(f).elencaEventi('x'), (e) => {
    assert.ok(!String(e.message).includes('chiave-segreta'));
    assert.ok(!(e instanceof ErroreSync));
    return true;
  });
});

test('200 non JSON negli eventi: errore, non zero eventi', async () => {
  const f = finto([new Response('<html>proxy</html>', { status: 200 })]);
  await assert.rejects(client(f).elencaEventi('x'));
});

test('elenco eventi non array: errore', async () => {
  const f = finto([json({ page: 1, page_count: 1, events: { a: 1 } })]);
  await assert.rejects(client(f).elencaEventi('x'));
});

test('catalogo vuoto o chiave mancante: errore', async () => {
  await assert.rejects(client(finto([json({ page: 1, page_count: 1, exercise_templates: [] })])).elencaTemplate());
  await assert.rejects(client(finto([json({ page: 1, page_count: 1 })])).elencaTemplate());
  await assert.rejects(client(finto([new Response('', { status: 200 })])).elencaTemplate());
});

test('nessun evento è un risultato valido', async () => {
  assert.deepEqual(await client(finto([json({ page: 1, page_count: 0, events: [] })])).elencaEventi('x'), []);
});
