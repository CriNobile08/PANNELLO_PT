import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizza, filtraCatalogo, ETICHETTE_GRUPPI, ETICHETTE_ATTREZZI, ETICHETTE_CATEGORIE, etichetta } from '../src/logic/catalogo.js';

const HEVY = [
  { id: 'a1', nome: 'Bench Press (Barbell)', gruppo: 'chest', attrezzo: 'barbell' },
  { id: 'a2', nome: 'Incline Bench Press (Dumbbell)', gruppo: 'chest', attrezzo: 'dumbbell' },
  { id: 'a3', nome: 'Squat (Barbell)', gruppo: 'quadriceps', attrezzo: 'barbell' },
  { id: 'a4', nome: 'Close Grip Bench Press', gruppo: 'triceps', attrezzo: 'barbell' },
  { id: 'a5', nome: 'Push Up', gruppo: 'chest', attrezzo: 'none' },
];
const LOCALE = [
  { id: 'l1', nome: 'Rotazioni del busto', nomeEn: 'Torso Rotation', categoria: 'dynamic_mobility', muscoli: ['addominali'] },
  { id: 'l2', nome: 'Allungamento dei femorali', nomeEn: 'Hamstring Stretch', categoria: 'static_stretching', muscoli: ['femorali', 'polpacci'] },
  { id: 'l3', nome: 'Polpacci al muro', nomeEn: 'Calf Stretch', categoria: 'static_stretching', muscoli: ['polpacci'] },
  { id: 'l4', nome: 'Cyclette', nomeEn: 'Bicycling, Stationary', categoria: 'cardio_warmup', muscoli: ['quadricipiti'] },
  { id: 'l5', nome: 'Città è già Più', categoria: 'foam_rolling', muscoli: [] },
];
const ids = (v) => v.map((x) => x.id);

test('normalizza: minuscole senza accenti', () => {
  assert.equal(normalizza('Città È GIÀ più'), 'citta e gia piu');
  assert.equal(normalizza(''), '');
  assert.equal(normalizza(undefined), '');
  assert.equal(normalizza(null), '');
});

test('filtraCatalogo: senza testo né filtri → tutte, alfabetico', () => {
  assert.deepEqual(ids(filtraCatalogo(HEVY, {})), ['a1', 'a4', 'a2', 'a5', 'a3']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: '   ', filtri: {} })), ['a1', 'a4', 'a2', 'a5', 'a3']);
});

test('filtraCatalogo: ricerca multi-parola, in qualunque ordine', () => {
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'press bench' })), ['a1', 'a4', 'a2']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'bench dumbbell' })), ['a2']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'bench squat' })), []);
});

test('filtraCatalogo: accenti e maiuscole non contano', () => {
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { testo: 'CITTA gia' })), ['l5']);
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { testo: 'più' })), ['l5']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'BENCH' })), ['a1', 'a4', 'a2']);
});

test('filtraCatalogo: cerca anche nel nome inglese', () => {
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { testo: 'hamstring' })), ['l2']);
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { testo: 'stretch' })), ['l2', 'l3']);
  // parole divise tra nome e nome inglese
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { testo: 'cyclette stationary' })), ['l4']);
});

test('filtraCatalogo: filtri singoli e combinati', () => {
  assert.deepEqual(ids(filtraCatalogo(HEVY, { filtri: { gruppo: 'chest' } })), ['a1', 'a2', 'a5']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { filtri: { gruppo: 'chest', attrezzo: 'barbell' } })), ['a1']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'bench', filtri: { gruppo: 'chest' } })), ['a1', 'a2']);
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { filtri: { categoria: 'static_stretching' } })), ['l2', 'l3']);
  // valore vuoto o null = "Tutti"
  assert.deepEqual(ids(filtraCatalogo(HEVY, { filtri: { gruppo: '', attrezzo: null } })).length, 5);
});

test('filtraCatalogo: filtro su campo array = appartenenza', () => {
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { filtri: { muscoli: 'polpacci' } })), ['l2', 'l3']);
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { filtri: { muscoli: 'femorali' } })), ['l2']);
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { filtri: { muscoli: 'collo' } })), []);
});

test('filtraCatalogo: prima chi inizia con il testo, poi alfabetico', () => {
  // "Close Grip Bench Press" e "Incline Bench Press" non iniziano con "bench"
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'bench' })), ['a1', 'a4', 'a2']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'press' })), ['a1', 'a4', 'a2']);
  assert.deepEqual(ids(filtraCatalogo(HEVY, { testo: 'incline' })), ['a2']);
  const voci = [{ id: 'x', nome: 'B squat' }, { id: 'y', nome: 'Squat A' }, { id: 'z', nome: 'A squat' }];
  assert.deepEqual(ids(filtraCatalogo(voci, { testo: 'squat' })), ['y', 'z', 'x']);
  // inizia con il testo anche nel nome inglese
  assert.deepEqual(ids(filtraCatalogo(LOCALE, { testo: 'calf' })), ['l3']);
});

test('filtraCatalogo: al massimo 50 (o il limite dato)', () => {
  const molte = Array.from({ length: 120 }, (_, i) => ({ id: `e${i}`, nome: `Esercizio ${String(i).padStart(3, '0')}` }));
  const r = filtraCatalogo(molte, {});
  assert.equal(r.length, 50);
  assert.equal(r[0].id, 'e0');
  assert.equal(filtraCatalogo(molte, {}, 10).length, 10);
  assert.equal(filtraCatalogo(molte, { testo: 'esercizio 11' }).length, 11);
});

test('filtraCatalogo: voci senza nome o input mancante non rompono', () => {
  assert.deepEqual(filtraCatalogo(undefined, {}), []);
  assert.deepEqual(ids(filtraCatalogo([{ id: 'n' }, { id: 'm', nome: 'Panca' }], { testo: 'panca' })), ['m']);
  assert.deepEqual(ids(filtraCatalogo([{ id: 'm', nome: 'Panca' }])), ['m']);
});

test('etichette: chiavi Hevy e categorie in italiano', () => {
  assert.equal(Object.keys(ETICHETTE_GRUPPI).length, 20);
  assert.equal(ETICHETTE_GRUPPI.chest, 'Petto');
  assert.equal(ETICHETTE_GRUPPI.full_body, 'Corpo intero');
  assert.equal(ETICHETTE_GRUPPI.upper_back, 'Dorso alto');
  assert.equal(ETICHETTE_GRUPPI.other, 'Altro');
  assert.equal(Object.keys(ETICHETTE_ATTREZZI).length, 9);
  assert.equal(ETICHETTE_ATTREZZI.none, 'Corpo libero');
  assert.equal(ETICHETTE_ATTREZZI.resistance_band, 'Elastico');
  assert.deepEqual(ETICHETTE_CATEGORIE, {
    cardio_warmup: 'Riscaldamento cardio', dynamic_mobility: 'Mobilità dinamica',
    foam_rolling: 'Foam roller', static_stretching: 'Stretching statico',
  });
});

test('etichetta: chiave sconosciuta → la chiave stessa', () => {
  assert.equal(etichetta(ETICHETTE_GRUPPI, 'chest'), 'Petto');
  assert.equal(etichetta(ETICHETTE_GRUPPI, 'tail'), 'tail');
  assert.equal(etichetta(ETICHETTE_ATTREZZI, 'trx_cable'), 'trx_cable');
  assert.equal(etichetta(ETICHETTE_CATEGORIE, 'yoga'), 'yoga');
  // proprietà ereditate non sono etichette
  assert.equal(etichetta(ETICHETTE_GRUPPI, 'toString'), 'toString');
  assert.equal(etichetta(ETICHETTE_GRUPPI, null), '');
});
