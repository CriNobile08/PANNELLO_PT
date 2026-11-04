import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giorniSalute, minutiDaDurata, sessioniDa, TIPI_ESERCIZIO } from '../src/sync/googleHealth/normalizza.js';
import { puntoSonno, puntoFc, puntoHrv, rollupPassi, puntoEsercizio } from './fixtures/googleHealth.js';

const adesso = new Date('2026-11-04T09:52:00Z');
const vuoti = { sonno: [], fcRiposo: [], hrv: [], passi: [] };

test('sonno principale nel giorno del risveglio', () => {
  const g = giorniSalute({ ...vuoti, sonno: [puntoSonno({ inizio: '2026-11-03T22:40:00Z', fine: '2026-11-04T05:50:00Z', minutiAddormentato: 412, fasi: { DEEP: 71, REM: 88, LIGHT: 253, AWAKE: 38 } })] }, { dal: '2026-11-02', al: '2026-11-04', adesso });
  assert.deepEqual(Object.keys(g), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(g['2026-11-04'].sonno.minutiAddormentato, 412);
  assert.equal(g['2026-11-04'].sonno.inizio, '2026-11-03T22:40:00Z');
  assert.equal(g['2026-11-04'].sonno.fine, '2026-11-04T05:50:00Z');
  assert.equal(g['2026-11-04'].sonno.minutiSveglio, 38);
  assert.equal(g['2026-11-04'].sonno.minutiPerAddormentarsi, 12);
  assert.deepEqual(g['2026-11-04'].sonno.fasi, { profondo: 71, rem: 88, leggero: 253, sveglio: 38 });
  assert.equal(g['2026-11-03'].sonno, null);
  assert.deepEqual(g['2026-11-03'].pisolini, []);
  assert.equal(g['2026-11-04'].fonte, 'googleHealth');
  assert.equal(g['2026-11-04'].aggiornatoIl, '2026-11-04T09:52:00.000Z');
});

test("sonno a cavallo del cambio d'ora", () => {
  const g = giorniSalute({ ...vuoti, sonno: [puntoSonno({ inizio: '2026-10-24T21:30:00Z', fine: '2026-10-24T23:30:00Z', minutiAddormentato: 450, fasi: { DEEP: 60, REM: 80, LIGHT: 300, AWAKE: 10 } })] }, { dal: '2026-10-24', al: '2026-10-25', adesso });
  assert.equal(g['2026-10-25'].sonno.minutiAddormentato, 450);
  assert.equal(g['2026-10-24'].sonno, null);
});

test('pisolino dopo mezzanotte di Roma', () => {
  const g = giorniSalute({ ...vuoti, sonno: [puntoSonno({ inizio: '2026-11-03T23:00:00Z', fine: '2026-11-03T23:30:00Z', principale: false, minutiAddormentato: 25, fasi: { LIGHT: 25, AWAKE: 5 } })] }, { dal: '2026-11-03', al: '2026-11-04', adesso });
  assert.deepEqual(g['2026-11-04'].pisolini, [{ inizio: '2026-11-03T23:00:00Z', fine: '2026-11-03T23:30:00Z', minutiAddormentato: 25 }]);
  assert.deepEqual(g['2026-11-03'].pisolini, []);
  assert.equal(g['2026-11-04'].sonno, null);
});

test('sonno CLASSIC senza fasi', () => {
  const g = giorniSalute({ ...vuoti, sonno: [puntoSonno({ inizio: '2026-11-03T22:40:00Z', fine: '2026-11-04T05:50:00Z', tipo: 'CLASSIC', minutiAddormentato: 400 })] }, { dal: '2026-11-04', al: '2026-11-04', adesso });
  assert.equal(g['2026-11-04'].sonno.fasi, null);
  assert.equal(g['2026-11-04'].sonno.minutiAddormentato, 400);
});

test('due sonni principali: vince il più lungo', () => {
  const g = giorniSalute({ ...vuoti, sonno: [
    puntoSonno({ inizio: '2026-11-04T00:00:00Z', fine: '2026-11-04T01:00:00Z', minutiAddormentato: 50, fasi: { LIGHT: 50 } }),
    puntoSonno({ inizio: '2026-11-03T22:00:00Z', fine: '2026-11-04T06:00:00Z', minutiAddormentato: 430, fasi: { LIGHT: 430 } }),
  ] }, { dal: '2026-11-04', al: '2026-11-04', adesso });
  assert.equal(g['2026-11-04'].sonno.minutiAddormentato, 430);
});

test('fcRiposo, hrv e passi convertiti in numero', () => {
  const g = giorniSalute({
    sonno: [],
    fcRiposo: [puntoFc('2026-11-04', 54)],
    hrv: [puntoHrv('2026-11-04', 41.2, { profondo: 47, fcNonRem: 52 })],
    passi: [rollupPassi('2026-11-04', 8423)],
  }, { dal: '2026-11-03', al: '2026-11-04', adesso });
  assert.equal(g['2026-11-04'].fcRiposo, 54);
  assert.deepEqual(g['2026-11-04'].hrv, { rmssd: 41.2, rmssdProfondo: 47, fcNonRem: 52 });
  assert.equal(g['2026-11-04'].passi, 8423);
  assert.equal(g['2026-11-03'].fcRiposo, null);
  assert.equal(g['2026-11-03'].hrv, null);
  assert.equal(g['2026-11-03'].passi, null);
});

test('hrv senza campi opzionali', () => {
  const g = giorniSalute({ ...vuoti, hrv: [puntoHrv('2026-11-04', 38)] }, { dal: '2026-11-04', al: '2026-11-04', adesso });
  assert.deepEqual(g['2026-11-04'].hrv, { rmssd: 38, rmssdProfondo: null, fcNonRem: null });
});

test('tipo fallito: campo omesso', () => {
  const g = giorniSalute({ ...vuoti, hrv: undefined }, { dal: '2026-11-03', al: '2026-11-04', adesso });
  for (const d of Object.keys(g)) {
    assert.ok(!('hrv' in g[d]));
    assert.ok('sonno' in g[d] && 'pisolini' in g[d] && 'fcRiposo' in g[d] && 'passi' in g[d]);
  }
  const h = giorniSalute({ sonno: undefined, fcRiposo: undefined, hrv: [], passi: undefined }, { dal: '2026-11-04', al: '2026-11-04', adesso });
  for (const k of ['sonno', 'pisolini', 'fcRiposo', 'passi']) assert.ok(!(k in h['2026-11-04']), k);
  assert.ok('hrv' in h['2026-11-04']);
});

test('punti fuori finestra scartati', () => {
  const g = giorniSalute({
    sonno: [puntoSonno({ inizio: '2026-10-30T22:00:00Z', fine: '2026-10-31T06:00:00Z', minutiAddormentato: 400, fasi: { LIGHT: 400 } })],
    fcRiposo: [puntoFc('2026-11-05', 60)],
    hrv: [puntoHrv('2026-11-01', 30)],
    passi: [rollupPassi('2026-11-01', 100)],
  }, { dal: '2026-11-02', al: '2026-11-04', adesso });
  assert.deepEqual(Object.keys(g), ['2026-11-02', '2026-11-03', '2026-11-04']);
  for (const d of Object.keys(g)) {
    assert.equal(g[d].sonno, null);
    assert.equal(g[d].fcRiposo, null);
    assert.equal(g[d].hrv, null);
    assert.equal(g[d].passi, null);
  }
});

test('minutiDaDurata', () => {
  assert.equal(minutiDaDurata('3720s'), 62);
  assert.equal(minutiDaDurata('89.6s'), 1);
  assert.equal(minutiDaDurata(undefined), null);
});

test('sonno senza summary: minuti null, nessuna eccezione, perde contro uno con numero', () => {
  const senza = puntoSonno({ inizio: '2026-11-04T00:00:00Z', fine: '2026-11-04T01:00:00Z', fasi: { LIGHT: 10 } });
  delete senza.sleep.summary;
  const con = puntoSonno({ inizio: '2026-11-03T22:00:00Z', fine: '2026-11-04T06:00:00Z', minutiAddormentato: 30, fasi: { LIGHT: 30 } });
  for (const sonno of [[senza, con], [con, senza]]) {
    const g = giorniSalute({ ...vuoti, sonno }, { dal: '2026-11-04', al: '2026-11-04', adesso });
    assert.equal(g['2026-11-04'].sonno.minutiAddormentato, 30);
  }
  const solo = giorniSalute({ ...vuoti, sonno: [senza] }, { dal: '2026-11-04', al: '2026-11-04', adesso });
  assert.equal(solo['2026-11-04'].sonno.minutiAddormentato, null);
  assert.equal(solo['2026-11-04'].sonno.minutiSveglio, null);
  assert.equal(solo['2026-11-04'].sonno.minutiPerAddormentarsi, null);
  assert.equal(solo['2026-11-04'].sonno.fasi, null);
});

const finestra = { dal: '2026-11-01', al: '2026-11-30', adesso };

test('tipi convertiti', () => {
  assert.equal(TIPI_ESERCIZIO.WEIGHTS, 'palestra');
  assert.equal(TIPI_ESERCIZIO.TRAIL_RUN, 'corsa');
  assert.equal(TIPI_ESERCIZIO.HIKING, 'trekking');
  assert.equal(TIPI_ESERCIZIO.NORDIC_WALKING, 'camminata');
  assert.equal(TIPI_ESERCIZIO.HAND_CYCLING, 'bici');
  const tipo = (t) => sessioniDa([puntoEsercizio({ tipo: t, inizio: '2026-11-04T08:00:00Z', fine: '2026-11-04T09:00:00Z' })], finestra)[0].doc.tipo;
  assert.equal(tipo('WEIGHTS'), 'palestra');
  assert.equal(tipo('TRAIL_RUN'), 'corsa');
  assert.equal(tipo('YOGA'), 'altro');
  assert.equal(tipo('NUOVO_TIPO'), 'altro');
});

test('sessione completa', () => {
  const [s] = sessioniDa([puntoEsercizio({
    id: 'abc', inizio: '2026-11-04T08:00:00Z', fine: '2026-11-04T09:02:00Z', tipo: 'WEIGHTS', nome: 'Pesi',
    durataAttiva: '3720s', fcMedia: 118, kcal: 410.4, passi: 1200, distanzaMm: 5000000, dislivelloMm: 120000, gps: true,
  })], finestra);
  assert.equal(s.id, 'googleHealth_abc');
  assert.deepEqual(s.doc, {
    fonte: 'googleHealth', idFonte: 'abc', data: '2026-11-04',
    inizio: '2026-11-04T08:00:00Z', fine: '2026-11-04T09:02:00Z',
    tipo: 'palestra', tipoOriginale: 'WEIGHTS', nome: 'Pesi',
    durataAttivaMin: 62, fcMedia: 118,
    zoneMin: { leggera: 10, moderata: 30, intensa: 15, picco: 1 },
    calorie: 410, passi: 1200, distanzaM: 5000, dislivelloM: 120, gps: true,
    aggiornatoIl: '2026-11-04T09:52:00.000Z',
  });
});

test('sessione senza metriche', () => {
  const p = { name: 'users/me/dataTypes/exercise/dataPoints/x1', exercise: {
    interval: { startTime: '2026-11-04T08:00:00Z', endTime: '2026-11-04T08:30:00Z' }, exerciseType: 'YOGA' } };
  const [s] = sessioniDa([p], finestra);
  assert.equal(s.doc.durataAttivaMin, 30);
  assert.equal(s.doc.nome, null);
  for (const k of ['fcMedia', 'zoneMin', 'calorie', 'passi', 'distanzaM', 'dislivelloM']) assert.equal(s.doc[k], null, k);
  assert.equal(s.doc.gps, false);
  assert.equal(s.doc.tipo, 'altro');
});

test('data di Roma dell\'inizio e finestra', () => {
  const tarda = puntoEsercizio({ id: 'a', inizio: '2026-11-03T23:30:00Z', fine: '2026-11-04T00:30:00Z' });
  const fuori = puntoEsercizio({ id: 'b', inizio: '2026-12-03T10:00:00Z', fine: '2026-12-03T11:00:00Z' });
  const r = sessioniDa([tarda, fuori], finestra);
  assert.equal(r.length, 1);
  assert.equal(r[0].doc.data, '2026-11-04');
});

test('sonno STAGES senza fasi note o con minuti non numerici: fasi null', () => {
  for (const fasi of [undefined, {}, { DEEP: 'x' }]) {
    const p = puntoSonno({ inizio: '2026-11-03T22:00:00Z', fine: '2026-11-04T06:00:00Z', minutiAddormentato: 400, fasi });
    if (fasi?.DEEP) p.sleep.summary.stagesSummary[0].minutes = 'abc';
    const g = giorniSalute({ ...vuoti, sonno: [p] }, { dal: '2026-11-04', al: '2026-11-04', adesso });
    assert.equal(g['2026-11-04'].sonno.fasi, null);
  }
  const p = puntoSonno({ inizio: '2026-11-03T22:00:00Z', fine: '2026-11-04T06:00:00Z', minutiAddormentato: 400, fasi: { DEEP: 50 } });
  const g = giorniSalute({ ...vuoti, sonno: [p] }, { dal: '2026-11-04', al: '2026-11-04', adesso });
  assert.equal(g['2026-11-04'].sonno.fasi.profondo, 50);
});

test('punti malformati saltati senza eccezioni', () => {
  const ok = puntoSonno({ inizio: '2026-11-03T22:00:00Z', fine: '2026-11-04T06:00:00Z', minutiAddormentato: 400, fasi: { DEEP: 50 } });
  const w = { dal: '2026-11-04', al: '2026-11-04', adesso };
  const g = giorniSalute({
    sonno: [{}, { sleep: {} }, { sleep: { interval: {} } }, ok],
    fcRiposo: [{}, { dailyRestingHeartRate: {} }],
    hrv: [{}, { dailyHeartRateVariability: {} }],
    passi: [{}, { civilStartTime: {} }, { civilStartTime: { date: null } }],
  }, w);
  assert.equal(g['2026-11-04'].sonno.minutiAddormentato, 400);
  assert.equal(g['2026-11-04'].fcRiposo, null);
  assert.equal(g['2026-11-04'].hrv, null);
  assert.equal(g['2026-11-04'].passi, null);
});

test('sessioni malformate saltate', () => {
  const buono = { name: 'users/me/dataTypes/exercise/dataPoints/9', exercise: { interval: { startTime: '2026-11-04T07:00:00Z', endTime: '2026-11-04T08:00:00Z' }, exerciseType: 'WEIGHTS' } };
  const senzaNome = { exercise: buono.exercise };
  const senzaInterval = { name: 'users/me/x/1', exercise: {} };
  const r = sessioniDa([null, {}, senzaNome, senzaInterval, buono], finestra);
  assert.deepEqual(r.map((x) => x.id), ['googleHealth_9']);
});
