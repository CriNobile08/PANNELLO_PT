import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fontiStato } from '../src/logic/statoSync.js';

test('formato nuovo', () => {
  const stato = {
    ultimaEsecuzione: '2026-11-04T09:52:00Z', esito: 'parziale',
    fonti: {
      googleHealth: { esito: 'ok', messaggio: '', tipiMancanti: [], conteggi: { giorni: 3, sessioni: 1 } },
      hevy: { esito: 'errore', codice: 'rete', messaggio: 'Hevy non raggiungibile' },
    },
  };
  assert.deepEqual(fontiStato(stato), [
    { nome: 'Orologio', esito: 'ok', messaggio: '' },
    { nome: 'Hevy', esito: 'errore', messaggio: 'Hevy non raggiungibile' },
  ]);
});

test('formato vecchio del 2a', () => {
  const stato = { ultimaEsecuzione: '2026-11-04T09:52:00Z', esito: 'errore', messaggio: 'Autorizzazione Google scaduta: va rinnovato il token', tipiMancanti: [], conteggi: {} };
  assert.deepEqual(fontiStato(stato), [{ nome: 'Orologio', esito: 'errore', messaggio: 'Autorizzazione Google scaduta: va rinnovato il token' }]);
});

test('fonte sconosciuta e campi mancanti', () => {
  assert.deepEqual(fontiStato({ esito: 'ok', fonti: { strava: { esito: 'ok' } } }), [{ nome: 'strava', esito: 'ok', messaggio: '' }]);
  assert.deepEqual(fontiStato(null), []);
});
