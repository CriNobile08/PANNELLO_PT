import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroDaInput, validaScheda, validaPiano } from '../src/logic/validazione.js';

test('numeroDaInput', () => {
  assert.equal(numeroDaInput('60,5'), 60.5);
  assert.equal(numeroDaInput(' 22,5 '), 22.5);
  assert.equal(numeroDaInput('80'), 80);
  assert.equal(numeroDaInput(''), null);
  assert.equal(numeroDaInput('abc'), null);
});

const es = (o) => ({ nome: 'Panca', serie: 4, ripetizioni: 6, caricoKg: 80, recuperoSec: 150, nota: '', hevyTemplateId: null, ...o });
const rev = (o) => ({ riscaldamento: [], principale: [es()], stretching: [], obiettivo: null, nota: '', durataStimataMin: 60, ...o });

test('validaScheda', () => {
  assert.deepEqual(validaScheda({ nome: 'Spinta A', tipo: 'palestra' }, rev()), []);
  assert.deepEqual(validaScheda({ nome: '  ', tipo: 'palestra' }, rev()), [{ campo: 'nome', messaggio: 'Campo obbligatorio' }]);
  assert.deepEqual(validaScheda({ nome: 'X', tipo: 'palestra' }, rev({ principale: [es({ serie: 2.5 })] })),
    [{ campo: 'principale.0.serie', messaggio: 'Inserisci un numero intero maggiore di 0' }]);
  assert.deepEqual(validaScheda({ nome: 'X', tipo: 'palestra' }, rev({ principale: [es({ ripetizioni: 0 })] })),
    [{ campo: 'principale.0.ripetizioni', messaggio: 'Inserisci un numero intero maggiore di 0' }]);
  assert.deepEqual(validaScheda({ nome: 'X', tipo: 'palestra' }, rev({ riscaldamento: [{ nome: '', durataSec: 300, serie: null, ripetizioni: null, perLato: false, nota: '' }] })),
    [{ campo: 'riscaldamento.0.nome', messaggio: 'Campo obbligatorio' }]);
  assert.deepEqual(validaScheda({ nome: 'Corsa', tipo: 'corsa' }, rev({ principale: [], obiettivo: { descrizione: '', distanzaKm: 8, dislivelloM: null } })),
    [{ campo: 'obiettivo.descrizione', messaggio: 'Campo obbligatorio' }]);
});

test('validaPiano', () => {
  const piano = { indicazioni: '', pasti: [{ nome: 'Colazione', opzioni: [{ nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Avena', grammi: 60 }] }] }] };
  assert.deepEqual(validaPiano(piano), []);
  piano.pasti[0].opzioni[0].alimenti[0].grammi = 0;
  assert.deepEqual(validaPiano(piano), [{ campo: 'pasti.0.opzioni.0.alimenti.0.grammi', messaggio: 'Inserisci un numero maggiore di 0' }]);
});
