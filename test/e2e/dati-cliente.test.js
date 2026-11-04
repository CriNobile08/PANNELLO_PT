import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const trainer = (extra = {}) => apriPannello({ isOwner: false, userId: 'u-trainer', ...extra });

const salute = (fc, extra = {}) => ({
  fonte: 'googleHealth',
  sonno: { inizio: '2026-11-03T23:00:00+01:00', fine: '2026-11-04T06:52:00+01:00', minutiAddormentato: 412, minutiSveglio: 38, minutiPerAddormentarsi: 9,
    fasi: { profondo: 71, rem: 88, leggero: 253, sveglio: 38 } },
  pisolini: [], fcRiposo: fc, hrv: { rmssd: 41.2, rmssdProfondo: null, fcNonRem: null }, passi: 8423, aggiornatoIl: '2026-11-04T08:00:00+01:00',
  ...extra,
});
function seme(giorni = 10) {
  const out = {};
  for (let i = 0; i < giorni; i++) {
    const d = new Date(Date.UTC(2026, 10, 4 - i)).toISOString().slice(0, 10);
    out[`salute/${d}`] = salute(i === 0 ? 54 : 60);
  }
  return out;
}
const SESSIONE = {
  fonte: 'googleHealth', idFonte: '1', data: '2026-11-04', inizio: '2026-11-04T07:30:00+01:00', fine: '2026-11-04T08:32:00+01:00',
  tipo: 'palestra', tipoOriginale: 'WEIGHTS', nome: 'Pesi', durataAttivaMin: 62, fcMedia: 118,
  zoneMin: null, calorie: 410, passi: null, distanzaM: null, dislivelloM: null, gps: false, aggiornatoIl: '2026-11-04T09:00:00+01:00',
};
const SETTIMANA = { numero: 1, validaDal: '2026-10-05', giorni: { lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null }, autore: 'u-altro', creataIl: '2026-10-04T10:00:00Z' };
const SEME = { ...seme(10), 'sessioni/googleHealth_1': SESSIONE, 'settimane/v1': SETTIMANA };

async function apriDati(page) {
  await page.getByRole('link', { name: 'Dati del cliente' }).click();
  await page.getByRole('heading', { name: 'Dati del cliente' }).waitFor();
}

test('voce di menu attiva', async () => {
  const { page, chiudi } = await trainer();
  try {
    await page.getByRole('link', { name: 'Report settimanali' }).waitFor();
    assert.equal(await page.getByRole('link', { name: /Dati del cliente/ }).getAttribute('aria-disabled'), null);
    assert.equal(await page.getByRole('link', { name: /Dati del cliente/ }).getByText('In arrivo').count(), 0);
    assert.equal(await page.getByRole('link', { name: /Report settimanali/ }).getByText('In arrivo').count(), 1);
    assert.equal(await page.getByText('In arrivo').count(), 1);
  } finally { await chiudi(); }
});

test('tabella settimana corrente (desktop)', async () => {
  const { page, chiudi } = await trainer({ seme: SEME, larghezza: 1100 });
  try {
    await apriDati(page);
    const tabella = page.getByRole('table');
    await tabella.waitFor();
    const riga = (nome) => tabella.getByRole('row').filter({ has: page.getByRole('rowheader', { name: nome, exact: true }) });
    await riga('Sonno').getByText('6 h 52 · 86%').first().waitFor();
    assert.equal(await riga('Sonno').getByText('6 h 52 · 86%').count(), 3);
    assert.equal(await riga('Pisolini').getByText('—').count(), 7);
    await riga('FC a riposo').getByText('54 bpm').waitFor();
    await riga('HRV').getByText('41 ms').first().waitFor();
    await riga('Passi').getByText('8.423').first().waitFor();
    await riga('Sessioni').getByText('1 · Palestra').waitFor();
    // 11-04 ha 9 giorni precedenti con FC: indice; 11-02 ne ha 7: ok; 11-03 idem
    assert.equal(await riga('Recupero').getByText('In calibrazione').count(), 0);
    assert.equal(await riga('Recupero').getByText(/^\d+$/).count(), 3);
    assert.equal(await page.getByText('Nessun dato').count(), 0);
  } finally { await chiudi(); }
});

test('telefono: una card per giorno; calibrazione', async () => {
  const { page, chiudi } = await trainer({ seme: seme(3) });
  try {
    await apriDati(page);
    const card = page.getByRole('article', { name: 'mer 4 nov' });
    await card.getByText('6 h 52 · 86%').waitFor();
    await card.getByText('In calibrazione').waitFor();
    assert.equal(await page.getByRole('table').count(), 0);
    await page.getByRole('article', { name: 'lun 2 nov' }).getByText('—').first().waitFor();
  } finally { await chiudi(); }
});

test('settimana precedente e vuota', async () => {
  const { page, chiudi } = await trainer({ seme: SEME, larghezza: 1100 });
  try {
    await apriDati(page);
    await page.getByText('Questa settimana · lun 2 nov – dom 8 nov').waitFor();
    await page.getByRole('button', { name: 'Settimana precedente' }).click();
    await page.getByText('lun 26 ott – dom 1 nov').waitFor();
    assert.equal(await page.getByRole('table').count(), 1); // anche la settimana scorsa ha dati
    await page.getByRole('button', { name: 'Settimana precedente' }).click();
    await page.getByText('lun 19 ott – dom 25 ott').waitFor();
    await page.getByText('Nessun dato', { exact: true }).waitFor();
    assert.equal(await page.getByRole('table').count(), 0);
  } finally { await chiudi(); }
});

test('salva obiettivo', async () => {
  const { page, chiudi } = await trainer({ seme: SEME });
  try {
    await apriDati(page);
    assert.equal(await page.getByLabel('Ore').inputValue(), '8');
    assert.equal(await page.getByLabel('Minuti').inputValue(), '0');
    await page.getByLabel('Ore').fill('7');
    await page.getByLabel('Minuti').fill('30');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('Obiettivo salvato').waitFor();
    assert.equal((await dump(page))['impostazioni/obiettivi'].sonnoMinuti, 450);
    await page.getByRole('button', { name: 'Cliente' }).click();
    await page.getByText('su 7 h 30').waitFor();
  } finally { await chiudi(); }
});

test('obiettivo non valido', async () => {
  const { page, chiudi } = await trainer({ seme: SEME });
  try {
    await apriDati(page);
    await page.getByLabel('Ore').fill('2');
    await page.getByLabel('Minuti').fill('0');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText("L'obiettivo deve essere tra 3 h e 12 h").waitFor();
    assert.equal((await dump(page))['impostazioni/obiettivi'], undefined);
  } finally { await chiudi(); }
});

test('come sta con dati', async () => {
  const { page, chiudi } = await trainer({ seme: SEME });
  try {
    await page.getByText('Sonno ultima notte: 6 h 52').waitFor();
    await page.getByText(/^Recupero oggi: \d+$/).waitFor();
  } finally { await chiudi(); }
  const b = await trainer({ seme: { ...seme(3), 'settimane/v1': SETTIMANA } });
  try { await b.page.getByText('Recupero oggi: In calibrazione').waitFor(); } finally { await b.chiudi(); }
  const c = await trainer({ seme: { 'settimane/v1': SETTIMANA } });
  try {
    await c.page.getByText('Sonno ultima notte: Nessun dato').waitFor();
    await c.page.getByText('Recupero oggi: Nessun dato').waitFor();
  } finally { await c.chiudi(); }
});

test('sola lettura', async () => {
  const { page, chiudi } = await trainer({ seme: SEME, puoScrivere: false });
  try {
    await apriDati(page);
    assert.equal(await page.getByRole('button', { name: 'Salva' }).isDisabled(), true);
  } finally { await chiudi(); }
});

test('obiettivo corrotto: il trainer vede il predefinito', async () => {
  const { page, chiudi } = await trainer({ seme: { ...SEME, 'impostazioni/obiettivi': { sonnoMinuti: 0 } } });
  try {
    await apriDati(page);
    assert.equal(await page.getByLabel('Ore').inputValue(), '8');
    assert.equal(await page.getByLabel('Minuti').inputValue(), '0');
  } finally { await chiudi(); }
});
