import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GIORNI, oggiRoma, oraRoma, giornoSettimana, aggiungiGiorni,
  lunediDi, giorniDellaSettimana, formatoData, formatoDataLunga, dataDaIso, formatoDataIso,
} from '../src/logic/date.js';

test('GIORNI', () => {
  assert.deepEqual(GIORNI, ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']);
});

test('oggiRoma', () => {
  assert.equal(oggiRoma(new Date('2026-03-28T23:30:00Z')), '2026-03-29');
  assert.equal(oggiRoma(new Date('2026-10-24T22:30:00Z')), '2026-10-25');
  assert.equal(oggiRoma(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.equal(oggiRoma(new Date('2026-11-04T22:59:00Z')), '2026-11-04');
});

test('oraRoma', () => {
  assert.equal(oraRoma('2026-11-04T17:42:00Z'), '18:42');
  assert.equal(oraRoma('2026-07-01T16:42:00Z'), '18:42');
});

test('aggiungiGiorni', () => {
  assert.equal(aggiungiGiorni('2026-03-28', 1), '2026-03-29');
  assert.equal(aggiungiGiorni('2026-03-29', 1), '2026-03-30');
  assert.equal(aggiungiGiorni('2026-12-31', 1), '2027-01-01');
  assert.equal(aggiungiGiorni('2026-11-02', -1), '2026-11-01');
});

test('giornoSettimana', () => {
  assert.equal(giornoSettimana('2026-11-04'), 'mer');
  assert.equal(giornoSettimana('2027-01-03'), 'dom');
});

test('lunediDi', () => {
  assert.equal(lunediDi('2027-01-01'), '2026-12-28');
  assert.equal(lunediDi('2026-11-02'), '2026-11-02');
  assert.equal(lunediDi('2026-11-08'), '2026-11-02');
});

test('giorniDellaSettimana', () => {
  assert.deepEqual(giorniDellaSettimana('2026-12-28'),
    ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('formatoData', () => {
  assert.equal(formatoData('2026-11-04'), 'mer 4 nov');
  assert.equal(formatoDataLunga('2026-11-04'), 'mercoledì 4 novembre');
});

test('timestamp mancanti o non validi: nessuna eccezione, "…"', () => {
  assert.equal(oraRoma(undefined), '…');
  assert.equal(oraRoma('non una data'), '…');
  assert.equal(oraRoma('2026-11-04T10:30:00+01:00'), '10:30');
  assert.equal(dataDaIso(undefined), null);
  assert.equal(dataDaIso('xx'), null);
  assert.equal(dataDaIso('2026-11-03T23:30:00Z'), '2026-11-04');
  assert.equal(formatoDataIso(null), '…');
  assert.equal(formatoDataIso('2026-11-04T08:00:00Z'), 'mer 4 nov');
});
