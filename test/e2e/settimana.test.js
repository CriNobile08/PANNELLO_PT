import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const trainer = (extra = {}) => apriPannello({ isOwner: false, userId: 'u-trainer', profili: { 'u-trainer': 'Luca', 'u-altro': 'Marta' }, ...extra });

const rev = (nota = '') => ({
  validaDal: '2026-10-01', autore: 'u-altro', salvataIl: '2026-10-01T10:30:00+02:00', nota, durataStimataMin: 60,
  riscaldamento: [{ nome: 'Corda', durataSec: 60, serie: null, ripetizioni: null, perLato: false, nota: '' }],
  principale: [{ nome: 'Panca', serie: 3, ripetizioni: 10, caricoKg: 40, recuperoSec: 90, nota: '', hevyTemplateId: null }],
  stretching: [],
});
const scheda = (nome, tipo = 'palestra') => ({ nome, tipo, archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-altro', creataIl: '2026-10-01T10:00:00Z' });
const giorni = (o) => ({ lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null, ...o });
const SEME = {
  'schede/gambe': scheda('Gambe'), 'schede/gambe/revisioni/r1': rev(),
  'schede/spinta': scheda('Spinta'), 'schede/spinta/revisioni/r1': rev(),
  'schede/tirata': scheda('Tirata'), 'schede/tirata/revisioni/r1': rev(),
  'settimane/v1': { numero: 1, validaDal: '2026-10-05', giorni: giorni({ sab: 'gambe' }), autore: 'u-altro', creataIl: '2026-10-04T10:00:00Z' },
  'settimane/v2': { numero: 2, validaDal: '2026-10-26', giorni: giorni({ lun: 'gambe', mar: 'spinta', mer: 'spinta', ven: 'tirata' }), autore: 'u-altro', creataIl: '2026-10-25T10:00:00Z' },
  'diario/2026-11-02': { riscaldamentoFatti: [0], stretchingFatti: [], principaleFatto: true, sensazione: 4, nota: 'Gambe pesanti', aggiornatoIl: '2026-11-02T19:00:00Z' },
  'diario/2026-11-03': { riscaldamentoFatti: [], stretchingFatti: [], principaleFatto: false, sensazione: null, nota: '', aggiornatoIl: '2026-11-03T19:00:00Z' },
};

test('settimana: intestazione, card, spostamento, ripristino e nuova versione', async () => {
  const { page, chiudi } = await trainer({ seme: SEME });
  try {
    await page.getByText('OGGI', { exact: true }).waitFor();
    await page.getByText('In vigore dal lun 26 ott · versione 2', { exact: false }).waitFor();
    await page.getByText('creata da Marta il', { exact: false }).waitFor();
    await page.getByText('Questa settimana · lun 2 nov – dom 8 nov').waitFor();
    // diario: un blocco senza esercizi conta come completo (stretching vuoto)
    await page.getByRole('article', { name: 'lun 2 nov' }).getByText('Fatto').waitFor();
    await page.getByRole('article', { name: 'mar 3 nov' }).getByText('1/3').waitFor();
    await page.getByRole('article', { name: 'mer 4 nov' }).getByText('1/3').waitFor();
    await page.getByText('Ultima nota · lun 2 nov: “Gambe pesanti” · Sensazione 4/5').waitFor();
    await page.getByRole('article', { name: 'gio 5 nov' }).getByText('Riposo').waitFor();
    await page.getByRole('article', { name: 'ven 6 nov' }).getByText('Tirata').waitFor();

    // sposta venerdì -> giovedì
    await page.getByRole('button', { name: 'Modifica solo questa settimana' }).click();
    await page.getByLabel('Sposta da').selectOption('2026-11-06');
    await page.getByLabel('Sposta a').selectOption('2026-11-05');
    await page.getByRole('button', { name: 'Sposta giorno' }).click();
    await page.getByText('Spostata da ven').waitFor();
    let d = await dump(page);
    assert.equal(d['eccezioni/2026-11-05'].schedaId, 'tirata');
    assert.equal(d['eccezioni/2026-11-05'].origine, '2026-11-06');
    assert.equal(d['eccezioni/2026-11-06'].schedaId, null);
    assert.equal(d['eccezioni/2026-11-05'].autore, 'u-trainer');
    await page.getByText('da Luca · mer 4 nov').first().waitFor();

    // ripristina
    await page.getByRole('button', { name: 'Ripristina' }).first().click();
    await page.getByRole('button', { name: 'Ripristina' }).first().click();
    await page.getByRole('article', { name: 'gio 5 nov' }).getByText('Riposo').waitFor();
    d = await dump(page);
    assert.equal(Object.keys(d).filter((p) => p.startsWith('eccezioni/')).length, 0);

    // solo questa settimana: scrive solo i giorni cambiati
    await page.getByRole('button', { name: 'Modifica solo questa settimana' }).click();
    await page.locator('.editor-settimana .griglia-campi').first().getByLabel('gio 5 nov').selectOption('gambe');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('article', { name: 'gio 5 nov' }).getByText('Gambe').first().waitFor();
    d = await dump(page);
    assert.deepEqual(Object.keys(d).filter((p) => p.startsWith('eccezioni/')), ['eccezioni/2026-11-05']);

    // assegna scheda a un giorno di riposo
    await page.getByRole('article', { name: 'dom 8 nov' }).getByRole('button', { name: '+ Assegna scheda' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Tirata/ }).click();
    await page.getByRole('article', { name: 'dom 8 nov' }).getByText('Tirata').waitFor();
    assert.equal((await dump(page))['eccezioni/2026-11-08'].schedaId, 'tirata');

    // cronologia
    await page.getByRole('button', { name: 'Cronologia' }).click();
    await page.getByText('Versione 1 · dal lun 5 ott', { exact: false }).waitFor();

    // nuova versione da una data
    await page.getByRole('button', { name: 'Nuova versione da una data…' }).click();
    assert.equal(await page.getByLabel('Valida dal').inputValue(), '2026-11-09');
    assert.equal(await page.getByLabel('Martedì').inputValue(), 'spinta');
    await page.getByLabel('Valida dal').fill('2026-11-16');
    await page.getByLabel('Mercoledì').selectOption('gambe');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('In programma dal lun 16 nov').waitFor();
    d = await dump(page);
    const v3 = Object.entries(d).find(([p, v]) => p.startsWith('settimane/') && v.validaDal === '2026-11-16')[1];
    assert.equal(v3.numero, 3);
    assert.equal(v3.giorni.mer, 'gambe');
    assert.equal(v3.giorni.ven, 'tirata');
    assert.equal(v3.giorni.sab, null);
    assert.equal(v3.autore, 'u-trainer');

    // navigazione tra settimane
    await page.getByRole('button', { name: 'Settimana successiva' }).click();
    await page.getByText('lun 9 nov – dom 15 nov').waitFor();
    await page.getByText('Questa settimana ·', { exact: false }).waitFor({ state: 'detached' });
  } finally { await chiudi(); }
});

test('settimana vuota e sola lettura', async () => {
  const { page: pVuota, chiudi } = await trainer();
  try {
    await pVuota.getByRole('button', { name: 'Crea la prima settimana tipo' }).click();
    await pVuota.getByLabel('Valida dal').waitFor();
    await pVuota.getByRole('button', { name: 'Salva' }).click();
    await pVuota.getByText('In vigore dal', { exact: false }).waitFor({ state: 'detached' }).catch(() => {});
    await pVuota.getByText('In programma dal lun 9 nov').waitFor();
  } finally { await chiudi(); }
  const { page, chiudi: c2 } = await trainer({ seme: SEME, puoScrivere: false });
  try {
    await page.getByText('OGGI', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Modifica solo questa settimana' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Nuova versione da una data…' }).isDisabled(), true);
  } finally { await c2(); }
});

test('timestamp mancanti (creataIl) non rompono la pagina: si mostra "…"', async () => {
  const seme = {
    ...SEME,
    'settimane/v2': { ...SEME['settimane/v2'], creataIl: undefined },
    'eccezioni/2026-11-05': { schedaId: 'gambe', origine: null, autore: 'u-altro' },
  };
  const { page, chiudi } = await trainer({ seme });
  try {
    await page.getByText('In vigore dal lun 26 ott · versione 2 · creata da Marta il …').waitFor({ timeout: 5000 });
    await page.getByRole('article', { name: 'gio 5 nov' }).getByText('da Marta · …').waitFor();
  } finally { await chiudi(); }
});

test('solo questa settimana: non sovrascrive un giorno cambiato da un altro mentre l\'editor è aperto; sposta bloccato con modifiche in sospeso', async () => {
  const { page, chiudi } = await trainer({ seme: SEME });
  try {
    await page.getByText('OGGI', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Modifica solo questa settimana' }).click();
    const griglia = page.locator('.editor-settimana .griglia-campi').first();
    await griglia.getByLabel('sab 7 nov').waitFor();
    // Marta assegna sabato mentre l'editor è aperto
    await page.evaluate(async () => {
      const db = await window.claude.use('db');
      await db.doc('eccezioni/2026-11-07').set({ schedaId: 'tirata', origine: null, autore: 'u-altro', creataIl: '2026-11-04T08:00:00Z' });
    });
    await griglia.getByLabel('gio 5 nov').selectOption('gambe');
    // con modifiche in sospeso "Sposta giorno" è disattivato e spiegato
    await page.getByLabel('Sposta da').selectOption('2026-11-06');
    await page.getByLabel('Sposta a').selectOption('2026-11-08');
    assert.equal(await page.getByRole('button', { name: 'Sposta giorno' }).isDisabled(), true);
    await page.getByText('Salva o annulla le modifiche ai giorni prima di spostare').waitFor();
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('article', { name: 'gio 5 nov' }).getByText('Gambe').first().waitFor();
    const d = await dump(page);
    assert.equal(d['eccezioni/2026-11-05'].schedaId, 'gambe');
    assert.equal(d['eccezioni/2026-11-07'].schedaId, 'tirata');
    assert.equal(d['eccezioni/2026-11-07'].autore, 'u-altro');
  } finally { await chiudi(); }
});

test('nuova versione: "Valida dal" non può essere nel passato (salvo la prima versione)', async () => {
  const { page, chiudi } = await trainer({ seme: SEME });
  try {
    await page.getByRole('button', { name: 'Nuova versione da una data…' }).click();
    assert.equal(await page.getByLabel('Valida dal').getAttribute('min'), '2026-11-04');
    await page.getByLabel('Valida dal').fill('2026-11-03');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('La data non può essere nel passato').waitFor();
    assert.equal(Object.keys(await dump(page)).filter((p) => p.startsWith('settimane/')).length, 2);
    await page.getByLabel('Valida dal').fill('2026-11-04');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('In vigore dal mer 4 nov · versione 3', { exact: false }).waitFor();
  } finally { await chiudi(); }
  // prima settimana tipo: si può partire da questo lunedì (nessuna versione precedente da riscrivere)
  const vuota = await trainer();
  try {
    await vuota.page.getByRole('button', { name: 'Crea la prima settimana tipo' }).click();
    assert.equal(await vuota.page.getByLabel('Valida dal').getAttribute('min'), null);
    await vuota.page.getByLabel('Valida dal').fill('2026-11-02');
    await vuota.page.getByRole('button', { name: 'Salva' }).click();
    await vuota.page.getByText('In vigore dal lun 2 nov · versione 1', { exact: false }).waitFor();
  } finally { await vuota.chiudi(); }
});
