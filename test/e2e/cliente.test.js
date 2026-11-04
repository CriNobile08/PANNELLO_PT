import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const rev = {
  validaDal: '2026-10-01', autore: 'u-trainer', salvataIl: '2026-10-01T10:00:00+02:00', nota: '', durataStimataMin: 60,
  riscaldamento: [], stretching: [],
  principale: [{ nome: 'Panca', serie: 3, ripetizioni: 10, caricoKg: 40, recuperoSec: 90, nota: '', hevyTemplateId: null }],
};
const scheda = (nome) => ({ nome, tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T10:00:00Z' });
const giorni = (o) => ({ lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null, ...o });
const SEME = {
  'schede/spinta': scheda('Spinta A'), 'schede/spinta/revisioni/r1': rev,
  'schede/gambe': scheda('Gambe'), 'schede/gambe/revisioni/r1': rev,
  'settimane/v1': { numero: 1, validaDal: '2026-10-26', giorni: giorni({ mer: 'spinta', ven: 'gambe' }), autore: 'u-trainer', creataIl: '2026-10-25T10:00:00Z' },
  'alimentazione/a1': {
    numero: 1, validaDal: '2026-10-01', indicazioni: 'Bere molta acqua', autore: 'u-trainer', creataIl: '2026-10-01T10:00:00Z',
    pasti: [{ nome: 'Colazione', opzioni: [
      { nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Avena', grammi: 60.5 }] },
      { nome: 'Opzione 2', nota: '', alimenti: [{ nome: 'Pane', grammi: 70 }] },
    ] }],
  },
  'alimentazione/a2': { numero: 2, validaDal: '2026-11-20', indicazioni: '', autore: 'u-trainer', creataIl: '2026-11-01T10:00:00Z', pasti: [] },
};
const cliente = (extra = {}) => apriPannello({ isOwner: true, userId: 'u-cliente', ...extra });
const nav = (page, nome) => page.getByRole('navigation').getByRole('link', { name: nome, exact: true });

test('allenamento: settimana, sposta giorno, apertura giornata, schede', async () => {
  const { page, chiudi } = await cliente({ seme: SEME });
  try {
    await nav(page, 'Allenamento').click();
    await page.getByTestId('riga-giorno').first().waitFor();
    assert.equal(await page.getByTestId('riga-giorno').count(), 7);
    await page.getByTestId('riga-giorno').nth(4).getByText('Gambe').waitFor();

    await page.getByRole('button', { name: 'Solo questa settimana' }).click();
    await page.getByLabel('Sposta da').selectOption('2026-11-06');
    await page.getByLabel('Sposta a').selectOption('2026-11-05');
    await page.getByRole('button', { name: 'Sposta giorno' }).click();
    await page.getByTestId('riga-giorno').first().waitFor();
    const d = await dump(page);
    assert.equal(d['eccezioni/2026-11-05'].autore, 'u-cliente');
    assert.equal(d['eccezioni/2026-11-05'].schedaId, 'gambe');
    await page.getByTestId('riga-giorno').nth(3).getByText('Eccezione').waitFor();

    await page.getByRole('button', { name: 'Da una data in poi' }).click();
    await page.getByText('Nuova versione da una data…').waitFor();
    await page.getByRole('button', { name: 'Annulla' }).click();

    await page.locator('.elenco-schede').getByRole('button', { name: /Spinta A/ }).click();
    await page.getByLabel('Nome della scheda', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Torna alle schede' }).first().click();
    await page.getByTestId('riga-giorno').nth(2).click();
    await page.getByText('Spinta A').first().waitFor();
  } finally { await chiudi(); }
});

test('alimentazione: sola lettura, opzioni, versione futura, nessun piano', async () => {
  const { page, chiudi } = await cliente({ seme: SEME });
  try {
    await nav(page, 'Alimentazione').click();
    await page.getByText('Colazione').waitFor();
    await page.getByText('Bere molta acqua').waitFor();
    await page.getByText('Avena').waitFor();
    await page.getByText('60,5 g').waitFor();
    await page.getByRole('button', { name: 'Opzione 2' }).click();
    await page.getByText('Pane').waitFor();
    await page.getByText('In programma dal', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: '+ Aggiungi alimento' }).count(), 0);
  } finally { await chiudi(); }
  const v = await cliente({ seme: {} });
  try {
    await nav(v.page, 'Alimentazione').click();
    await v.page.getByText('Nessun piano alimentare').waitFor();
  } finally { await v.chiudi(); }
});

test('nessun segnaposto in nessuna voce attiva di entrambe le viste', async () => {
  const { page, chiudi } = await apriPannello({ isOwner: true, userId: 'u-cliente', seme: SEME });
  try {
    for (const vista of ['Cliente', 'Trainer']) {
      await page.getByRole('button', { name: vista, exact: true }).click();
      const voci = page.getByRole('navigation').getByRole('link');
      const n = await voci.count();
      for (let i = 0; i < n; i++) {
        const voce = voci.nth(i);
        if ((await voce.getAttribute('aria-disabled')) === 'true') continue;
        await voce.click();
        await page.locator('.sezione').first().waitFor();
        assert.equal(await page.locator('.segnaposto').count(), 0);
      }
    }
  } finally { await chiudi(); }
});
