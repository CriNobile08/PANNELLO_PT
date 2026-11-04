import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giorniSalute, minutiDaDurata } from '../src/sync/googleHealth/normalizza.js';
import { puntoSonno, puntoFc, puntoHrv, rollupPassi } from './fixtures/googleHealth.js';

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
  const g = giorniSalute({ ...vuoti, sonno: [puntoSonno({ inizio: '2026-10-24T21:30:00Z', fine: '2026-10-25T05:30:00Z', minutiAddormentato: 450, fasi: { DEEP: 60, REM: 80, LIGHT: 300, AWAKE: 10 } })] }, { dal: '2026-10-24', al: '2026-10-25', adesso });
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
