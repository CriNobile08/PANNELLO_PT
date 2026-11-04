import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiGpx, analizzaGpx, sovrapposizione } from '../src/logic/gpx.js';
import { gpx, DOMParserFinto } from './fixtures/gpx.js';

const R = 6371000;
const T0 = Date.parse('2026-11-04T08:00:00Z');
/** Gradi di longitudine sull'equatore per percorrere `m` metri (emisenoverso: d = R·Δλ). */
const gradi = (m) => (m / R) * (180 / Math.PI);
/** Metri sull'equatore per `g` gradi di longitudine. */
const metri = (g) => R * g * (Math.PI / 180);

const analizza = (opzioni) => analizzaGpx(leggiGpx(gpx(opzioni), DOMParserFinto));

/** Punti sull'equatore a `passoM` metri e `passoSec` secondi l'uno dall'altro. */
function retta(n, { passoM = 10, passoSec = 3, lon0 = 0, t0 = T0, ele = null } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    lat: 0, lon: lon0 + gradi(i * passoM), time: t0 + i * passoSec * 1000,
    ...(ele ? { ele: ele(i) } : {}),
  }));
}

function nessunNaN(valore, percorso = 'risultato') {
  if (typeof valore === 'number') assert.ok(Number.isFinite(valore), `${percorso} non finito: ${valore}`);
  else if (Array.isArray(valore)) valore.forEach((v, i) => nessunNaN(v, `${percorso}[${i}]`));
  else if (valore && typeof valore === 'object') for (const [k, v] of Object.entries(valore)) nessunNaN(v, `${percorso}.${k}`);
}

const dentroCornice = ([x, y]) => x >= 40 && x <= 960 && y >= 40 && y <= 960;

test('distanza nota', () => {
  const passo = 0.001;
  const punti = Array.from({ length: 91 }, (_, i) => ({ lat: 0, lon: i * passo, time: T0 + i * 30000 }));
  const atteso = 90 * R * passo * Math.PI / 180; // ≈ 10.007,5 m
  const r = analizza({ punti });
  assert.ok(Math.abs(r.distanzaM - atteso) <= atteso * 0.005, `${r.distanzaM} vs ${atteso}`);
  assert.equal(r.durataSec, 90 * 30);
  assert.equal(r.inizio, '2026-11-04T08:00:00.000Z');
  assert.equal(r.fine, new Date(T0 + 90 * 30000).toISOString());
});

test('split con ultimo parziale', () => {
  const r = analizza({ punti: retta(844, { passoM: 10 }) }); // 8.430 m
  assert.equal(r.split.length, 9);
  r.split.slice(0, 8).forEach((s, i) => {
    assert.equal(s.km, i + 1);
    assert.equal(s.distanzaM, 1000);
    assert.equal(s.durataSec, 300);
  });
  const ultimo = r.split[8];
  assert.equal(ultimo.km, 9);
  assert.ok(Math.abs(ultimo.distanzaM - 430) <= 5, `${ultimo.distanzaM}`);
  assert.equal(ultimo.durataSec, 129);
  assert.equal(r.istantiKm.length, 8);
  assert.deepEqual(r.istantiKm.slice(0, 2), [300, 600]);
});

test('split interpolato', () => {
  const punti = [
    { lat: 0, lon: 0, time: T0 },
    { lat: 0, lon: gradi(600), time: T0 + 200000 },
    { lat: 0, lon: gradi(1200), time: T0 + 500000 },
  ];
  const r = analizza({ punti });
  // km 1 a 400 m oltre il secondo punto: 200 s + 400/600 · 300 s = 400 s
  assert.deepEqual(r.istantiKm, [400]);
  assert.equal(r.split[0].durataSec, 400);
  assert.equal(r.split.length, 2);
  assert.deepEqual(r.split[1], { km: 2, distanzaM: 200, durataSec: 100, dislivelloM: null });
});

test('ultimo split sotto 10 m omesso', () => {
  const punti = [0, 1000, 2000, 2005].map((m, i) => ({ lat: 0, lon: gradi(m), time: T0 + i * 300000 }));
  const r = analizza({ punti });
  assert.equal(r.split.length, 2);
  assert.equal(r.split[1].km, 2);
  assert.equal(r.distanzaM, 2005);
});

test('dislivello con rumore', () => {
  // 500 m di salita costante per 50 m con oscillazioni di ±0,5 m
  const r = analizza({ punti: retta(501, { passoM: 1, ele: (i) => 100 + i * 0.1 + (i % 2 ? 0.5 : -0.5) }) });
  assert.ok(Math.abs(r.dislivelloM - 50) <= 3, `${r.dislivelloM}`);
  assert.ok(Array.isArray(r.quote) && r.quote.length > 0 && r.quote.length <= 300);
  assert.deepEqual(r.quote[0], [0, 99.5]);
  assert.equal(r.quote.at(-1)[0], 1500);
});

test('senza quota', () => {
  const r = analizza({ punti: retta(301, { passoM: 10 }) });
  assert.equal(r.dislivelloM, null);
  assert.equal(r.quote, null);
  assert.ok(r.split.length > 0);
  for (const s of r.split) assert.equal(s.dislivelloM, null);
});

test('quota su meno della metà dei punti: null', () => {
  const punti = retta(10).map((p, i) => (i < 4 ? { ...p, ele: 100 + i * 5 } : p));
  const r = analizza({ punti });
  assert.equal(r.dislivelloM, null);
  assert.equal(r.quote, null);
});

test('split con dislivello', () => {
  const r = analizza({ punti: retta(201, { passoM: 10, ele: (i) => 100 + i * 0.2 }) }); // 2 km, +40 m
  assert.equal(r.split.length, 2);
  for (const s of r.split) assert.ok(Math.abs(s.dislivelloM - 20) <= 2, `${s.dislivelloM}`);
});

test('più segmenti', () => {
  const primo = retta(101, { passoM: 10 }); // 1.000 m
  const secondo = retta(51, { passoM: 10, lon0: 0.1, t0: T0 + 600000 }); // 500 m, a ~11 km di distanza
  const r = analizza({ segmenti: [primo, secondo] });
  assert.ok(Math.abs(r.distanzaM - 1500) <= 1, `${r.distanzaM}`);
  assert.equal(r.durataSec, 600 + 150);
  assert.equal(r.inMovimentoSec, 300 + 150);
  const segmenti = leggiGpx(gpx({ segmenti: [primo, secondo] }), DOMParserFinto);
  assert.equal(segmenti.length, 2);
  assert.equal(segmenti[0].length, 101);
});

test('pause', () => {
  const prima = retta(101, { passoM: 10, passoSec: 3 }); // 300 s
  const ultimo = prima.at(-1);
  const ferma = Array.from({ length: 30 }, (_, i) => ({ ...ultimo, time: ultimo.time + (i + 1) * 10000 })); // 300 s fermi
  const dopo = retta(101, { passoM: 10, passoSec: 3, lon0: ultimo.lon, t0: ultimo.time + 300000 }).slice(1);
  const r = analizza({ punti: [...prima, ...ferma, ...dopo] });
  assert.equal(r.durataSec, 900);
  assert.equal(r.inMovimentoSec, 600);
});

test('punti fermi', () => {
  const p = { lat: 45, lon: 9, ele: 100 };
  const punti = [{ ...p, time: T0 }, { ...p, time: T0 }, { ...p, time: T0 + 1000 }, { ...p, time: T0 + 1000 }];
  const r = analizza({ punti });
  nessunNaN(r);
  assert.equal(r.distanzaM, 0);
  assert.equal(r.inMovimentoSec, 0);
  assert.deepEqual(r.split, []);
  assert.ok(r.percorso.length >= 1);
  for (const q of r.percorso) assert.ok(dentroCornice(q));
});

test('tempi con offset', () => {
  const conOffset = analizza({ punti: [
    { lat: 0, lon: 0, time: '2026-11-04T09:00:00+01:00' },
    { lat: 0, lon: 0.01, time: '2026-11-04T09:05:00+01:00' },
  ] });
  const inZ = analizza({ punti: [
    { lat: 0, lon: 0, time: '2026-11-04T08:00:00Z' },
    { lat: 0, lon: 0.01, time: '2026-11-04T08:05:00Z' },
  ] });
  assert.equal(conOffset.inizio, '2026-11-04T08:00:00.000Z');
  assert.equal(conOffset.inizio, inZ.inizio);
  assert.equal(conOffset.fine, inZ.fine);
});

test('sfoltimento', () => {
  // longitudine crescente, latitudine ondulata con 10 periodi tra 44,998 e 45,002
  const n = 2000;
  const lat = (i) => 45 + 0.002 * Math.sin((i * Math.PI) / 100);
  const punti = Array.from({ length: n }, (_, i) => ({
    lat: lat(i), lon: 9 + (0.02 * i) / (n - 1), ele: 200 + 10 * Math.sin(i / 50), time: T0 + i * 1000,
  }));
  const r = analizza({ punti });
  assert.ok(r.percorso.length <= 300, `${r.percorso.length}`);
  assert.ok(r.percorso.length > 10);
  // proiezione a mano: lat0 = 45, estensione orizzontale 0,02·cos 45° → scala 920 / estensione
  const scala = 920 / (0.02 * Math.cos(Math.PI / 4));
  const vicino = (a, b) => Math.abs(a - b) <= 0.11;
  const [x0, y0] = r.percorso[0];
  assert.ok(vicino(x0, 40) && vicino(y0, 500), `${x0},${y0}`);
  const [x1, y1] = r.percorso.at(-1);
  const yAtteso = 500 - (lat(n - 1) - 45) * scala;
  assert.ok(vicino(x1, 960) && vicino(y1, yAtteso), `${x1},${y1} vs 960,${yAtteso}`);
  assert.ok(r.quote.length <= 300, `${r.quote.length}`);
  assert.deepEqual(r.quote[0], [0, 200]);
  assert.equal(r.quote.at(-1)[0], n - 1);
});

test('proiezione nella cornice', () => {
  // percorso verticale: x centrata a 500, y occupa tutta la cornice
  const punti = Array.from({ length: 50 }, (_, i) => ({ lat: 45 + i * 0.0005, lon: 9 + (i % 2) * 0.0001, time: T0 + i * 5000 }));
  const r = analizza({ punti });
  for (const q of [...r.percorso, ...r.segniKm]) assert.ok(dentroCornice(q), `${q}`);
  const ys = r.percorso.map(([, y]) => y);
  assert.equal(Math.min(...ys), 40);
  assert.equal(Math.max(...ys), 960);
  assert.equal(r.percorso[0][1], 960); // sud in basso
  const xs = r.percorso.map(([x]) => x);
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 500) <= 0.1);
});

test('segniKm', () => {
  const r = analizza({ punti: retta(351, { passoM: 10 }) }); // 3,5 km
  assert.equal(r.segniKm.length, 3);
  assert.equal(r.istantiKm.length, 3);
  // sull'equatore, retta orizzontale: il km k è a k/3,5 della larghezza
  r.segniKm.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - (40 + (920 * (i + 1) * 1000) / 3500)) <= 0.1, `${x}`);
    assert.equal(y, 500);
  });
  for (const q of r.segniKm) assert.ok(dentroCornice(q));
});

test('file non valido', () => {
  const nonValido = (e) => e?.codice === 'non_valido';
  assert.throws(() => leggiGpx(gpx({ punti: [{ lat: 0, lon: 0, time: T0 }] }), DOMParserFinto), nonValido);
  assert.throws(() => leggiGpx(gpx({ punti: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }] }), DOMParserFinto), nonValido);
  assert.throws(() => leggiGpx('ciao', DOMParserFinto), nonValido);
  assert.throws(() => leggiGpx(gpx({ punti: [
    { lat: 'x', lon: 0, time: T0 }, { lat: 0, lon: 0, time: 'ieri' }, { lat: 0, lon: 0, time: T0 },
  ] }), DOMParserFinto), nonValido);
});

test('punti senza ora scartati, quota facoltativa', () => {
  const s = leggiGpx(gpx({ punti: [
    { lat: 45, lon: 9, ele: 120.5, time: T0 },
    { lat: 45.001, lon: 9 },
    { lat: 45.002, lon: 9, time: T0 + 10000 },
  ] }), DOMParserFinto);
  assert.deepEqual(s, [[
    { lat: 45, lon: 9, ele: 120.5, t: T0 },
    { lat: 45.002, lon: 9, ele: null, t: T0 + 10000 },
  ]]);
});

test('sovrapposizione', () => {
  const iso = (min) => new Date(T0 + min * 60000).toISOString();
  assert.equal(sovrapposizione({ inizio: iso(0), fine: iso(60) }, { inizio: iso(30), fine: iso(90) }), 0.5);
  assert.equal(sovrapposizione({ inizio: iso(0), fine: iso(60) }, { inizio: iso(60), fine: iso(90) }), 0);
  assert.equal(sovrapposizione({ inizio: iso(0), fine: iso(60) }, { inizio: iso(0), fine: iso(60) }), 1);
  assert.equal(sovrapposizione({ inizio: iso(10), fine: iso(20) }, { inizio: iso(0), fine: iso(60) }), 1);
  assert.equal(sovrapposizione({ inizio: iso(0), fine: iso(0) }, { inizio: iso(0), fine: iso(60) }), 0);
});

test('GPX grande (150.000 punti) senza superare lo stack', () => {
  const n = 150000;
  const segmenti = [Array.from({ length: n }, (_, i) => ({
    lat: 45 + 0.01 * Math.sin(i / 500), lon: 9 + i * 0.00002, ele: 200 + 20 * Math.sin(i / 3000), t: T0 + i * 1000,
  }))];
  const r = analizzaGpx(segmenti);
  assert.ok(r.percorso.length <= 300, `${r.percorso.length}`);
  assert.ok(r.quote.length <= 300);
  for (const q of r.percorso) assert.ok(dentroCornice(q));
  nessunNaN(r);
});
