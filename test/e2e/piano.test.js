import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const versioni = (d) => Object.entries(d).filter(([p]) => /^alimentazione\/[^/]+$/.test(p)).map(([p, v]) => ({ id: p.split('/')[1], ...v }));
const trainer = (extra = {}) => apriPannello({ isOwner: false, userId: 'u-trainer', profili: { 'u-trainer': 'Luca', 'u-altro': 'Marta' }, ...extra });
const vaiAlPiano = (page) => page.getByRole('link', { name: 'Piano alimentare' }).click();

const PIANO = (extra = {}) => ({
  numero: 1, validaDal: '2026-10-01', indicazioni: 'Bere molto', autore: 'u-altro', creataIl: '2026-10-01T10:30:00+02:00',
  pasti: [
    { nome: 'Colazione', opzioni: [
      { nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Avena', grammi: 60 }] },
      { nome: 'Opzione 2', nota: 'Con calma', alimenti: [{ nome: 'Pane', grammi: 70.5 }] },
    ] },
    { nome: 'Pranzo', opzioni: [{ nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Riso', grammi: 80 }] }] },
  ],
  ...extra,
});

async function conferma(page, data) {
  await page.getByRole('button', { name: 'Salva come nuova versione da…' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Salva come nuova versione da…' });
  if (data) await dialogo.getByLabel('Valido dal').fill(data);
  await dialogo.getByRole('button', { name: 'Salva', exact: true }).click();
}

test('stato vuoto: crea il piano con due opzioni, virgola e validazione grammi', async () => {
  const { page, chiudi } = await trainer();
  try {
    await vaiAlPiano(page);
    await page.getByRole('button', { name: 'Crea il piano alimentare' }).click();
    await page.getByRole('button', { name: '+ Aggiungi pasto' }).click();
    await page.getByLabel('Nome del pasto').fill('Colazione');
    await page.getByLabel('Alimento', { exact: true }).fill('Avena');
    await page.getByLabel('Grammi', { exact: true }).fill('0');
    await conferma(page, '2026-11-04');
    await page.getByText('Inserisci un numero maggiore di 0').waitFor();
    assert.equal(versioni(await dump(page)).length, 0);
    await page.getByLabel('Grammi', { exact: true }).fill('60');
    await page.getByRole('button', { name: '+ Opzione' }).click();
    await page.getByLabel('Alimento', { exact: true }).fill('Pane');
    await page.getByLabel('Grammi', { exact: true }).fill('70,5');
    await conferma(page, '2026-11-04');
    await page.getByText('In vigore dal mer 4 nov · versione 1 · creato da Luca il mer 4 nov').waitFor();
    const piano = versioni(await dump(page))[0];
    assert.equal(piano.pasti[0].opzioni.length, 2);
    assert.equal(piano.pasti[0].opzioni[0].alimenti[0].grammi, 60);
    assert.equal(piano.pasti[0].opzioni[1].alimenti[0].grammi, 70.5);
    assert.equal(piano.numero, 1);
    assert.equal(piano.autore, 'u-trainer');
    assert.equal(await page.getByText('Modifiche non salvate').count(), 0);
  } finally { await chiudi(); }
});

test('piano esistente: riassunto, nuova versione futura, annulla, cronologia', async () => {
  const { page, chiudi } = await trainer({ seme: { 'alimentazione/a1': PIANO() } });
  try {
    await vaiAlPiano(page);
    await page.getByText('In vigore dal gio 1 ott · versione 1 · creato da Marta il gio 1 ott').waitFor();
    assert.equal(await page.getByLabel('Indicazioni generali').inputValue(), 'Bere molto');
    assert.equal(await page.getByLabel('Nome del pasto').inputValue(), 'Colazione');
    assert.equal(await page.getByLabel('Alimento', { exact: true }).inputValue(), 'Avena');
    await page.getByRole('button', { name: 'Pranzo' }).getByText('Riso · 1 opzione').waitFor();
    await page.getByRole('tab', { name: 'Opzione 2' }).click();
    assert.equal(await page.getByLabel('Grammi', { exact: true }).inputValue(), '70,5');
    assert.equal(await page.getByLabel("Nota dell'opzione").inputValue(), 'Con calma');
    // annulla ripristina
    await page.getByLabel('Indicazioni generali').fill('Altro');
    await page.getByText('Modifiche non salvate').waitFor();
    await page.getByRole('button', { name: 'Annulla', exact: true }).click();
    assert.equal(await page.getByLabel('Indicazioni generali').inputValue(), 'Bere molto');
    // rimuovi alimento, un pasto aperto alla volta, nuova versione futura
    await page.getByLabel('Indicazioni generali').fill('Nuove indicazioni');
    await page.getByRole('button', { name: 'Pranzo' }).click();
    await page.getByLabel('Nome del pasto').waitFor();
    assert.equal(await page.getByLabel('Nome del pasto').inputValue(), 'Pranzo');
    await page.getByRole('button', { name: 'Rimuovi alimento' }).click();
    await page.getByRole('button', { name: '+ Aggiungi alimento' }).click();
    await page.getByLabel('Alimento', { exact: true }).fill('Pasta');
    await page.getByLabel('Grammi', { exact: true }).fill('90');
    await conferma(page, '2026-11-10');
    await page.getByText('In programma dal mar 10 nov').waitFor();
    const d = versioni(await dump(page));
    assert.equal(d.length, 2);
    const nuova = d.find((v) => v.numero === 2);
    assert.equal(nuova.validaDal, '2026-11-10');
    assert.equal(nuova.indicazioni, 'Nuove indicazioni');
    assert.deepEqual(nuova.pasti[1].opzioni[0].alimenti, [{ nome: 'Pasta', grammi: 90 }]);
    await page.getByRole('button', { name: 'Cronologia' }).click();
    await page.getByText(/Versione 2 · dal mar 10 nov · creato da Luca/).waitFor();
    await page.getByText(/Versione 1 · dal gio 1 ott · creato da Marta/).waitFor();
  } finally { await chiudi(); }
});

test('sola lettura e creataIl mancante', async () => {
  const { page, chiudi } = await trainer({ seme: { 'alimentazione/a1': PIANO({ creataIl: undefined }) }, puoScrivere: false });
  try {
    await vaiAlPiano(page);
    await page.getByText('In vigore dal gio 1 ott · versione 1 · creato da Marta', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Salva come nuova versione da…' }).isDisabled(), true);
  } finally { await chiudi(); }
});
