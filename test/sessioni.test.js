import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unisciSessioni, PRIORITA } from '../src/logic/sessioni.js';

const MIN = 60000;
const T0 = Date.parse('2026-11-04T08:00:00Z');

/** Sessione di prova: inizio in minuti da T0, durata in minuti. */
function sess(fonte, inizioMin, durataMin, extra = {}) {
  const inizio = new Date(T0 + inizioMin * MIN).toISOString();
  const fine = new Date(T0 + (inizioMin + durataMin) * MIN).toISOString();
  return {
    id: `${fonte}_${inizioMin}`, fonte, idFonte: `${inizioMin}`, data: inizio.slice(0, 10), inizio, fine,
    tipo: null, tipoOriginale: null, nome: null, durataAttivaMin: null, fcMedia: null, zoneMin: null,
    calorie: null, passi: null, distanzaM: null, dislivelloM: null, gps: null, aggiornatoIl: null,
    ...extra,
  };
}

test('una sola fonte resta com\'è', () => {
  const s = sess('googleHealth', 0, 60, { tipo: 'corsa', nome: 'Corsa', durataAttivaMin: 58, fcMedia: 140,
    zoneMin: [1, 2, 3, 4, 5], calorie: 500, passi: 9000, distanzaM: 10000, dislivelloM: 50 });
  const [u] = unisciSessioni([s]);
  assert.equal(u.id, s.id);
  assert.equal(u.data, '2026-11-04');
  assert.equal(u.inizio, s.inizio);
  assert.equal(u.fine, s.fine);
  assert.deepEqual(u.fonti, ['googleHealth']);
  assert.deepEqual(u.parti, [s]);
  for (const k of ['tipo', 'nome', 'durataAttivaMin', 'fcMedia', 'zoneMin', 'calorie', 'passi', 'distanzaM', 'dislivelloM']) {
    assert.deepEqual(u[k], s[k], k);
  }
});

test('sovrapposizione esattamente 50% unisce', () => {
  const r = unisciSessioni([sess('googleHealth', 0, 60), sess('hevy', 30, 60)]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].fonti, ['googleHealth', 'hevy']);
});

test('49% non unisce', () => {
  const r = unisciSessioni([sess('googleHealth', 0, 100), sess('hevy', 51, 100)]);
  assert.equal(r.length, 2);
});

test('stessa fonte non si unisce mai', () => {
  const r = unisciSessioni([sess('googleHealth', 0, 60), sess('googleHealth', 10, 60)]);
  assert.equal(r.length, 2);
});

test('collegamento che unirebbe due parti della stessa fonte viene saltato', () => {
  // hevy si sovrappone di più con gh1 che con gh2: vince gh1
  const gh1 = sess('googleHealth', 0, 60);
  const gh2 = sess('googleHealth', 40, 60);
  const hv = sess('hevy', 5, 60);
  const r = unisciSessioni([gh1, gh2, hv]);
  assert.equal(r.length, 2);
  const unita = r.find((x) => x.fonti.length === 2);
  assert.deepEqual(unita.parti.map((p) => p.id).sort(), [gh1.id, hv.id].sort());
});

test('tre fonti transitive', () => {
  const r = unisciSessioni([sess('hevy', 0, 60), sess('googleHealth', 30, 60), sess('strava', 60, 60)]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].fonti, ['googleHealth', 'hevy', 'strava']);
  assert.equal(r[0].inizio, new Date(T0).toISOString());
  assert.equal(r[0].fine, new Date(T0 + 120 * MIN).toISOString());
  assert.equal(r[0].id, 'hevy_0');
});

test('durata 0 non si collega', () => {
  const r = unisciSessioni([sess('googleHealth', 0, 60), sess('hevy', 30, 0)]);
  assert.equal(r.length, 2);
});

test('priorità dei campi', () => {
  const gh = sess('googleHealth', 0, 60, { fcMedia: 140, nome: 'GH', tipo: 'forza', distanzaM: 100 });
  const hv = sess('hevy', 0, 60, { fcMedia: 120, nome: 'Push day', tipo: 'pesi', distanzaM: 200 });
  const [u] = unisciSessioni([gh, hv]);
  assert.equal(u.fcMedia, 140);
  assert.equal(u.nome, 'Push day');
  assert.equal(u.tipo, 'pesi');
  assert.equal(u.distanzaM, 100); // strava/komoot assenti: googleHealth prima di hevy
});

test('valore null passa alla fonte successiva; fonte non in elenco va in coda', () => {
  const gh = sess('googleHealth', 0, 60, { fcMedia: null, calorie: 300 });
  const hv = sess('hevy', 0, 60, { fcMedia: 125 });
  const ig = sess('altra', 0, 60, { fcMedia: 99, passi: 7 });
  const [u] = unisciSessioni([ig, gh, hv]);
  assert.equal(u.fcMedia, 125);
  assert.equal(u.calorie, 300);
  assert.equal(u.passi, 7);
  assert.deepEqual(PRIORITA.tipo, ['hevy', 'strava', 'komoot', 'googleHealth']);
});

test('mezzanotte: data del giorno d\'inizio a Roma', () => {
  const s = { ...sess('googleHealth', 0, 60), inizio: '2026-11-04T22:30:00Z', fine: '2026-11-04T23:30:00Z' };
  // 23:30 Roma del 4 novembre (UTC+1)
  const [u] = unisciSessioni([s]);
  assert.equal(u.data, '2026-11-04');
  const t = { ...s, inizio: '2026-11-04T23:30:00Z', fine: '2026-11-05T00:30:00Z' };
  assert.equal(unisciSessioni([t])[0].data, '2026-11-05');
});

test('ordinamento per inizio decrescente', () => {
  const r = unisciSessioni([sess('googleHealth', 0, 30), sess('googleHealth', 500, 30), sess('hevy', 200, 30)]);
  assert.deepEqual(r.map((x) => x.inizio), [500, 200, 0].map((m) => new Date(T0 + m * MIN).toISOString()));
});

test('fonti ordinate alfabeticamente, non per inizio', () => {
  const [u] = unisciSessioni([sess('hevy', 0, 60), sess('googleHealth', 10, 60)]);
  assert.deepEqual(u.fonti, ['googleHealth', 'hevy']);
});
