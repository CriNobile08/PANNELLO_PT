import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBIETTIVO_SONNO_PREDEFINITO, percentualeSonno, minutiPisolini, medie30, recupero } from '../src/logic/indici.js';
import { aggiungiGiorni } from '../src/logic/date.js';

const OGGI = '2026-11-04';

/** Costruisce `n` giorni precedenti a OGGI con i valori dati. */
function storico(n, fc, hrv) {
  const salute = {};
  for (let i = 1; i <= n; i++) {
    const doc = { fcRiposo: fc };
    if (hrv !== undefined) doc.hrv = { rmssd: hrv };
    salute[aggiungiGiorni(OGGI, -i)] = doc;
  }
  return salute;
}

test('percentualeSonno', () => {
  assert.equal(OBIETTIVO_SONNO_PREDEFINITO, 480);
  assert.equal(percentualeSonno({ sonno: { minutiAddormentato: 412 } }, 480), 86);
  assert.equal(percentualeSonno({ sonno: { minutiAddormentato: 600 } }, 480), 100);
  assert.equal(percentualeSonno({ sonno: { minutiAddormentato: 240 } }), 50);
  assert.equal(percentualeSonno({ sonno: { minutiAddormentato: 240 } }, undefined), 50);
  assert.equal(percentualeSonno({ sonno: { minutiAddormentato: 240 } }, 0), 50);
  assert.equal(percentualeSonno({ sonno: { minutiAddormentato: 240 } }, 600), 40);
  assert.equal(percentualeSonno({ sonno: null }), null);
  assert.equal(percentualeSonno({}), null);
  assert.equal(percentualeSonno(undefined), null);
});

test('minutiPisolini somma', () => {
  assert.equal(minutiPisolini({ pisolini: [{ minutiAddormentato: 20 }, { minutiAddormentato: 15 }] }), 35);
  assert.equal(minutiPisolini({ pisolini: [] }), 0);
  assert.equal(minutiPisolini({}), 0);
  assert.equal(minutiPisolini(undefined), 0);
});

test('medie30: oggi escluso, solo valori finiti > 0, finestra 30 giorni', () => {
  const salute = {
    [OGGI]: { fcRiposo: 100, hrv: { rmssd: 100 } },
    [aggiungiGiorni(OGGI, -1)]: { fcRiposo: 50, hrv: { rmssd: 40 } },
    [aggiungiGiorni(OGGI, -30)]: { fcRiposo: 60, hrv: { rmssd: 60 } },
    [aggiungiGiorni(OGGI, -31)]: { fcRiposo: 999, hrv: { rmssd: 999 } },
    [aggiungiGiorni(OGGI, -2)]: { fcRiposo: 0, hrv: { rmssd: NaN } },
    [aggiungiGiorni(OGGI, -3)]: { fcRiposo: '55', hrv: null },
    [aggiungiGiorni(OGGI, -4)]: {},
  };
  assert.deepEqual(medie30(salute, OGGI), { fc: 55, nFc: 2, hrv: 50, nHrv: 2 });
  assert.deepEqual(medie30({}, OGGI), { fc: null, nFc: 0, hrv: null, nHrv: 0 });
});

test('recupero: nessun dato senza fcRiposo oggi', () => {
  const s = storico(10, 54);
  assert.equal(recupero(s, OGGI).stato, 'nessun-dato');
  s[OGGI] = { fcRiposo: 0 };
  assert.deepEqual(recupero(s, OGGI), { stato: 'nessun-dato', fc: null, freccia: null, indice: null });
  s[OGGI] = { fcRiposo: 'x' };
  assert.equal(recupero(s, OGGI).stato, 'nessun-dato');
});

test('recupero: calibrazione con 6 valori, ok con 7', () => {
  const s6 = storico(6, 54);
  s6[OGGI] = { fcRiposo: 54 };
  const r6 = recupero(s6, OGGI);
  assert.equal(r6.stato, 'calibrazione');
  assert.equal(r6.fc, 54);
  assert.equal(r6.indice, null);
  const s7 = storico(7, 54);
  s7[OGGI] = { fcRiposo: 54 };
  assert.equal(recupero(s7, OGGI).stato, 'ok');
});

test('recupero: in linea con la media = 50', () => {
  const s = storico(10, 54, 40);
  s[OGGI] = { fcRiposo: 54, hrv: { rmssd: 40 } };
  const r = recupero(s, OGGI);
  assert.equal(r.indice, 50);
  assert.equal(r.freccia, 'uguale');
});

test('recupero: miglioramento 10% = 75', () => {
  const s = storico(10, 54, 40);
  s[OGGI] = { fcRiposo: 48.6, hrv: { rmssd: 44 } };
  const r = recupero(s, OGGI);
  assert.equal(r.indice, 75);
  assert.equal(r.freccia, 'giu');
  assert.equal(r.fc, 48.6);
});

test('recupero: limiti 0 e 100', () => {
  const s = storico(10, 54);
  s[OGGI] = { fcRiposo: 70 };
  assert.equal(recupero(s, OGGI).indice, 0);
  assert.equal(recupero(s, OGGI).freccia, 'su');
  s[OGGI] = { fcRiposo: 30 };
  assert.equal(recupero(s, OGGI).indice, 100);
});

test('recupero: HRV mancante o pochi valori usa solo fc', () => {
  const s = storico(10, 54, 40);
  s[OGGI] = { fcRiposo: 48.6 };
  assert.equal(recupero(s, OGGI).indice, 75);
  const poche = storico(10, 54);
  for (let i = 1; i <= 6; i++) poche[aggiungiGiorni(OGGI, -i)].hrv = { rmssd: 40 };
  poche[OGGI] = { fcRiposo: 48.6, hrv: { rmssd: 80 } };
  assert.equal(recupero(poche, OGGI).indice, 75);
});

test('recupero: media zero → calibrazione, nessun NaN', () => {
  const s = storico(10, 0);
  s[OGGI] = { fcRiposo: 55 };
  const r = recupero(s, OGGI);
  assert.equal(r.stato, 'calibrazione');
  assert.equal(r.indice, null);
});

test('recupero: oggi escluso dalla media; freccia', () => {
  const s = storico(7, 54);
  s[OGGI] = { fcRiposo: 54.5 };
  assert.equal(recupero(s, OGGI).freccia, 'uguale');
  s[OGGI] = { fcRiposo: 55 };
  assert.equal(recupero(s, OGGI).freccia, 'su');
  s[OGGI] = { fcRiposo: 53 };
  assert.equal(recupero(s, OGGI).freccia, 'giu');
});
