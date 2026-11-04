import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggiungiFcPerOrario } from '../src/sync/fcPerOrario.js';
import { ErroreSync } from '../src/sync/errore.js';

const INIZIO = '2026-11-04T22:10:00Z';
const FINE = '2026-11-04T22:27:00Z';
const op = (data, extra = {}) => ({ op: 'set', collection: 'sessioni', doc_id: `hevy_${data.idFonte ?? 'x'}`, data: { fonte: 'hevy', idFonte: 'w1', inizio: INIZIO, fine: FINE, eliminata: false, ...data }, ...extra });

test('la sessione Hevy riceve fcSerie con massima e media', async () => {
  const operazioni = [op({})];
  const chiamate = [];
  const r = await aggiungiFcPerOrario({ operazioni, leggiFc: async (i, f) => {
    chiamate.push([i, f]);
    return [{ t: '2026-11-04T22:10:03Z', bpm: 120 }, { t: '2026-11-04T22:10:15Z', bpm: 130 }];
  } });
  assert.deepEqual(chiamate, [[INIZIO, FINE]]);
  const s = operazioni[0].data.fcSerie;
  assert.equal(s.inizio, INIZIO);
  assert.equal(s.massima, 130);
  assert.equal(s.media, 125);
  assert.deepEqual(r, { fcSessioni: 1, fallite: 0 });
});

test('eliminate, non Hevy e senza estremi sono ignorate', async () => {
  const operazioni = [
    op({ eliminata: true }),
    op({ fonte: 'googleHealth' }),
    { op: 'set', collection: 'salute', doc_id: 'x', data: { fonte: 'hevy', inizio: INIZIO, fine: FINE } },
    op({ fine: undefined }),
    op({ inizio: 'boh' }),
  ];
  let n = 0;
  const r = await aggiungiFcPerOrario({ operazioni, leggiFc: async () => { n++; return []; } });
  assert.equal(n, 0);
  assert.deepEqual(r, { fcSessioni: 0, fallite: 0 });
  assert.ok(operazioni.every((o) => !('fcSerie' in o.data)));
});

test('errore generico: fcSerie null, conteggia e continua', async () => {
  const operazioni = [op({ idFonte: 'a' }), op({ idFonte: 'b' })];
  let n = 0;
  const r = await aggiungiFcPerOrario({ operazioni, leggiFc: async () => {
    if (n++ === 0) throw new Error('giù');
    return [{ t: '2026-11-04T22:11:00Z', bpm: 100 }];
  } });
  assert.equal(operazioni[0].data.fcSerie, null);
  assert.equal(operazioni[1].data.fcSerie.massima, 100);
  assert.deepEqual(r, { fcSessioni: 1, fallite: 1 });
});

for (const codice of ['autorizzazione', 'configurazione']) {
  test(`${codice}: interrompe le letture senza lanciare`, async () => {
    const operazioni = [op({ idFonte: 'a' }), op({ idFonte: 'b' }), op({ idFonte: 'c' })];
    let n = 0;
    const r = await aggiungiFcPerOrario({ operazioni, leggiFc: async () => { n++; throw new ErroreSync(codice, 'x'); } });
    assert.equal(n, 1);
    assert.ok(operazioni.every((o) => o.data.fcSerie === null));
    assert.deepEqual(r, { fcSessioni: 0, fallite: 3 });
  });
}
