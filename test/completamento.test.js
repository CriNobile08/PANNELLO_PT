import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statoBlocchi } from '../src/logic/completamento.js';

const E = (nome) => ({ nome, durataSec: 60, serie: null, ripetizioni: null, perLato: false, nota: '' });
const rev = { riscaldamento: [E('a'), E('b'), E('c')], principale: [], stretching: [E('x'), E('y')] };

test('statoBlocchi', () => {
  assert.deepEqual(statoBlocchi(rev, undefined), { riscaldamento: false, principale: false, stretching: false, completati: 0 });
  assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [0, 1, 2] }).completati, 1);
  assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [0, 1, 5] }).riscaldamento, false);
  assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [2, 0, 1, 7] }).riscaldamento, true);
  assert.equal(statoBlocchi({ ...rev, stretching: [] }, {}).stretching, true);
  assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [0,1,2], stretchingFatti: [0,1], principaleFatto: true }).completati, 3);
  assert.equal(statoBlocchi(null, { principaleFatto: true }).completati, 0);
});
