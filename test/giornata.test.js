import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvisoRilevamento } from '../src/ui/cliente/giornata.js';

const base = { haScheda: true, voce: { principaleFatto: false, rilevamentoIgnorato: false }, sessioniGiorno: [{ id: 's1' }] };

test('avvisoRilevamento: vero con le quattro condizioni', () => {
  assert.equal(avvisoRilevamento(base), true);
});

test('avvisoRilevamento: senza diario (voce null) è vero', () => {
  assert.equal(avvisoRilevamento({ ...base, voce: null }), true);
});

test('avvisoRilevamento: una condizione falsa alla volta', () => {
  assert.equal(avvisoRilevamento({ ...base, haScheda: false }), false);
  assert.equal(avvisoRilevamento({ ...base, voce: { principaleFatto: true, rilevamentoIgnorato: false } }), false);
  assert.equal(avvisoRilevamento({ ...base, voce: { principaleFatto: false, rilevamentoIgnorato: true } }), false);
  assert.equal(avvisoRilevamento({ ...base, sessioniGiorno: [] }), false);
});
