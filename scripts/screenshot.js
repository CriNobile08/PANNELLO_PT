// Screenshot dimostrativi di dist/pannello.html (npm run build prima).
// Uso: node scripts/screenshot.js  ->  screenshots/{oggi,giornata,settimana,piano,dati-cliente-*,giornata-sessione-*}.png
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { apriPannello, chiudiBrowser } from '../test/support/apri.js';

const USCITA = fileURLToPath(new URL('../screenshots/', import.meta.url));
const esc = (nome) => ({ nome, durataSec: 30, serie: null, ripetizioni: null, perLato: false, nota: '' });
const rev = (nota, principale) => ({
  validaDal: '2026-10-01', autore: 'u-trainer', salvataIl: '2026-10-01T10:00:00+02:00', nota, durataStimataMin: 60,
  riscaldamento: [esc('Corda'), esc('Cerchi braccia'), esc('Squat a corpo libero')],
  principale,
  stretching: [esc('Pettorali'), esc('Spalle')],
});
const giorni = (o) => ({ lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null, ...o });
const SEME = {
  'schede/spinta': { nome: 'Spinta A', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T10:00:00Z' },
  'schede/spinta/revisioni/r1': rev('Carichi come settimana scorsa', [
    { nome: 'Panca piana', serie: 3, ripetizioni: 10, caricoKg: 22.5, recuperoSec: 150, nota: 'Scapole addotte', hevyTemplateId: null },
    { nome: 'Croci ai cavi', serie: 3, ripetizioni: 12, caricoKg: null, recuperoSec: 90, nota: '', hevyTemplateId: null },
  ]),
  'schede/gambe': { nome: 'Gambe', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T10:00:00Z' },
  'schede/gambe/revisioni/r1': rev('', [
    { nome: 'Squat', serie: 4, ripetizioni: 8, caricoKg: 60, recuperoSec: 180, nota: '', hevyTemplateId: null },
    { nome: 'Affondi', serie: 3, ripetizioni: 10, caricoKg: 12, recuperoSec: 90, nota: '', hevyTemplateId: null },
  ]),
  'settimane/v1': { numero: 1, validaDal: '2026-10-26', giorni: giorni({ lun: 'gambe', mer: 'spinta', ven: 'gambe' }), autore: 'u-trainer', creataIl: '2026-10-25T10:00:00Z' },
  // eccezione: la sessione di venerdì è spostata a giovedì solo questa settimana
  'eccezioni/2026-11-05': { schedaId: 'gambe', origine: '2026-11-06', autore: 'u-cliente', creataIl: '2026-11-03T20:00:00Z' },
  'eccezioni/2026-11-06': { schedaId: null, origine: null, autore: 'u-cliente', creataIl: '2026-11-03T20:00:00Z' },
  'diario/2026-11-04': { riscaldamentoFatti: [0, 1], stretchingFatti: [], principaleFatto: false, sensazione: 4, nota: 'Dormito poco ma carico', aggiornatoIl: '2026-11-04T08:30:00Z' },
  'alimentazione/a1': {
    numero: 1, validaDal: '2026-10-01', indicazioni: 'Bere almeno 2 litri di acqua al giorno', autore: 'u-trainer', creataIl: '2026-10-01T10:00:00Z',
    pasti: [
      { nome: 'Colazione', opzioni: [
        { nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Avena', grammi: 60 }, { nome: 'Yogurt greco', grammi: 150 }] },
        { nome: 'Opzione 2', nota: 'Con calma', alimenti: [{ nome: 'Pane integrale', grammi: 70.5 }, { nome: 'Uova', grammi: 120 }] },
      ] },
      { nome: 'Pranzo', opzioni: [{ nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Riso', grammi: 80 }, { nome: 'Pollo', grammi: 150 }] }] },
      { nome: 'Cena', opzioni: [{ nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Salmone', grammi: 160 }, { nome: 'Verdure', grammi: 200 }] }] },
    ],
  },
};

// Dati di salute FINTI (sintetici, non reali): 14 giorni fino a "oggi" (2026-11-04), 2 sessioni, obiettivo e stato sync.
const OGGI = '2026-11-04';
const giornoPrima = (n) => new Date(Date.parse(`${OGGI}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const salute = {};
for (let n = 13; n >= 0; n--) {
  const d = giornoPrima(n);
  const ond = [0, 3, -2, 5, -4, 2, 1][n % 7];
  const dormiti = 400 + ond * 10 + (n % 3) * 8;
  const profondo = 70 + ond * 3; const rem = 95 + ond * 2; const sveglio = 28 + (n % 4) * 4;
  const addormentato = 360 + ond * 12;
  salute[`salute/${d}`] = {
    fonte: 'googleHealth',
    sonno: {
      inizio: `${giornoPrima(n + 1)}T22:${String(40 + (n % 4) * 5).padStart(2, '0')}:00+01:00`,
      fine: `${d}T06:${String(30 + (n % 5) * 4).padStart(2, '0')}:00+01:00`,
      minutiAddormentato: addormentato, minutiSveglio: sveglio, minutiPerAddormentarsi: 8 + (n % 5) * 3,
      fasi: { profondo, rem, leggero: addormentato - profondo - rem, sveglio },
    },
    pisolini: n === 5 ? [{ inizio: `${d}T14:10:00+01:00`, fine: `${d}T14:35:00+01:00`, minuti: 25 }] : [],
    fcRiposo: 56 + (n % 5),
    hrv: { rmssd: 44 + ond * 2, rmssdProfondo: 52 + ond * 2, fcNonRem: 52 + (n % 4) },
    passi: 6200 + ((n * 937) % 5200),
    aggiornatoIl: `${d}T08:00:00Z`,
  };
}
const SALUTE = {
  ...salute,
  'sessioni/googleHealth_a1': {
    fonte: 'googleHealth', idFonte: 'a1', data: OGGI, inizio: `${OGGI}T07:30:00+01:00`, fine: `${OGGI}T08:25:00+01:00`,
    tipo: 'palestra', tipoOriginale: 'WEIGHTLIFTING', nome: 'Allenamento pesi', durataAttivaMin: 55, fcMedia: 118,
    zoneMin: { leggera: 14, moderata: 28, intensa: 11, picco: 2 }, calorie: 320, passi: 1450, distanzaM: null, dislivelloM: null, gps: false,
    aggiornatoIl: `${OGGI}T08:40:00Z`,
  },
  'sessioni/googleHealth_b2': {
    fonte: 'googleHealth', idFonte: 'b2', data: '2026-11-02', inizio: '2026-11-02T18:10:00+01:00', fine: '2026-11-02T18:58:00+01:00',
    tipo: 'corsa', tipoOriginale: 'RUNNING', nome: 'Corsa', durataAttivaMin: 46, fcMedia: 152,
    zoneMin: { leggera: 6, moderata: 22, intensa: 15, picco: 3 }, calorie: 465, passi: 6900, distanzaM: 7800, dislivelloM: 48, gps: true,
    aggiornatoIl: '2026-11-02T19:10:00Z',
  },
  'impostazioni/obiettivi': { sonnoMinuti: 480 },
  'sync/stato': { ultimaEsecuzione: `${OGGI}T08:45:00Z`, esito: 'ok', messaggio: '', tipiMancanti: [], conteggi: { giorni: 3, sessioni: 2 } },
};
Object.assign(SEME, SALUTE);
const PROFILI = { 'u-trainer': 'Luca', 'u-cliente': 'Sara' };

async function scatta(opzioni, nome, passi) {
  const { page, chiudi } = await apriPannello({ seme: SEME, profili: PROFILI, ...opzioni });
  try {
    await passi(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${USCITA}${nome}.png`, fullPage: true });
    const larghezzaDoc = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${nome}.png  scrollWidth=${larghezzaDoc}`);
  } finally { await chiudi(); }
}

await mkdir(USCITA, { recursive: true });
const cliente = { isOwner: true, userId: 'u-cliente', larghezza: 390 };
const trainer = { isOwner: false, userId: 'u-trainer', larghezza: 1440 };

try {
  await scatta(cliente, 'oggi', (p) => p.getByText('Oggi · mer 4 nov').waitFor());
  await scatta(cliente, 'giornata', async (p) => {
    await p.getByRole('link', { name: /Spinta A/ }).click();
    await p.getByText('Mercoledì 4 novembre').waitFor();
  });
  await scatta(trainer, 'settimana', (p) => p.getByText('OGGI', { exact: true }).waitFor());
  for (const [larghezza, w] of [[390, '390'], [1440, '1440']]) {
    await scatta({ isOwner: false, userId: 'u-trainer', larghezza }, `dati-cliente-${w}`, async (p) => {
      await p.getByRole('link', { name: 'Dati del cliente' }).click();
      await p.getByRole('heading', { name: 'Dati del cliente' }).waitFor();
    });
    await scatta({ isOwner: true, userId: 'u-cliente', larghezza }, `giornata-sessione-${w}`, async (p) => {
      await p.getByRole('link', { name: /Spinta A/ }).click();
      await p.getByText('Mercoledì 4 novembre').waitFor();
    });
  }
  await scatta(trainer, 'piano', async (p) => {
    await p.getByRole('link', { name: 'Piano alimentare' }).click();
    await p.getByText('In vigore dal', { exact: false }).waitFor();
  });
} finally { await chiudiBrowser(); }
