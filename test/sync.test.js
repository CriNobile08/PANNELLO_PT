import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaClient, ErroreSync } from '../src/sync/googleHealth/client.js';
import { fonteGoogleHealth } from '../src/sync/fonti/googleHealth.js';
import { main } from '../scripts/sync.js';
import { puntoSonno, puntoFc, puntoHrv, rollupPassi, puntoEsercizio } from './fixtures/googleHealth.js';
import { workout } from './fixtures/hevy.js';

const env = { GH_CLIENT_ID: 'id-cliente', GH_CLIENT_SECRET: 'segreto-cliente', GH_REFRESH_TOKEN: 'refresh-segreto', HEVY_API_KEY: 'chiave-hevy-segreta' };
const accessToken = 'access-segreto-123';
const adesso = new Date('2026-11-04T08:52:00Z');
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

// fetch finto: risponde per tipo; `guasti` = { tipo: risposta alternativa }.
function creaFinto(guasti = {}) {
  const chiamate = [];
  const fetch = async (url, opzioni = {}) => {
    url = String(url);
    chiamate.push({ url, opzioni });
    if (url === URL_TOKEN) return guasti.token ?? json({ access_token: accessToken, expires_in: 3599 });
    if (url.startsWith('https://api.hevyapp.com/')) {
      if (guasti.hevy) return guasti.hevy;
      return json({ page: 1, page_count: 1, events: [{ type: 'updated', workout: workout() }] });
    }
    const tipo = url.match(/dataTypes\/([^/]+)\/dataPoints/)[1];
    if (guasti[tipo]) { const g = guasti[tipo]; if (g instanceof Error) throw g; return g; }
    switch (tipo) {
      case 'sleep': return json({ dataPoints: [puntoSonno({ inizio: '2026-11-03T22:30:00Z', fine: '2026-11-04T06:30:00Z', minutiAddormentato: 420, fasi: { AWAKE: 30, DEEP: 80 } })] });
      case 'daily-resting-heart-rate': return json({ dataPoints: [puntoFc('2026-11-04', 54)] });
      case 'daily-heart-rate-variability': return json({ dataPoints: [puntoHrv('2026-11-04', 41.2)] });
      case 'exercise': return json({ dataPoints: [puntoEsercizio({ id: 'es1', inizio: '2026-11-03T17:00:00Z', fine: '2026-11-03T18:05:00Z' })] });
      case 'steps': return json({ rollupDataPoints: [rollupPassi('2026-11-04', 8423)] });
      default: throw new Error('tipo inatteso ' + tipo);
    }
  };
  return { fetch, chiamate };
}
const clienteDa = (fetch) => creaClient({ env, fetch, attendi: async () => {} });
const esegui = (guasti) => { const f = creaFinto(guasti); return fonteGoogleHealth({ client: clienteDa(f.fetch), adesso }).then((r) => ({ r, ...f })); };

test('finestra di tre giorni', async () => {
  const { r } = await esegui();
  assert.deepEqual(r.finestra, { dal: '2026-11-02', al: '2026-11-04' });
  assert.equal(r.messaggio, '');
});

test('filtri esatti', async () => {
  const { chiamate } = await esegui();
  const filtri = {};
  for (const c of chiamate) {
    const m = c.url.match(/dataTypes\/([^/]+)\/dataPoints\?(.*)$/);
    if (m) filtri[m[1]] = new URLSearchParams(m[2]).get('filter');
  }
  assert.deepEqual(filtri, {
    sleep: 'sleep.interval.civil_end_time >= "2026-11-02" AND sleep.interval.civil_end_time < "2026-11-05"',
    'daily-resting-heart-rate': 'daily_resting_heart_rate.date >= "2026-11-02" AND daily_resting_heart_rate.date < "2026-11-05"',
    'daily-heart-rate-variability': 'daily_heart_rate_variability.date >= "2026-11-02" AND daily_heart_rate_variability.date < "2026-11-05"',
    exercise: 'exercise.interval.civil_start_time >= "2026-11-02" AND exercise.interval.civil_start_time < "2026-11-05"',
  });
  const roll = chiamate.find((c) => c.url.includes('steps/dataPoints:dailyRollUp'));
  assert.deepEqual(JSON.parse(roll.opzioni.body).range, {
    start: { date: { year: 2026, month: 11, day: 2 } },
    end: { date: { year: 2026, month: 11, day: 5 } },
  });
});

test('operazioni set', async () => {
  const { r } = await esegui();
  assert.equal(r.esito, 'ok');
  assert.deepEqual(r.tipiMancanti, []);
  const salute = r.operazioni.filter((o) => o.collection === 'salute');
  const sessioni = r.operazioni.filter((o) => o.collection === 'sessioni');
  assert.deepEqual(salute.map((o) => o.doc_id), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(sessioni.length, 1);
  assert.equal(sessioni[0].doc_id, 'googleHealth_es1');
  assert.ok(r.operazioni.every((o) => o.op === 'set'));
  assert.deepEqual(r.conteggi, { giorni: 3, sessioni: 1 });
  assert.equal(salute[2].data.fcRiposo, 54);
  assert.equal(salute[2].data.passi, 8423);
});

test('HRV fallita -> parziale', async () => {
  const { r } = await esegui({ 'daily-heart-rate-variability': json({ error: { message: 'x' } }, 400) });
  assert.equal(r.esito, 'parziale');
  assert.deepEqual(r.tipiMancanti, ['daily-heart-rate-variability']);
  const salute = r.operazioni.filter((o) => o.collection === 'salute');
  assert.ok(salute.every((o) => o.op === 'update' && !('hrv' in o.data) && 'fcRiposo' in o.data));
  assert.ok(r.operazioni.filter((o) => o.collection === 'sessioni').every((o) => o.op === 'set'));
});

test('exercise fallito: nessuna sessione', async () => {
  const { r } = await esegui({ exercise: json({}, 400) });
  assert.deepEqual(r.tipiMancanti, ['exercise']);
  assert.equal(r.conteggi.sessioni, 0);
  assert.equal(r.operazioni.filter((o) => o.collection === 'sessioni').length, 0);
});

test('idempotenza', async () => {
  const a = await esegui();
  const b = await esegui();
  assert.deepEqual(a.r.operazioni, b.r.operazioni);
});

test('ErroreSync si propaga', async () => {
  await assert.rejects(esegui({ token: json({ error: 'invalid_grant' }, 400) }), (e) => e instanceof ErroreSync && e.codice === 'autorizzazione');
});

test('errore di rete su un solo tipo = parziale', async () => {
  const { r } = await esegui({ steps: new TypeError('fetch failed') });
  assert.equal(r.esito, 'parziale');
  assert.deepEqual(r.tipiMancanti, ['steps']);
});

test('tutti i tipi con errore di rete = rete', async () => {
  const g = {};
  for (const t of ['sleep', 'daily-resting-heart-rate', 'daily-heart-rate-variability', 'exercise', 'steps']) g[t] = new TypeError('fetch failed');
  await assert.rejects(esegui(g), (e) => e instanceof ErroreSync && e.codice === 'rete' && e.message === 'Google Health non raggiungibile');
});

test('tutti i tipi falliti con errori generici = rete', async () => {
  const g = {};
  for (const t of ['sleep', 'daily-resting-heart-rate', 'daily-heart-rate-variability', 'exercise', 'steps']) g[t] = json({}, 400);
  await assert.rejects(esegui(g), (e) => e instanceof ErroreSync && e.codice === 'rete' && e.message === 'Google Health non raggiungibile');
});

function cartellaTemp() { return mkdtempSync(join(tmpdir(), 'sync-')); }
function catturaErr() { const righe = []; return { righe, err: (t) => righe.push(t), log: () => {} }; }

test('main scrive out/sync.json senza segreti', async () => {
  const dir = cartellaTemp();
  const log = []; 
  const { fetch } = creaFinto();
  const codice = await main({ env, fetch, adesso, cartella: join(dir, 'out'), log: (t) => log.push(t), errore: () => {} });
  assert.equal(codice, 0);
  const testo = readFileSync(join(dir, 'out', 'sync.json'), 'utf8');
  for (const s of [env.GH_CLIENT_SECRET, env.GH_REFRESH_TOKEN, env.HEVY_API_KEY, accessToken]) assert.ok(!testo.includes(s));
  const file = JSON.parse(testo);
  assert.equal(file.esito, 'ok');
  assert.ok(file.operazioni.some((o) => o.doc_id === 'hevy_w1'));
  assert.deepEqual(log, ['sync: ok · googleHealth ok · hevy ok']);
  rmSync(dir, { recursive: true });
});

test('main con una fonte fallita scrive il file', async () => {
  const dir = cartellaTemp();
  const out = join(dir, 'out');
  const log = [];
  const { fetch } = creaFinto({ token: json({ error: 'invalid_grant' }, 400) });
  const codice = await main({ env, fetch, adesso, cartella: out, log: (t) => log.push(t), errore: () => {} });
  assert.equal(codice, 0);
  const file = JSON.parse(readFileSync(join(out, 'sync.json'), 'utf8'));
  assert.equal(file.esito, 'parziale');
  assert.equal(file.fonti.googleHealth.esito, 'errore');
  assert.deepEqual(file.operazioni.map((o) => o.doc_id), ['hevy_w1']);
  assert.deepEqual(log, ['sync: parziale · googleHealth errore · hevy ok']);
  rmSync(dir, { recursive: true });
});

test('main con tutte le fonti fallite', async () => {
  const dir = cartellaTemp();
  const out = join(dir, 'out');
  mkdirSync(out);
  writeFileSync(join(out, 'sync.json'), '{}');
  const { fetch } = creaFinto({ token: json({ error: 'invalid_grant' }, 400) });
  const { righe, err } = catturaErr();
  const { HEVY_API_KEY, ...senzaHevy } = env;
  const codice = await main({ env: senzaHevy, fetch, adesso, cartella: out, log: () => {}, errore: err });
  assert.equal(codice, 1);
  assert.ok(!existsSync(join(out, 'sync.json')));
  assert.deepEqual(righe, [
    'ERRORE: googleHealth: autorizzazione: Autorizzazione Google scaduta: va rinnovato il token',
    'ERRORE: hevy: configurazione: Chiave Hevy mancante',
  ]);
  rmSync(dir, { recursive: true });
});

test('main: messaggi per rete e configurazione', async () => {
  const dir = cartellaTemp();
  const a = catturaErr();
  assert.equal(await main({ env: {}, fetch: creaFinto().fetch, adesso, cartella: dir, log: () => {}, errore: a.err }), 1);
  assert.equal(a.righe[0], 'ERRORE: googleHealth: configurazione: Credenziali Google Health mancanti');
  const b = catturaErr();
  const g = creaFinto({ token: new Error('giù') });
  assert.equal(await main({ env, fetch: async (u, o) => { if (String(u) === URL_TOKEN || String(u).includes('hevyapp')) throw new Error('giù'); return g.fetch(u, o); }, adesso, cartella: dir, log: () => {}, errore: b.err, attendi: async () => {} }), 1);
  assert.deepEqual(b.righe, ['ERRORE: googleHealth: rete: Google Health non raggiungibile', 'ERRORE: hevy: rete: Hevy non raggiungibile']);
  rmSync(dir, { recursive: true });
});
