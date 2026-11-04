import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serieFc, statisticheFc, fcPerKm } from '../src/logic/fc.js';

const T0 = Date.parse('2026-11-04T08:00:00Z');
const iso = (sec) => new Date(T0 + sec * 1000).toISOString();
const camp = (sec, bpm) => ({ t: iso(sec), bpm });

test('blocchi da 10 s', () => {
  const s = serieFc([camp(0, 100), camp(3, 110), camp(6, 120), camp(12, 130)], iso(0), iso(25));
  assert.equal(s.passoSec, 10);
  assert.equal(s.inizio, iso(0));
  assert.deepEqual(s.bpm, [110, 130, null]);
});

test('campioni fuori intervallo scartati', () => {
  const s = serieFc([camp(-1, 200), camp(5, 100), camp(20, 150), camp(25, 160)], iso(0), iso(20));
  assert.deepEqual(s.bpm, [100, null]);
});

test('stringhe e valori non positivi', () => {
  const s = serieFc([camp(1, '120'), camp(2, 0), camp(3, -5), camp(4, 'x')], iso(0), iso(10));
  assert.deepEqual(s.bpm, [120]);
});

test('arrotondamento', () => {
  const s = serieFc([camp(1, 100), camp(2, 101)], iso(0), iso(10));
  assert.deepEqual(s.bpm, [101]);
});

test('statisticheFc', () => {
  assert.deepEqual(statisticheFc({ passoSec: 10, inizio: iso(0), bpm: [100, null, 120, 140] }), { media: 120, massima: 140 });
  assert.equal(statisticheFc({ passoSec: 10, inizio: iso(0), bpm: [null, null] }), null);
  assert.equal(statisticheFc(null), null);
});

test('fcPerKm allinea inizioGpx a fcSerie.inizio', () => {
  const bpm = Array.from({ length: 30 }, (_, i) => (i < 16 ? 100 : 140));
  const fcSerie = { passoSec: 10, inizio: iso(0), bpm };
  assert.deepEqual(fcPerKm(fcSerie, iso(60), [100], 150), [100, 140]);
  assert.deepEqual(fcPerKm(null, iso(60), [100], 150), [null, null]);
  assert.deepEqual(fcPerKm({ ...fcSerie, bpm: [100] }, iso(600), [100], 150), [null, null]);
});

test('massima e media dai campioni, non dai blocchi', () => {
  // blocco 0: 128,128,130 -> media 129; il picco 130 non deve sparire
  const s = serieFc([camp(1, 128), camp(2, 128), camp(3, 130)], iso(0), iso(20));
  assert.deepEqual(s.bpm, [129, null]);
  assert.equal(s.massima, 130);
  assert.equal(s.media, 129);
});

test('media dei campioni diversa dalla media dei blocchi', () => {
  // blocco 0: 100,100,100 -> 100; blocco 1: 140 -> 140. Blocchi: 120; campioni: 110
  const s = serieFc([camp(1, 100), camp(2, 100), camp(3, 100), camp(12, 140)], iso(0), iso(20));
  assert.deepEqual(s.bpm, [100, 140]);
  assert.equal(s.media, 110);
  assert.equal(s.massima, 140);
  assert.equal(statisticheFc(s).media, 110);
});

test('massima intera e solo campioni validi', () => {
  const s = serieFc([camp(1, '120.4'), camp(2, 0), camp(3, 'x'), camp(50, 200)], iso(0), iso(20));
  assert.equal(s.massima, 120);
  assert.equal(s.media, 120);
});

test('nessun campione valido: massima e media null', () => {
  const s = serieFc([camp(-5, 100), camp(2, 0)], iso(0), iso(20));
  assert.equal(s.massima, null);
  assert.equal(s.media, null);
  assert.equal(statisticheFc(s), null);
});

test('statisticheFc usa i campi nuovi se presenti', () => {
  assert.deepEqual(statisticheFc({ bpm: [100, 120], media: 111, massima: 130 }), { media: 111, massima: 130 });
});

test('statisticheFc ricade sui blocchi senza i campi nuovi', () => {
  assert.deepEqual(statisticheFc({ bpm: [100, null, 120] }), { media: 110, massima: 120 });
  assert.deepEqual(statisticheFc({ bpm: [100, 120], media: null, massima: 'x' }), { media: 110, massima: 120 });
});
