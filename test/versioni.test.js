import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versioneValida, versioniFuture, revisionePerGiorno, prossimoNumero } from '../src/logic/versioni.js';

test('versioni', () => {
  const v1 = { id: 'v1', numero: 1, validaDal: '2026-10-05', creataIl: '2026-10-04T10:00:00Z' };
  const v2 = { id: 'v2', numero: 2, validaDal: '2026-10-26', creataIl: '2026-10-25T10:00:00Z' };
  const v3 = { id: 'v3', numero: 3, validaDal: '2026-11-16', creataIl: '2026-11-03T10:00:00Z' };
  const tutte = [v3, v1, v2];
  assert.equal(versioneValida(tutte, '2026-11-04'), v2);
  assert.equal(versioneValida(tutte, '2026-10-26'), v2);
  assert.equal(versioneValida(tutte, '2026-10-25'), v1);
  assert.equal(versioneValida(tutte, '2026-10-01'), null);
  assert.equal(versioneValida([], '2026-11-04'), null);
  const a = { validaDal: '2026-11-04', salvataIl: '2026-11-04T08:00:00Z' };
  const b = { validaDal: '2026-11-04', salvataIl: '2026-11-04T09:00:00Z' };
  assert.equal(versioneValida([b, a], '2026-11-04'), b);
  assert.deepEqual(versioniFuture(tutte, '2026-11-04'), [v3]);
  const r = { validaDal: '2026-11-04', salvataIl: '2026-11-04T08:00:00Z' };
  assert.equal(revisionePerGiorno([r], '2026-11-02'), r);
  assert.equal(revisionePerGiorno([], '2026-11-02'), null);
  assert.equal(prossimoNumero([]), 1);
  assert.equal(prossimoNumero([{ numero: 3 }, { numero: 1 }]), 4);
});

test('revisionePerGiorno: nessuna valida, più revisioni nello stesso giorno → la salvata per prima', () => {
  const prima = { id: 'zz', validaDal: '2026-11-04', salvataIl: '2026-11-04T08:00:00Z' };
  const seconda = { id: 'aa', validaDal: '2026-11-04', salvataIl: '2026-11-04T09:00:00Z' };
  const senzaSalvata = { id: 'mm', validaDal: '2026-11-04', creataIl: '2026-11-04T07:00:00Z' };
  assert.equal(revisionePerGiorno([prima, seconda], '2026-11-02'), prima);
  assert.equal(revisionePerGiorno([seconda, prima], '2026-11-02'), prima);
  assert.equal(revisionePerGiorno([seconda, senzaSalvata, prima], '2026-11-02'), senzaSalvata);
  const piuTardi = { id: 'b', validaDal: '2026-11-05', salvataIl: '2026-11-04T01:00:00Z' };
  assert.equal(revisionePerGiorno([piuTardi, seconda, prima], '2026-11-02'), prima);
});
