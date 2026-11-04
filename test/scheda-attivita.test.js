import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trovaTracciato } from '../src/ui/cliente/scheda-attivita.js';

const sessione = { id: 'googleHealth_1', parti: [{ id: 'googleHealth_1' }, { id: 'hevy_w1' }] };

test('trovaTracciato: cerca tra tutte le parti', () => {
  const t = { idParte: 'hevy_w1' };
  assert.equal(trovaTracciato(sessione, { hevy_w1: t, altro: {} }), t);
});

test('trovaTracciato: la prima parte con un tracciato vince', () => {
  const a = { idParte: 'googleHealth_1' };
  assert.equal(trovaTracciato(sessione, { hevy_w1: {}, googleHealth_1: a }), a);
});

test('trovaTracciato: nessun tracciato o dati mancanti → null', () => {
  assert.equal(trovaTracciato(sessione, {}), null);
  assert.equal(trovaTracciato(sessione, undefined), null);
  assert.equal(trovaTracciato(null, { x: {} }), null);
});
