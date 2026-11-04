import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiSync, MESSAGGI } from '../src/sync/esegui.js';
import { fonteHevy } from '../src/sync/fonti/hevy.js';
import { creaClientHevy } from '../src/sync/hevy/client.js';
import { ErroreSync } from '../src/sync/errore.js';
import { workout, evento, template } from './fixtures/hevy.js';

const adesso = new Date('2026-11-04T08:52:00Z'); // 09:52 a Roma
const alba = new Date('2026-11-04T05:52:00Z'); // 06:52 a Roma
const pomeriggio = new Date('2026-11-04T11:52:00Z'); // 12:52 a Roma

const op = (collection, doc_id) => ({ op: 'set', collection, doc_id, data: {} });
const gh = (extra = {}) => async () => ({
  esito: 'ok', messaggio: '', tipiMancanti: [], conteggi: { giorni: 3, sessioni: 1 },
  finestra: { dal: '2026-11-02', al: '2026-11-04' }, operazioni: [op('salute', '2026-11-04')], ...extra,
});
const hv = (extra = {}) => async () => ({
  esito: 'ok', messaggio: '', conteggi: { sessioni: 1, eliminate: 0, scartate: 0, catalogo: null },
  operazioni: [op('sessioni', 'hevy_w1')], ...extra,
});
const lancia = (e) => async () => { throw e; };

test('entrambe ok', async () => {
  const r = await eseguiSync({ fonti: { googleHealth: gh(), hevy: hv() }, adesso });
  assert.equal(r.generatoIl, adesso.toISOString());
  assert.equal(r.esito, 'ok');
  assert.deepEqual(r.finestra, { dal: '2026-11-02', al: '2026-11-04' });
  assert.deepEqual(r.operazioni.map((o) => o.doc_id), ['2026-11-04', 'hevy_w1']);
  assert.deepEqual(r.fonti, {
    googleHealth: { esito: 'ok', messaggio: '', tipiMancanti: [], conteggi: { giorni: 3, sessioni: 1 } },
    hevy: { esito: 'ok', messaggio: '', conteggi: { sessioni: 1, eliminate: 0, scartate: 0, catalogo: null } },
  });
});

test('solo hevy in errore', async () => {
  const r = await eseguiSync({ fonti: { googleHealth: gh(), hevy: lancia(new ErroreSync('autorizzazione', 'x')) }, adesso });
  assert.equal(r.esito, 'parziale');
  assert.deepEqual(r.fonti.hevy, { esito: 'errore', codice: 'autorizzazione', messaggio: 'Chiave Hevy non valida o abbonamento Pro scaduto' });
  assert.deepEqual(r.operazioni.map((o) => o.doc_id), ['2026-11-04']);
});

test('solo googleHealth in errore', async () => {
  const r = await eseguiSync({ fonti: { googleHealth: lancia(new ErroreSync('autorizzazione', 'x')), hevy: hv() }, adesso });
  assert.equal(r.esito, 'parziale');
  assert.equal(r.finestra, null);
  assert.equal(r.fonti.googleHealth.messaggio, 'Autorizzazione Google scaduta: va rinnovato il token');
  assert.deepEqual(r.operazioni.map((o) => o.doc_id), ['hevy_w1']);
});

test('una fonte parziale rende parziale il totale', async () => {
  const r = await eseguiSync({ fonti: { googleHealth: gh({ esito: 'parziale' }), hevy: hv() }, adesso });
  assert.equal(r.esito, 'parziale');
});

test('tutte in errore', async () => {
  const r = await eseguiSync({ fonti: { googleHealth: lancia(new ErroreSync('rete', 'x')), hevy: lancia(new ErroreSync('configurazione', 'x')) }, adesso });
  assert.equal(r.esito, 'errore');
  assert.deepEqual(r.operazioni, []);
  assert.equal(r.fonti.googleHealth.messaggio, 'Google Health non raggiungibile');
  assert.equal(r.fonti.hevy.messaggio, 'Chiave Hevy mancante');
});

test('errore generico → rete', async () => {
  const r = await eseguiSync({ fonti: { googleHealth: gh(), hevy: lancia(new Error('x')) }, adesso });
  assert.deepEqual(r.fonti.hevy, { esito: 'errore', codice: 'rete', messaggio: 'Hevy non raggiungibile' });
});

test('messaggi fissi', () => {
  assert.deepEqual(MESSAGGI.hevy, {
    configurazione: 'Chiave Hevy mancante',
    autorizzazione: 'Chiave Hevy non valida o abbonamento Pro scaduto',
    rete: 'Hevy non raggiungibile',
  });
  assert.deepEqual(MESSAGGI.googleHealth, {
    autorizzazione: 'Autorizzazione Google scaduta: va rinnovato il token',
    rete: 'Google Health non raggiungibile',
    configurazione: 'Credenziali Google Health mancanti',
  });
});

// --- fonte Hevy con fetch finto ---
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const TEMPLATES = Array.from({ length: 451 }, (_, i) => template({ id: `T${i}`, title: `Esercizio ${String(i).padStart(3, '0')}` }));

function finto({ eventi = [evento.aggiornato(workout())], templateStato = 200 } = {}) {
  const chiamate = [];
  const fetch = async (url) => {
    const u = new URL(String(url));
    chiamate.push(u);
    const pagina = Number(u.searchParams.get('page'));
    if (u.pathname === '/v1/workouts/events') return json({ page: 1, page_count: 1, events: eventi });
    if (u.pathname === '/v1/exercise_templates') {
      if (templateStato !== 200) return json({}, templateStato);
      return json({ page: pagina, page_count: 5, exercise_templates: TEMPLATES.slice((pagina - 1) * 100, pagina * 100) });
    }
    throw new Error('URL inatteso ' + u);
  };
  return { fetch, chiamate };
}
const clientDa = (f) => creaClientHevy({ env: { HEVY_API_KEY: 'k' }, fetch: f.fetch, attendi: async () => {} });

test('since esatto', async () => {
  const f = finto();
  await fonteHevy({ client: clientDa(f), adesso });
  assert.equal(f.chiamate[0].searchParams.get('since'), '2026-11-01T08:52:00.000Z');
});

test('catalogo alle 6:52', async () => {
  const f = finto();
  const r = await fonteHevy({ client: clientDa(f), adesso: alba });
  assert.equal(r.esito, 'ok');
  assert.equal(r.conteggi.catalogo, 451);
  const cat = r.operazioni.at(-1);
  assert.equal(cat.op, 'set');
  assert.equal(cat.collection, 'hevy');
  assert.equal(cat.doc_id, 'catalogo');
  assert.equal(cat.data.esercizi.length, 451);
  assert.equal(r.operazioni[0].doc_id, 'hevy_w1');
});

test('niente catalogo alle 12:52', async () => {
  const f = finto();
  const r = await fonteHevy({ client: clientDa(f), adesso: pomeriggio });
  assert.equal(r.conteggi.catalogo, null);
  assert.ok(!f.chiamate.some((u) => u.pathname === '/v1/exercise_templates'));
  assert.ok(!r.operazioni.some((o) => o.collection === 'hevy'));
});

test('catalogo fallito', async () => {
  const f = finto({ templateStato: 500 });
  const r = await fonteHevy({ client: clientDa(f), adesso: alba });
  assert.equal(r.esito, 'parziale');
  assert.equal(r.messaggio, 'Catalogo esercizi non aggiornato');
  assert.equal(r.conteggi.catalogo, null);
  assert.deepEqual(r.operazioni.map((o) => o.doc_id), ['hevy_w1']);
});

test('conteggi della fonte', async () => {
  const f = finto({ eventi: [evento.aggiornato(workout()), evento.cancellato('w2', '2026-11-04T08:00:00Z'), { type: 'boh' }] });
  const r = await fonteHevy({ client: clientDa(f), adesso });
  assert.deepEqual(r.conteggi, { sessioni: 1, eliminate: 1, scartate: 1, catalogo: null });
  assert.equal(r.messaggio, '');
});

test('errore sugli eventi si propaga', async () => {
  const f = { fetch: async () => json({}, 401) };
  await assert.rejects(fonteHevy({ client: clientDa(f), adesso }), (e) => e instanceof ErroreSync && e.codice === 'autorizzazione');
});
