import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const giorno = (n) => `2026-11-${String(n).padStart(2, '0')}`;
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
const SESSIONI = {
  'sessioni/googleHealth_1': {
    fonte: 'googleHealth', idFonte: '1', data: '2026-11-04', inizio: '2026-11-04T07:30:00+01:00', fine: '2026-11-04T08:32:00+01:00',
    tipo: 'palestra', tipoOriginale: 'WEIGHTS', nome: 'Pesi', durataAttivaMin: 62, fcMedia: 118,
    zoneMin: { leggera: 10, moderata: 30, intensa: 15, picco: 7 }, calorie: 410, passi: null, distanzaM: null, dislivelloM: null, gps: false, aggiornatoIl: '2026-11-04T09:00:00+01:00',
  },
  'sessioni/googleHealth_2': {
    fonte: 'googleHealth', idFonte: '2', data: '2026-11-02', inizio: '2026-11-02T18:00:00+01:00', fine: '2026-11-02T18:48:00+01:00',
    tipo: 'corsa', tipoOriginale: 'RUNNING', nome: 'Corsa', durataAttivaMin: 48, fcMedia: 150,
    zoneMin: null, calorie: 500, passi: null, distanzaM: 7000, dislivelloM: 20, gps: true, aggiornatoIl: '2026-11-04T09:00:00+01:00',
  },
};
const STATO_OK = { ultimaEsecuzione: '2026-11-04T10:52:00+01:00', esito: 'ok', messaggio: '', tipiMancanti: [], conteggi: { giorni: 3, sessioni: 2 } };
const cliente = (o = {}) => apriPannello({ isOwner: true, userId: 'u-cliente', ...o });

test('anelli con dati', async () => {
  const { page, chiudi } = await cliente({ seme: { ...seme(10), 'impostazioni/obiettivi': { sonnoMinuti: 480 } } });
  try {
    await page.getByText('6 h 52').waitFor();
    await page.getByText('su 8 h').waitFor();
    await page.getByText('Profondo 71′ · REM 88′ · Leggero 253′').waitFor();
    await page.getByText('bpm', { exact: true }).waitFor();
    await page.locator('.anello-testo', { hasText: /^54/ }).waitFor();
    await page.getByText('41 ms').waitFor();
    await page.getByText('8.423').waitFor();
    await page.getByText('71 min').waitFor();
    await page.getByText('88 min').waitFor();
    assert.equal(await page.getByText('Nessun dato').count(), 1); // solo allenamento senza programma
  } finally { await chiudi(); }
});

test('in calibrazione', async () => {
  const { page, chiudi } = await cliente({ seme: seme(3) });
  try {
    await page.getByText('In calibrazione').waitFor();
    await page.locator('.anello-testo', { hasText: /^54/ }).waitFor();
  } finally { await chiudi(); }
});

test('nessun dato', async () => {
  const { page, chiudi } = await cliente({});
  try {
    await page.getByText('Nessun dato').first().waitFor();
    assert.equal(await page.getByText('Nessun dato', { exact: true }).count(), 7);
    assert.equal(await page.getByText('Attività recenti').count(), 0);
    assert.equal(await page.getByText(/Aggiornato alle|non riuscito/).count(), 0);
  } finally { await chiudi(); }
});

test('pisolino', async () => {
  const s = seme(10);
  s['salute/2026-11-04'] = salute(54, { pisolini: [{ inizio: '2026-11-04T14:00:00+01:00', fine: '2026-11-04T14:30:00+01:00', minutiAddormentato: 24 }] });
  const { page, chiudi } = await cliente({ seme: s });
  try { await page.getByText('+ pisolino 24 min').waitFor(); } finally { await chiudi(); }
});

test('stato sync ok ed errore', async () => {
  const a = await cliente({ seme: { ...seme(10), 'sync/stato': STATO_OK } });
  try { await a.page.getByText('Aggiornato alle 10:52', { exact: true }).waitFor(); } finally { await a.chiudi(); }
  const b = await cliente({ seme: { ...seme(10), 'sync/stato': { ...STATO_OK, esito: 'parziale', tipiMancanti: ['hrv'] } } });
  try { await b.page.getByText('Aggiornato alle 10:52 · Alcuni dati non aggiornati').waitFor(); } finally { await b.chiudi(); }
  const c = await cliente({ seme: { ...seme(10), 'sync/stato': { ...STATO_OK, esito: 'errore', messaggio: 'Autorizzazione Google scaduta: va rinnovato il token' } } });
  try {
    await c.page.getByText('Ultimo aggiornamento non riuscito alle 10:52: Autorizzazione Google scaduta: va rinnovato il token').waitFor();
  } finally { await c.chiudi(); }
});

test('attività recenti', async () => {
  const { page, chiudi } = await cliente({ seme: { ...seme(10), ...SESSIONI } });
  try {
    await page.getByText('Attività recenti').waitFor();
    await page.getByText('Palestra').first().waitFor();
    await page.getByText('1 h 02').waitFor();
    await page.getByText('48 min').waitFor();
    await page.getByText('118 bpm').waitFor();
  } finally { await chiudi(); }
});

test('sessione senza metriche', async () => {
  const s = { 'sessioni/googleHealth_9': { ...SESSIONI['sessioni/googleHealth_1'], idFonte: '9', durataAttivaMin: null, fcMedia: null, zoneMin: null, calorie: null } };
  const { page, chiudi } = await cliente({ seme: { ...seme(10), ...s } });
  try {
    await page.getByText('Attività recenti').waitFor();
    const testo = await page.locator('body').innerText();
    assert.doesNotMatch(testo, /NaN|null|undefined/);
    await page.getByText('—').first().waitFor();
  } finally { await chiudi(); }
});

test('aggiorna ora', async () => {
  const { page, chiudi } = await cliente({ mcp: true, seme: { ...seme(10), 'impostazioni/sync': { idAttivita: 'trig_abc' } } });
  try {
    await page.getByRole('button', { name: 'Aggiorna ora' }).click();
    await page.getByRole('button', { name: 'Aggiornamento in corso…' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Aggiornamento in corso…' }).isDisabled(), true);
    const chiamate = await page.evaluate(() => window.claude.chiamateMcp());
    assert.equal(chiamate.length, 1);
    assert.equal(chiamate[0].tool, 'fire_trigger');
    assert.equal(chiamate[0].input.trigger_id, 'trig_abc');
  } finally { await chiudi(); }
});

test('aggiorna ora: si riattiva dopo 2 minuti', async () => {
  const { page, chiudi } = await cliente({ mcp: true, installaOrologio: true, seme: { ...seme(10), 'impostazioni/sync': { idAttivita: 'trig_abc' } } });
  try {
    await page.getByRole('button', { name: 'Aggiorna ora' }).click();
    await page.getByRole('button', { name: 'Aggiornamento in corso…' }).waitFor();
    await page.clock.runFor(120_001);
    assert.equal(await page.getByRole('button', { name: 'Aggiorna ora' }).isDisabled(), false);
  } finally { await chiudi(); }
});

test('aggiorna ora senza attività o non proprietario', async () => {
  const a = await cliente({ mcp: true, seme: seme(10) });
  try {
    await a.page.getByText('6 h 52').waitFor();
    assert.equal(await a.page.getByRole('button', { name: 'Aggiorna ora' }).count(), 0);
  } finally { await a.chiudi(); }
  const b = await cliente({ mcp: true, isOwner: false, seme: { ...seme(10), 'impostazioni/sync': { idAttivita: 'trig_abc' } } });
  try {
    await b.page.getByRole('button', { name: 'Cliente' }).click();
    await b.page.getByText('6 h 52').waitFor();
    assert.equal(await b.page.getByRole('button', { name: 'Aggiorna ora' }).count(), 0);
  } finally { await b.chiudi(); }
});
