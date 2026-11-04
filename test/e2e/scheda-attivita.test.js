import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const AGG = '2026-11-04T09:00:00+01:00';
const base = (o) => ({
  passi: null, distanzaM: null, dislivelloM: null, gps: false, aggiornatoIl: AGG, calorie: null, zoneMin: null, fcMedia: null, ...o,
});

// palestra di oggi: due registrazioni doppie dell'orologio + Hevy
const blocchi = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const FC_PALESTRA = { passoSec: 10, inizio: '2026-11-04T07:30:00+01:00', bpm: blocchi(372, (i) => (i >= 50 && i < 55 ? null : 100 + (i % 50))) };
const HEVY = base({
  fonte: 'hevy', idFonte: 'w1', data: '2026-11-04', inizio: '2026-11-04T07:32:00+01:00', fine: '2026-11-04T08:28:00+01:00',
  tipo: 'palestra', nome: 'Spinta Hevy', durataAttivaMin: 56, serieTotali: 7, volumeKg: 2240,
  esercizi: [
    { ordine: 0, nome: 'Panca piana', idTemplate: 't1', idSuperserie: null, note: '', serie: [
      { ordine: 0, tipo: 'riscaldamento', kg: 40, ripetizioni: 10, durataSec: null, distanzaM: null, rpe: null },
      { ordine: 1, tipo: 'normale', kg: 60, ripetizioni: 8, durataSec: null, distanzaM: null, rpe: 8 },
      { ordine: 2, tipo: 'normale', kg: 60, ripetizioni: 8, durataSec: null, distanzaM: null, rpe: 9 },
      { ordine: 3, tipo: 'cedimento', kg: 60, ripetizioni: 6, durataSec: null, distanzaM: null, rpe: null },
    ] },
    { ordine: 1, nome: 'Squat', idTemplate: 't2', idSuperserie: 0, note: '', serie: [
      { ordine: 0, tipo: 'normale', kg: 80, ripetizioni: 5, durataSec: null, distanzaM: null, rpe: null },
    ] },
    { ordine: 2, nome: 'Trazioni', idTemplate: 't3', idSuperserie: 0, note: '', serie: [
      { ordine: 0, tipo: 'normale', kg: null, ripetizioni: 8, durataSec: null, distanzaM: null, rpe: null },
    ] },
    { ordine: 3, nome: 'Curl', idTemplate: 't4', idSuperserie: null, note: '', serie: [
      { ordine: 0, tipo: 'drop', kg: 12.5, ripetizioni: 10, durataSec: null, distanzaM: null, rpe: null },
    ] },
  ],
});
const GH_PALESTRA = (id, inizio, extra = {}) => base({
  fonte: 'googleHealth', idFonte: id, data: '2026-11-04', inizio, fine: '2026-11-04T08:32:00+01:00',
  tipo: 'palestra', tipoOriginale: 'WEIGHTS', nome: 'Pesi', durataAttivaMin: 62, fcMedia: 118, calorie: 410,
  zoneMin: { leggera: 10, moderata: 30, intensa: 15, picco: 7 }, ...extra,
});

// corsa di ieri con tracciato già salvato: 7 km interi + 0,43 km
const DURATE = [360, 350, 345, 340, 355, 365, 370, 215];
const ISTANTI = DURATE.slice(0, 7).reduce((acc, d) => [...acc, (acc.at(-1) ?? 0) + d], []);
const kmDi = (sec) => ISTANTI.filter((t) => t <= sec).length;
const FC_CORSA = { passoSec: 10, inizio: '2026-11-03T18:00:00+01:00', bpm: blocchi(270, (i) => (i >= 100 && i < 103 ? null : 140 + kmDi(i * 10))) };
const CORSA = base({
  fonte: 'googleHealth', idFonte: 'c1', data: '2026-11-03', inizio: '2026-11-03T18:00:00+01:00', fine: '2026-11-03T18:45:00+01:00',
  tipo: 'corsa', tipoOriginale: 'RUNNING', nome: 'Corsa', durataAttivaMin: 45, fcMedia: 143, calorie: 520, distanzaM: 7000, gps: false,
  zoneMin: { leggera: 5, moderata: 20, intensa: 15, picco: 5 }, fcSerie: FC_CORSA,
});
const TRACCIATO = {
  idParte: 'googleHealth_c1', fonte: 'gpx', nomeFile: 'corsa.gpx',
  inizio: '2026-11-03T18:00:00+01:00', fine: '2026-11-03T18:45:00+01:00',
  distanzaM: 7430, dislivelloM: 48, durataSec: 2700, inMovimentoSec: 2615,
  split: DURATE.map((d, i) => ({ km: i + 1, distanzaM: i < 7 ? 1000 : 430, durataSec: d, dislivelloM: i < 7 ? 6 : 0 })),
  percorso: [[40, 500], [300, 200], [700, 300], [960, 700], [500, 960], [60, 520]],
  segniKm: [[200, 330], [420, 220], [700, 300], [860, 520], [900, 760], [600, 900], [300, 800]],
  quote: [[0, 200], [600, 215], [1200, 230], [1800, 210], [2700, 205]],
  istantiKm: ISTANTI,
  idAsset: 'a'.repeat(32), caricatoIl: '2026-11-03T20:00:00+01:00', autore: 'u-cliente',
};

// bici senza fcSerie né zone
const BICI = base({
  fonte: 'googleHealth', idFonte: 'b1', data: '2026-11-02', inizio: '2026-11-02T10:00:00+01:00', fine: '2026-11-02T11:00:00+01:00',
  tipo: 'bici', tipoOriginale: 'BIKING', nome: 'Bici', durataAttivaMin: 60, fcMedia: 130, calorie: 600,
});

const SEME = {
  'sessioni/googleHealth_p1': GH_PALESTRA('p1', '2026-11-04T07:30:00+01:00', { fcSerie: FC_PALESTRA }),
  'sessioni/googleHealth_p2': GH_PALESTRA('p2', '2026-11-04T07:31:00+01:00', { fcSerie: null }),
  'sessioni/hevy_w1': HEVY,
  'sessioni/googleHealth_c1': CORSA,
  'tracciati/googleHealth_c1': TRACCIATO,
  'sessioni/googleHealth_b1': BICI,
};

const cliente = (o = {}) => apriPannello({ isOwner: true, userId: 'u-cliente', seme: SEME, ...o });
const recenti = (page) => page.getByRole('region', { name: 'Attività recenti' });
const apriDaRecenti = async (page, nome) => {
  await recenti(page).getByRole('button', { name: new RegExp(nome) }).click();
  await page.locator('.scheda-attivita').waitFor();
};
const titoli = (page) => page.locator('.scheda-attivita h2').allInnerTexts();
const sezione = (page, nome) => page.getByRole('region', { name: nome, exact: true });
const valore = (page, sez, etichetta) => sezione(page, sez).locator('.dettaglio-riga', { has: page.locator('dt', { hasText: new RegExp(`^${etichetta}$`) }) }).locator('dd');
async function senzaValoriRotti(page) {
  const testo = await page.locator('body').innerText();
  assert.doesNotMatch(testo, /NaN|undefined|null/);
  // a 390 px nessuno scorrimento orizzontale
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

test('apertura da Attività recenti', async () => {
  const { page, chiudi } = await cliente();
  try {
    await apriDaRecenti(page, 'Palestra');
    const testata = page.locator('.testata-attivita');
    await testata.getByRole('heading', { name: 'Palestra' }).waitFor();
    await testata.getByText('mer 4 nov · 07:30').waitFor();
    await testata.getByText('Google Health · Hevy', { exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Oggi' }).getAttribute('aria-current'), 'page');
    await senzaValoriRotti(page);
    await page.getByRole('button', { name: '‹ Indietro' }).click();
    await recenti(page).waitFor();
    assert.equal(await page.locator('.scheda-attivita').count(), 0);
  } finally { await chiudi(); }
});

test('palestra con Hevy', async () => {
  const { page, chiudi } = await cliente();
  try {
    await apriDaRecenti(page, 'Palestra');
    assert.deepEqual(await titoli(page), ['Riepilogo', 'Esercizi Hevy', 'Grafico FC', 'Zone FC']);
    const hevy = sezione(page, 'Esercizi Hevy');
    await hevy.getByText('1 · 60 kg × 8 · RPE 8', { exact: true }).waitFor();
    await hevy.getByText('2 · 60 kg × 8 · RPE 9', { exact: true }).waitFor();
    assert.match(await hevy.locator('.serie-hevy.riscaldamento').innerText(), /40 kg × 10/);
    await hevy.getByText('cedimento', { exact: true }).waitFor();
    await hevy.getByText('drop', { exact: true }).waitFor();
    await hevy.getByText('12,5 kg × 10', { exact: false }).waitFor();
    assert.equal(await hevy.locator('.superserie').count(), 1);
    assert.equal(await hevy.locator('.superserie .esercizio-hevy').count(), 2);
    await hevy.getByText('7 serie · 2.240 kg', { exact: true }).waitFor();
    assert.equal(await valore(page, 'Riepilogo', 'Serie totali').innerText(), '7');
    assert.equal(await valore(page, 'Riepilogo', 'Volume').innerText(), '2.240 kg');
    assert.equal(await valore(page, 'Riepilogo', 'Durata').innerText(), '1 h 02');
    assert.equal(await valore(page, 'Riepilogo', 'FC massima').innerText(), '149 bpm');
    assert.equal(await valore(page, 'Riepilogo', 'Calorie').innerText(), '410 kcal');
    await sezione(page, 'Zone FC').getByText('Moderata').waitFor();
    await sezione(page, 'Zone FC').getByText('30 min · 48%').waitFor();
    assert.equal(await sezione(page, 'Grafico FC').locator('svg').count(), 1);
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('corsa con tracciato', async () => {
  const { page, chiudi } = await cliente();
  try {
    await apriDaRecenti(page, 'Corsa');
    assert.deepEqual(await titoli(page), ['Riepilogo', 'Tracciato', 'Split per km', 'Grafico FC', 'Zone FC']);
    await page.locator('.testata-attivita').getByText('Google Health · GPX', { exact: true }).waitFor();
    assert.equal(await valore(page, 'Riepilogo', 'Distanza').innerText(), '7,43 km');
    assert.equal(await valore(page, 'Riepilogo', 'Ritmo medio').innerText(), '5′52″/km');
    assert.equal(await valore(page, 'Riepilogo', 'Dislivello').innerText(), '48 m');
    assert.equal(await valore(page, 'Riepilogo', 'FC massima').innerText(), '147 bpm');
    const tracciato = sezione(page, 'Tracciato');
    await tracciato.getByText('corsa.gpx').waitFor();
    assert.equal(await tracciato.locator('svg').count(), 2); // percorso + profilo
    const righe = sezione(page, 'Split per km').locator('tbody tr');
    assert.equal(await righe.count(), 8);
    assert.match(await righe.nth(7).innerText(), /0,43 km/);
    assert.match(await righe.nth(7).innerText(), /8′20″/);
    assert.equal(await sezione(page, 'Split per km').locator('tr.piu-veloce').count(), 1);
    assert.match(await sezione(page, 'Split per km').locator('tr.piu-veloce').innerText(), /^4\b[\s\S]*5′40″/);
    assert.match(await righe.nth(3).innerText(), /143/);
    assert.match(await righe.nth(0).innerText(), /140/);
    // tooltip del grafico FC
    const grafico = sezione(page, 'Grafico FC').locator('svg');
    await grafico.hover();
    await sezione(page, 'Grafico FC').getByText(/^\d+′\d{2}″ · \d+ bpm$/).waitFor();
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('sessione senza fcSerie', async () => {
  const { page, chiudi } = await cliente();
  try {
    await apriDaRecenti(page, 'Bici');
    assert.deepEqual(await titoli(page), ['Riepilogo', 'Grafico FC', 'Zone FC']);
    await sezione(page, 'Grafico FC').getByText('Nessun dato').waitFor();
    await sezione(page, 'Zone FC').getByText('Nessun dato').waitFor();
    assert.equal(await valore(page, 'Riepilogo', 'FC massima').innerText(), '—');
    assert.equal(await valore(page, 'Riepilogo', 'FC media').innerText(), '130 bpm');
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('corsa senza tracciato', async () => {
  const seme = { ...SEME };
  delete seme['tracciati/googleHealth_c1'];
  const { page, chiudi } = await cliente({ seme });
  try {
    await apriDaRecenti(page, 'Corsa');
    assert.deepEqual(await titoli(page), ['Riepilogo', 'Tracciato', 'Grafico FC', 'Zone FC']);
    await sezione(page, 'Tracciato').getByText('Nessun tracciato').waitFor();
    assert.equal(await valore(page, 'Riepilogo', 'Distanza').innerText(), '7,00 km');
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('doppioni', async () => {
  const { page, chiudi } = await cliente();
  try {
    await recenti(page).getByRole('button').first().waitFor();
    assert.equal(await recenti(page).getByRole('button').count(), 3);
    await apriDaRecenti(page, 'Palestra');
    await page.locator('.testata-attivita').getByText('unite 2 registrazioni').waitFor();
    await senzaValoriRotti(page);
    await page.getByRole('button', { name: '‹ Indietro' }).click();
    await apriDaRecenti(page, 'Corsa');
    assert.equal(await page.getByText(/unite \d+ registrazioni/).count(), 0);
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('id inesistente', async () => {
  const { page, chiudi } = await cliente();
  try {
    await apriDaRecenti(page, 'Bici');
    await page.evaluate(async () => { const db = await window.claude.use('db'); await db.doc('sessioni/googleHealth_b1').delete(); });
    await page.locator('.scheda-attivita .vuoto').getByText('Nessun dato').waitFor();
    assert.equal(await page.locator('.scheda-attivita h2').count(), 0);
    await page.getByRole('button', { name: '‹ Indietro' }).click();
    await recenti(page).waitFor();
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('dalla colonna Fatto della giornata', async () => {
  const rev = {
    validaDal: '2026-10-01', autore: 'u-trainer', salvataIl: '2026-10-01T10:00:00+02:00', nota: '', durataStimataMin: 60,
    riscaldamento: [], stretching: [], principale: [{ nome: 'Panca', serie: 3, ripetizioni: 10, caricoKg: 40, recuperoSec: 90, nota: '', hevyTemplateId: null }],
  };
  const seme = {
    ...SEME,
    'schede/spinta': { nome: 'Spinta A', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T10:00:00Z' },
    'schede/spinta/revisioni/r1': rev,
    'settimane/v1': { numero: 1, validaDal: '2026-10-26', giorni: { lun: null, mar: null, mer: 'spinta', gio: null, ven: null, sab: null, dom: null }, autore: 'u-trainer', creataIl: '2026-10-25T10:00:00Z' },
  };
  const { page, chiudi } = await cliente({ seme });
  try {
    await page.locator('.allenamento-link').click();
    await page.getByRole('heading', { name: 'mercoledì 4 novembre' }).waitFor();
    await page.locator('.colonna-fatto').getByRole('button', { name: 'Apri scheda' }).click();
    await page.locator('.testata-attivita').getByText('mer 4 nov · 07:30').waitFor();
    await senzaValoriRotti(page);
    await page.getByRole('button', { name: '‹ Indietro' }).click();
    await page.getByRole('heading', { name: 'mercoledì 4 novembre' }).waitFor();
  } finally { await chiudi(); }
});

test('da Dati del cliente', async () => {
  const { page, chiudi } = await apriPannello({ isOwner: false, userId: 'u-trainer', seme: SEME });
  try {
    await page.getByRole('link', { name: 'Dati del cliente' }).click();
    await page.getByRole('heading', { name: 'Dati del cliente' }).waitFor();
    await page.getByRole('button', { name: '1 · Corsa' }).click();
    await page.locator('.testata-attivita').getByRole('heading', { name: 'Corsa' }).waitFor();
    assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Dati del cliente' }).getAttribute('aria-current'), 'page');
    await sezione(page, 'Split per km').waitFor();
    await senzaValoriRotti(page);
    await page.getByRole('button', { name: '‹ Indietro' }).click();
    await page.getByRole('heading', { name: 'Dati del cliente' }).waitFor();
  } finally { await chiudi(); }
});

// ---- caricamento del GPX (Task 6) ----
const ESEMPIO = fileURLToPath(new URL('../fixtures/esempio.gpx', import.meta.url));
const TESTO_ESEMPIO = readFileSync(ESEMPIO, 'utf8');
const SOVRAPPOSIZIONE = 'Il tracciato non coincide con questa sessione (orari diversi). Collegarlo comunque?';
const SENZA_TRACCIATO = (() => { const s = { ...SEME }; delete s['tracciati/googleHealth_c1']; return s; })();
const conAsset = (o = {}) => cliente({ seme: SENZA_TRACCIATO, assets: true, ...o });
const inputGpx = (page) => sezione(page, 'Tracciato').locator('input[type=file]');
const dump = (page) => page.evaluate(() => window.claude.dump());
const chiamateAsset = (page) => page.evaluate(() => window.claude.chiamateAsset());
const file = (name, testo) => ({ name, mimeType: 'application/gpx+xml', buffer: Buffer.from(testo) });
async function caricaEsempio(page) {
  await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).waitFor();
  await inputGpx(page).setInputFiles(file('esempio.gpx', TESTO_ESEMPIO));
  await sezione(page, 'Split per km').waitFor();
}

test('carica GPX', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await caricaEsempio(page);
    assert.equal(await sezione(page, 'Split per km').locator('tbody tr').count(), 9);
    const tracciato = sezione(page, 'Tracciato');
    await tracciato.getByText('esempio.gpx', { exact: true }).waitFor();
    assert.equal(await tracciato.locator('svg').count(), 2);
    await tracciato.getByRole('button', { name: 'Sostituisci' }).waitFor();
    await tracciato.getByRole('button', { name: 'Rimuovi' }).waitFor();
    assert.equal(await tracciato.getByRole('button', { name: 'Carica tracciato GPX' }).count(), 0);
    assert.equal(await valore(page, 'Riepilogo', 'Distanza').innerText(), '8,43 km');
    const doc = (await dump(page))['tracciati/googleHealth_c1'];
    assert.partialDeepStrictEqual(doc, {
      idParte: 'googleHealth_c1', fonte: 'gpx', nomeFile: 'esempio.gpx', idAsset: 'a1', autore: 'u-cliente',
      inizio: '2026-11-03T17:00:00.000Z', fine: '2026-11-03T17:45:00.000Z', distanzaM: 8430,
    });
    assert.ok(doc.caricatoIl);
    assert.equal(doc.split.length, 9);
    // il file arriva come application/gpx+xml: l'upload deve dichiarare text/plain (unico tipo testuale adatto)
    assert.deepEqual(await chiamateAsset(page), { upload: ['a1'], tipi: ['text/plain'], delete: [] });
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('sovrapposizione bassa', async () => {
  const altroGiorno = TESTO_ESEMPIO.replaceAll('2026-11-03T', '2026-10-20T');
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).waitFor();
    await inputGpx(page).setInputFiles(file('altro.gpx', altroGiorno));
    const dialogo = page.getByRole('dialog', { name: SOVRAPPOSIZIONE });
    await dialogo.waitFor();
    await dialogo.getByRole('button', { name: 'Annulla' }).click();
    await dialogo.waitFor({ state: 'detached' });
    assert.equal((await dump(page))['tracciati/googleHealth_c1'], undefined);
    assert.deepEqual(await chiamateAsset(page), { upload: [], tipi: [], delete: [] });
    await inputGpx(page).setInputFiles(file('altro.gpx', altroGiorno));
    await dialogo.getByRole('button', { name: 'Collega' }).click();
    await sezione(page, 'Split per km').waitFor();
    assert.partialDeepStrictEqual((await dump(page))['tracciati/googleHealth_c1'], { idAsset: 'a1', nomeFile: 'altro.gpx' });
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('file non valido', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).waitFor();
    await inputGpx(page).setInputFiles(file('rotto.gpx', 'non è un GPX <gpx>'));
    await sezione(page, 'Tracciato').getByRole('alert').getByText('File GPX non valido: servono punti con data e ora', { exact: true }).waitFor();
    // GPX ben formato ma senza orari
    await inputGpx(page).setInputFiles(file('senza-ora.gpx', TESTO_ESEMPIO.replace(/<time>[^<]*<\/time>/g, '')));
    await sezione(page, 'Tracciato').getByRole('alert').getByText('File GPX non valido: servono punti con data e ora', { exact: true }).waitFor();
    assert.deepEqual(await chiamateAsset(page), { upload: [], tipi: [], delete: [] });
    assert.equal((await dump(page))['tracciati/googleHealth_c1'], undefined);
  } finally { await chiudi(); }
});

test('file troppo grande', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).waitFor();
    await inputGpx(page).setInputFiles({ name: 'grande.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.alloc(16 * 1024 * 1024, 32) });
    await sezione(page, 'Tracciato').getByRole('alert').getByText('File troppo grande (massimo 15 MB)', { exact: true }).waitFor();
    assert.deepEqual(await chiamateAsset(page), { upload: [], tipi: [], delete: [] });
    assert.equal((await dump(page))['tracciati/googleHealth_c1'], undefined);
  } finally { await chiudi(); }
});

test('upload dell\'asset fallito', async () => {
  const { page, chiudi } = await conAsset({ assetFallisce: true });
  try {
    await apriDaRecenti(page, 'Corsa');
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).waitFor();
    await inputGpx(page).setInputFiles(file('esempio.gpx', TESTO_ESEMPIO));
    await sezione(page, 'Tracciato').getByRole('alert').getByText('Caricamento non riuscito. Riprova.', { exact: true }).waitFor();
    assert.equal((await dump(page))['tracciati/googleHealth_c1'], undefined);
    assert.equal(await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).isEnabled(), true);
  } finally { await chiudi(); }
});

test('sostituzione', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await caricaEsempio(page);
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Sostituisci' }).waitFor();
    await inputGpx(page).setInputFiles(file('nuovo.gpx', TESTO_ESEMPIO));
    await sezione(page, 'Tracciato').getByText('nuovo.gpx', { exact: true }).waitFor();
    await page.waitForFunction(() => window.claude.chiamateAsset().delete.length === 1);
    assert.deepEqual(await chiamateAsset(page), { upload: ['a1', 'a2'], tipi: ['text/plain', 'text/plain'], delete: ['a1'] });
    assert.partialDeepStrictEqual((await dump(page))['tracciati/googleHealth_c1'], { idAsset: 'a2', nomeFile: 'nuovo.gpx' });
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('sostituzione fallita', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await caricaEsempio(page);
    await page.evaluate(() => window.claude.scritturaFallisce('tracciati'));
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Sostituisci' }).waitFor();
    await inputGpx(page).setInputFiles(file('nuovo.gpx', TESTO_ESEMPIO));
    await sezione(page, 'Tracciato').getByRole('alert').getByText('Caricamento non riuscito. Riprova.', { exact: true }).waitFor();
    assert.deepEqual(await chiamateAsset(page), { upload: ['a1', 'a2'], tipi: ['text/plain', 'text/plain'], delete: ['a2'] });
    assert.partialDeepStrictEqual((await dump(page))['tracciati/googleHealth_c1'], { idAsset: 'a1', nomeFile: 'esempio.gpx' });
    await sezione(page, 'Tracciato').getByText('esempio.gpx', { exact: true }).waitFor();
    assert.equal(await sezione(page, 'Tracciato').getByRole('button', { name: 'Sostituisci' }).isEnabled(), true);
  } finally { await chiudi(); }
});

test('rimozione', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Corsa');
    await caricaEsempio(page);
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Rimuovi' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Rimuovere il tracciato?' });
    await dialogo.getByRole('button', { name: 'Annulla' }).click();
    await dialogo.waitFor({ state: 'detached' });
    assert.ok((await dump(page))['tracciati/googleHealth_c1']);
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Rimuovi' }).click();
    await dialogo.getByRole('button', { name: 'Rimuovi' }).click();
    await sezione(page, 'Tracciato').getByText('Nessun tracciato').waitFor();
    await page.waitForFunction(() => window.claude.chiamateAsset().delete.length === 1);
    assert.equal((await dump(page))['tracciati/googleHealth_c1'], undefined);
    assert.deepEqual(await chiamateAsset(page), { upload: ['a1'], tipi: ['text/plain'], delete: ['a1'] });
    assert.equal(await sezione(page, 'Split per km').count(), 0);
    await sezione(page, 'Tracciato').getByRole('button', { name: 'Carica tracciato GPX' }).waitFor();
    await senzaValoriRotti(page);
  } finally { await chiudi(); }
});

test('sola lettura: nessun pulsante di caricamento', async () => {
  for (const [opzioni, seme] of [
    [{ puoScrivere: false, assets: true }, SENZA_TRACCIATO],
    [{ puoScrivere: false, assets: true }, SEME],
    [{}, SENZA_TRACCIATO],
    [{}, SEME],
  ]) {
    const { page, chiudi } = await cliente({ seme, ...opzioni });
    try {
      await apriDaRecenti(page, 'Corsa');
      const tracciato = sezione(page, 'Tracciato');
      await tracciato.waitFor();
      assert.equal(await tracciato.getByRole('button').count(), 0);
      assert.equal(await tracciato.locator('input[type=file]').count(), 0);
    } finally { await chiudi(); }
  }
});

test('palestra: nessun pulsante di caricamento', async () => {
  const { page, chiudi } = await conAsset();
  try {
    await apriDaRecenti(page, 'Palestra');
    assert.equal(await page.getByRole('button', { name: 'Carica tracciato GPX' }).count(), 0);
    assert.equal(await page.locator('input[type=file]').count(), 0);
  } finally { await chiudi(); }
});
