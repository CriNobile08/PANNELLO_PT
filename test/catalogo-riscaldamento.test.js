import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generaCatalogo, serializza } from '../scripts/catalogo-riscaldamento.js';

const da = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const sorgente = () => JSON.parse(readFileSync(da('docs/dati/riscaldamento-stretching.json'), 'utf8'));

test('generaCatalogo: 145 voci compatte con i campi attesi', () => {
  const voci = generaCatalogo(sorgente());
  assert.equal(voci.length, 145);
  for (const v of voci) {
    assert.deepEqual(Object.keys(v), ['id', 'nome', 'nomeEn', 'categoria', 'attrezzo', 'muscoli', 'livello']);
    assert.equal(typeof v.id, 'string');
    assert.equal(typeof v.nome, 'string');
    assert.ok(['cardio_warmup', 'dynamic_mobility', 'foam_rolling', 'static_stretching'].includes(v.categoria), v.categoria);
    assert.ok(Array.isArray(v.muscoli));
  }
  const femorali = voci.find((v) => v.id === '90_90_Hamstring');
  assert.deepEqual(femorali, {
    id: '90_90_Hamstring', nome: 'Femorali 90/90', nomeEn: '90/90 Hamstring', categoria: 'dynamic_mobility',
    attrezzo: 'corpo libero', muscoli: ['femorali'], livello: 'principiante',
  });
  // niente istruzioni né immagini
  assert.ok(!JSON.stringify(voci).includes('http'));
});

test('generaCatalogo: ordinato per nome (it) e deterministico', () => {
  const a = generaCatalogo(sorgente());
  const nomi = a.map((v) => v.nome);
  assert.deepEqual(nomi, [...nomi].sort((x, y) => x.localeCompare(y, 'it')));
  // l'ordine della sorgente non conta
  const b = generaCatalogo([...sorgente()].reverse());
  assert.equal(serializza(a), serializza(b));
});

test('il file generato è aggiornato', () => {
  const atteso = serializza(generaCatalogo(sorgente()));
  assert.equal(readFileSync(da('src/data/catalogo-riscaldamento.json'), 'utf8'), atteso);
});
