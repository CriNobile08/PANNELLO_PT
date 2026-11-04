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

import { parteDaCollegare } from '../src/ui/cliente/scheda-attivita.js';

test('parteDaCollegare: la parte Google Health più lunga', () => {
  const s = { parti: [
    { id: 'hevy_w1', fonte: 'hevy', inizio: '2026-11-04T07:00:00Z', fine: '2026-11-04T09:00:00Z' },
    { id: 'googleHealth_a', fonte: 'googleHealth', inizio: '2026-11-04T07:10:00Z', fine: '2026-11-04T07:40:00Z' },
    { id: 'googleHealth_b', fonte: 'googleHealth', inizio: '2026-11-04T07:11:00Z', fine: '2026-11-04T08:00:00Z' },
  ] };
  assert.equal(parteDaCollegare(s), 'googleHealth_b');
});

test('parteDaCollegare: senza Google Health la prima per inizio; senza parti null', () => {
  const s = { parti: [
    { id: 'hevy_2', fonte: 'hevy', inizio: '2026-11-04T08:00:00Z', fine: '2026-11-04T09:00:00Z' },
    { id: 'hevy_1', fonte: 'hevy', inizio: '2026-11-04T07:00:00Z', fine: '2026-11-04T07:30:00Z' },
  ] };
  assert.equal(parteDaCollegare(s), 'hevy_1');
  assert.equal(parteDaCollegare({ parti: [] }), null);
  assert.equal(parteDaCollegare(null), null);
});
