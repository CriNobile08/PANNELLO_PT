import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const esc = (nome) => ({ nome, durataSec: 30, serie: null, ripetizioni: null, perLato: false, nota: '' });
const REV = {
  validaDal: '2026-10-01', autore: 'u-trainer', salvataIl: '2026-10-01T10:00:00+02:00', nota: 'Carichi come settimana scorsa', durataStimataMin: 60,
  riscaldamento: [esc('Corda'), esc('Cerchi braccia'), esc('Squat a corpo libero')],
  principale: [
    { nome: 'Panca', serie: 3, ripetizioni: 10, caricoKg: 22.5, recuperoSec: 150, nota: '', hevyTemplateId: null },
    { nome: 'Croci', serie: 3, ripetizioni: 12, caricoKg: null, recuperoSec: null, nota: '', hevyTemplateId: null },
  ],
  stretching: [esc('Pettorali'), esc('Spalle')],
};
const giorni = (o) => ({ lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null, ...o });
const SEME = {
  'schede/spinta': { nome: 'Spinta A', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T10:00:00Z' },
  'schede/spinta/revisioni/r1': REV,
  'settimane/v1': { numero: 1, validaDal: '2026-10-26', giorni: giorni({ mer: 'spinta' }), autore: 'u-trainer', creataIl: '2026-10-25T10:00:00Z' },
  'alimentazione/a1': {
    numero: 1, validaDal: '2026-10-01', indicazioni: '', autore: 'u-trainer', creataIl: '2026-10-01T10:00:00Z',
    pasti: [{ nome: 'Colazione', opzioni: [
      { nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Avena', grammi: 60 }] },
      { nome: 'Opzione 2', nota: '', alimenti: [{ nome: 'Pane', grammi: 70.5 }] },
    ] }],
  },
};
const cliente = (extra = {}) => apriPannello({ isOwner: true, userId: 'u-cliente', ...extra });

test('oggi e dettaglio giornata', async () => {
  const { page, chiudi } = await cliente({ seme: SEME });
  try {
    await page.getByText('Nessun dato').first().waitFor();
    await page.getByText('Oggi · mer 4 nov').waitFor();
    assert.equal(await page.getByText('Nessun dato').count(), 6);
    await page.getByText('0/3').waitFor();
    await page.getByText('2 esercizi · 6 serie').waitFor();
    await page.getByLabel('Riscaldamento').check();
    await page.getByText('1/3').waitFor();
    assert.deepEqual((await dump(page))['diario/2026-11-04'].riscaldamentoFatti, [0, 1, 2]);
    await page.getByLabel('Riscaldamento').uncheck();
    await page.getByText('0/3').waitFor();
    assert.deepEqual((await dump(page))['diario/2026-11-04'].riscaldamentoFatti, []);

    // nota
    await page.getByRole('button', { name: 'Aggiungi nota' }).click();
    await page.getByRole('dialog').getByLabel('Nota').fill('Dormito male');
    await page.getByRole('button', { name: 'Salva nota' }).click();
    assert.equal((await dump(page))['diario/2026-11-04'].nota, 'Dormito male');

    // alimentazione
    await page.getByText('Avena').waitFor();
    await page.getByRole('button', { name: 'Opzione 2' }).click();
    await page.getByText('Pane').waitFor();
    await page.getByText('70,5 g').waitFor();
    assert.equal(await page.getByText('Avena').count(), 0);

    // giorno precedente: riposo
    await page.getByRole('button', { name: 'Giorno precedente' }).click();
    await page.getByText('Riposo').first().waitFor();
    await page.getByRole('button', { name: 'Giorno successivo' }).click();

    // giornata
    await page.getByRole('link', { name: /Spinta A/ }).click();
    await page.getByText('Mercoledì 4 novembre').waitFor();
    await page.getByText('Carichi come settimana scorsa').waitFor();
    await page.getByText('3 × 10 · 22,5 kg').waitFor();
    await page.getByText('rec. 2′30').waitFor();
    await page.getByText('0 blocchi su 3 completati').waitFor();
    await page.getByLabel('Corda').check();
    await page.getByText('1 / 3').waitFor();
    assert.deepEqual((await dump(page))['diario/2026-11-04'].riscaldamentoFatti, [0]);
    await page.getByLabel('Pettorali').check();
    await page.getByLabel('Spalle').check();
    await page.getByText('1 blocco su 3 completato').waitFor();
    await page.getByRole('button', { name: 'Segna come fatta' }).click();
    await page.getByText('2 blocchi su 3 completati').waitFor();
    assert.equal((await dump(page))['diario/2026-11-04'].principaleFatto, true);
    await page.getByRole('button', { name: '4' }).click();
    await page.getByLabel('Note per il trainer').fill('Polpaccio rigido');
    // modifiche non salvate: la guardia blocca l'uscita
    await page.getByRole('button', { name: 'Torna a Oggi' }).click();
    await page.getByRole('dialog', { name: /modifiche non salvate/ }).waitFor();
    await page.getByRole('button', { name: 'Resta' }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    assert.partialDeepStrictEqual((await dump(page))['diario/2026-11-04'], { principaleFatto: true, sensazione: 4, nota: 'Polpaccio rigido' });
    await page.getByRole('button', { name: 'Torna a Oggi' }).click();
    await page.getByText('2/3').waitFor();
    await page.getByRole('navigation').getByRole('link', { name: 'Oggi' }).waitFor();
  } finally { await chiudi(); }
});

test('oggi: stati vuoti e sola lettura', async () => {
  const { page, chiudi } = await cliente({});
  try {
    await page.getByText('Il trainer non ha ancora preparato il programma').waitFor();
    await page.getByText('Nessun piano alimentare').waitFor();
  } finally { await chiudi(); }
  const ro = await cliente({ seme: SEME, puoScrivere: false });
  try {
    await ro.page.getByText('Spinta A').waitFor();
    assert.equal(await ro.page.getByLabel('Riscaldamento').isDisabled(), true);
  } finally { await ro.chiudi(); }
});
