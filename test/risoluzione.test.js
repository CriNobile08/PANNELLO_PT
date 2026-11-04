import { test } from 'node:test';
import assert from 'node:assert/strict';
import { risolviGiorno, risolviSettimana, eccezioniSpostamento, usiScheda } from '../src/logic/risoluzione.js';

const giorni = (o) => ({ lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null, ...o });
const v1 = { id: 'v1', numero: 1, validaDal: '2026-10-05', creataIl: '2026-10-04T10:00:00Z', giorni: giorni({ sab: 'trek' }) };
const v2 = { id: 'v2', numero: 2, validaDal: '2026-10-26', creataIl: '2026-10-25T10:00:00Z',
  giorni: giorni({ lun: 'gambe', mar: 'corsa', mer: 'spinta', ven: 'tirata' }) };
const v3 = { id: 'v3', numero: 3, validaDal: '2026-11-16', creataIl: '2026-11-03T10:00:00Z', giorni: giorni({ mer: 'gambe' }) };
const eccezioni = {
  '2026-11-05': { schedaId: 'tirata', origine: '2026-11-06' },
  '2026-11-06': { schedaId: null, origine: null },
};
const dati = { settimane: [v1, v2, v3], eccezioni };

test('risolviGiorno', () => {
  assert.partialDeepStrictEqual(risolviGiorno('2026-11-04', dati), { schedaId: 'spinta', fonte: 'settimana', versione: v2 });
  assert.partialDeepStrictEqual(risolviGiorno('2026-11-05', dati), { schedaId: 'tirata', fonte: 'eccezione' });
  assert.partialDeepStrictEqual(risolviGiorno('2026-11-06', dati), { schedaId: null, fonte: 'eccezione' });
  assert.partialDeepStrictEqual(risolviGiorno('2026-10-01', dati), { schedaId: null, fonte: 'nessuna' });
  assert.equal(risolviGiorno('2026-11-11', dati).schedaId, 'spinta');
  assert.equal(risolviGiorno('2026-11-18', dati).schedaId, 'gambe');
});

test('risolviSettimana', () => {
  assert.equal(risolviSettimana('2026-11-02', dati).length, 7);
  assert.equal(risolviSettimana('2026-11-02', dati)[3].giorno, 'gio');
});

test('eccezioniSpostamento', () => {
  assert.deepEqual(eccezioniSpostamento('2026-11-06', '2026-11-05', 'tirata'), [
    { data: '2026-11-05', doc: { schedaId: 'tirata', origine: '2026-11-06' } },
    { data: '2026-11-06', doc: { schedaId: null, origine: null } },
  ]);
});

test('usiScheda', () => {
  assert.deepEqual(usiScheda('trek', dati, '2026-11-04'), []);
  assert.deepEqual(usiScheda('spinta', dati, '2026-11-04'), [{ tipo: 'settimana', versione: v2 }]);
  assert.deepEqual(usiScheda('gambe', dati, '2026-11-04'),
    [{ tipo: 'settimana', versione: v2 }, { tipo: 'settimana', versione: v3 }]);
  assert.deepEqual(usiScheda('tirata', { settimane: [], eccezioni: { '2026-11-03': { schedaId: 'tirata' }, '2026-11-04': { schedaId: 'tirata' } } }, '2026-11-04'),
    [{ tipo: 'eccezione', data: '2026-11-04' }]);
});
