import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const schedeDi = (d) => Object.keys(d).filter((p) => /^schede\/[^/]+$/.test(p));
const idScheda = (d, nome) => schedeDi(d).find((p) => d[p].nome === nome)?.split('/')[1];
const revisioniDi = (d, schedaId) => Object.entries(d)
  .filter(([p]) => new RegExp(`^schede/${schedaId}/revisioni/[^/]+$`).test(p))
  .map(([p, r]) => ({ id: p.split('/').pop(), ...r }));
const revisioneDi = (d, nome) => {
  const id = idScheda(d, nome);
  return d[`schede/${id}/revisioni/${d[`schede/${id}`].revisioneCorrente}`];
};
const trainer = (extra = {}) => apriPannello({ isOwner: false, userId: 'u-trainer', profili: { 'u-trainer': 'Luca', 'u-altro': 'Marta' }, ...extra });
const vaiASchede = (page) => page.getByRole('link', { name: 'Schede di allenamento' }).click();

const REV = {
  validaDal: '2026-10-01', autore: 'u-altro', salvataIl: '2026-10-01T10:30:00+02:00', nota: 'Vecchia nota', durataStimataMin: 60,
  riscaldamento: [], principale: [{ nome: 'Panca', serie: 3, ripetizioni: 10, caricoKg: 40, recuperoSec: 90, nota: '', hevyTemplateId: null }], stretching: [],
};

test('nuova scheda: validazione, virgola, salvataggio e conflitto', async () => {
  const { page, chiudi } = await trainer();
  try {
    await vaiASchede(page);
    await page.getByRole('button', { name: '+ Nuova scheda' }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('Campo obbligatorio').first().waitFor();
    assert.equal(schedeDi(await dump(page)).length, 0);
    await page.getByLabel('Nome della scheda', { exact: true }).fill('Spinta A');
    const principale = page.getByRole('region', { name: 'Parte principale' });
    await principale.getByRole('button', { name: '+ Aggiungi esercizio' }).click();
    const riga = principale.getByRole('group', { name: 'Esercizio 1' });
    await riga.getByLabel('Nome', { exact: true }).fill('Panca piana');
    await riga.getByLabel('Serie', { exact: true }).fill('4');
    await riga.getByLabel('Ripetizioni', { exact: true }).fill('8');
    await riga.getByLabel('Carico (kg)', { exact: true }).fill('22,5');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('Spinta A').waitFor();
    const d = await dump(page);
    const rev = revisioneDi(d, 'Spinta A');
    assert.equal(rev.principale[0].caricoKg, 22.5);
    assert.equal(rev.principale[0].serie, 4);
    assert.equal(rev.autore, 'u-trainer');
    const id = idScheda(d, 'Spinta A');

    // conflitto: un altro utente scrive mentre l'editor è aperto
    await page.getByText('Spinta A').click();
    await page.getByLabel('Nome della scheda', { exact: true }).waitFor();
    await page.getByLabel('Nota del trainer', { exact: true }).fill('La mia nota');
    await page.evaluate(async (sid) => {
      const db = await window.claude.use('db');
      await db.collection(`schede/${sid}/revisioni`).doc('altra').set({
        validaDal: '2026-11-04', autore: 'u-altro', salvataIl: '2026-11-04T10:30:00+01:00', nota: 'Nota di Marta',
        durataStimataMin: null, riscaldamento: [], stretching: [],
        principale: [{ nome: 'Panca', serie: 5, ripetizioni: 5, caricoKg: null, recuperoSec: null, nota: '', hevyTemplateId: null }],
      });
      await db.doc(`schede/${sid}`).update({ revisioneCorrente: 'altra' });
    }, id);
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('La scheda è stata modificata da Marta alle 10:30').waitFor();
    // "Vedi le sue modifiche" ricarica l'editor con la revisione corrente
    await page.getByRole('button', { name: 'Vedi le sue modifiche' }).click();
    await page.getByLabel('Nota del trainer', { exact: true }).and(page.locator('textarea')).waitFor();
    assert.equal(await page.getByLabel('Nota del trainer', { exact: true }).inputValue(), 'Nota di Marta');
    // di nuovo: modifica, conflitto e "Sovrascrivi"
    await page.getByLabel('Nota del trainer', { exact: true }).fill('Nota finale');
    await page.evaluate(async (sid) => {
      const db = await window.claude.use('db');
      await db.collection(`schede/${sid}/revisioni`).doc('altra2').set({
        validaDal: '2026-11-04', autore: 'u-altro', salvataIl: '2026-11-04T11:45:00+01:00', nota: 'Ancora Marta',
        durataStimataMin: null, riscaldamento: [], stretching: [], principale: [],
      });
      await db.doc(`schede/${sid}`).update({ revisioneCorrente: 'altra2' });
    }, id);
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText(/La scheda è stata modificata da .* alle \d\d:\d\d/).waitFor();
    await page.getByRole('button', { name: 'Sovrascrivi' }).click();
    await page.getByRole('heading', { name: 'Schede di allenamento' }).waitFor();
    await page.getByRole('button', { name: '+ Nuova scheda' }).waitFor();
    const d2 = await dump(page);
    const nuova = revisioneDi(d2, 'Spinta A');
    assert.equal(nuova.nota, 'Nota finale');
    assert.equal(revisioniDi(d2, id).length, 4);
  } finally { await chiudi(); }
});

test('corsa: obiettivo al posto della parte principale; cronologia e sola lettura', async () => {
  const { page, chiudi } = await trainer({
    seme: {
      'schede/s1': { nome: 'Fondo lento', tipo: 'corsa', archiviata: false, revisioneCorrente: 'r2', creataDa: 'u-altro', creataIl: '2026-10-01T10:30:00+02:00' },
      'schede/s1/revisioni/r1': { ...REV, nota: 'Prima versione', principale: undefined, obiettivo: { descrizione: '5 km facili', distanzaKm: 5, dislivelloM: null } },
      'schede/s1/revisioni/r2': { ...REV, validaDal: '2026-10-20', salvataIl: '2026-10-20T08:15:00+02:00', nota: 'Seconda versione', principale: undefined, obiettivo: { descrizione: '8 km ritmo lento', distanzaKm: 8, dislivelloM: 120 } },
    },
  });
  try {
    await vaiASchede(page);
    await page.getByText('Fondo lento').click();
    assert.equal(await page.getByRole('region', { name: 'Parte principale' }).count(), 0);
    const ob = page.getByRole('region', { name: 'Obiettivo' });
    assert.equal(await ob.getByLabel('Descrizione', { exact: true }).inputValue(), '8 km ritmo lento');
    assert.equal(await ob.getByLabel('Distanza (km)', { exact: true }).inputValue(), '8');
    // cronologia: data, autore e ora
    await page.getByRole('button', { name: /mar 20 ott.*Marta.*08:15/ }).waitFor();
    await page.getByRole('button', { name: /gio 1 ott.*Marta.*10:30/ }).click();
    await page.getByText('Prima versione').waitFor();
    await page.getByText('5 km facili').waitFor();
  } finally { await chiudi(); }
});

test('libreria: ricerca, archiviate, punto colorato e archiviazione', async () => {
  const seme = {
    'schede/s1': { nome: 'Spinta A', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-altro', creataIl: '2026-10-01T10:30:00+02:00' },
    'schede/s1/revisioni/r1': REV,
    'schede/s2': { nome: 'Fondo lento', tipo: 'corsa', archiviata: false, revisioneCorrente: 'r2', creataDa: 'u-altro', creataIl: '2026-10-01T10:30:00+02:00' },
    'schede/s2/revisioni/r2': { ...REV, principale: undefined, obiettivo: { descrizione: 'x', distanzaKm: 5, dislivelloM: null } },
    'schede/s3': { nome: 'Vecchia gamba', tipo: 'altro', archiviata: true, revisioneCorrente: 'r3', creataDa: 'u-altro', creataIl: '2026-10-01T10:30:00+02:00' },
    'schede/s3/revisioni/r3': REV,
    'settimane/w1': { numero: 1, validaDal: '2026-10-26', autore: 'u-altro', creataIl: '2026-10-26T10:00:00+01:00', giorni: { lun: 's1', mar: null, mer: null, gio: null, ven: null, sab: null, dom: null } },
    'eccezioni/2026-11-10': { schedaId: 's2', origine: null, autore: 'u-altro', creataIl: '2026-11-04T08:00:00+01:00' },
  };
  const { page, chiudi } = await trainer({ seme });
  try {
    await vaiASchede(page);
    await page.getByText('Spinta A').waitFor();
    assert.equal(await page.getByText('Vecchia gamba').count(), 0);
    assert.equal(await page.getByText('1 esercizio').count(), 1);
    const colore = (nome) => page.locator('.riga-scheda', { hasText: nome }).locator('.punto').evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(await colore('Spinta A'), 'rgb(91, 155, 255)');
    assert.equal(await colore('Fondo lento'), 'rgb(43, 196, 166)');
    await page.getByLabel('Cerca una scheda', { exact: true }).fill('FONDO');
    await page.getByText('Fondo lento').waitFor();
    assert.equal(await page.getByText('Spinta A').count(), 0);
    await page.getByLabel('Cerca una scheda', { exact: true }).fill('');
    await page.getByLabel('Mostra archiviate', { exact: true }).check();
    await page.getByText('Vecchia gamba').waitFor();
    await page.getByLabel('Mostra archiviate', { exact: true }).uncheck();

    // in uso nella settimana in vigore
    await page.getByText('Spinta A').click();
    await page.getByRole('button', { name: 'Archivia' }).click();
    await page.getByRole('dialog', { name: 'Archiviare la scheda?' }).getByRole('button', { name: 'Archivia' }).click();
    await page.getByText('Settimana tipo n. 1 (dal lun 26 ott)').waitFor();
    assert.equal((await dump(page))['schede/s1'].archiviata, false);
    await page.getByRole('button', { name: 'Chiudi' }).click();
    await page.getByRole('button', { name: 'Torna alle schede' }).click();
    // in uso in un'eccezione futura
    await page.getByText('Fondo lento').click();
    await page.getByRole('button', { name: 'Archivia' }).click();
    await page.getByRole('dialog', { name: 'Archiviare la scheda?' }).getByRole('button', { name: 'Archivia' }).click();
    await page.getByText('Eccezione del mar 10 nov').waitFor();
    await page.getByRole('button', { name: 'Chiudi' }).click();
  } finally { await chiudi(); }
});

test('archiviazione riuscita e sola lettura', async () => {
  const seme = {
    'schede/s1': { nome: 'Libera', tipo: 'altro', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-altro', creataIl: '2026-10-01T10:30:00+02:00' },
    'schede/s1/revisioni/r1': REV,
  };
  const a = await trainer({ seme });
  const b = await trainer({ seme, puoScrivere: false });
  try {
    await vaiASchede(a.page);
    await a.page.getByText('Libera').click();
    await a.page.getByRole('button', { name: 'Archivia' }).click();
    const conferma = a.page.getByRole('dialog', { name: 'Archiviare la scheda?' });
    await conferma.getByText('Non comparirà più nella libreria e nelle assegnazioni.').waitFor();
    assert.equal(await conferma.getByText('modifiche non salvate', { exact: false }).count(), 0);
    // Annulla: niente archiviazione
    await conferma.getByRole('button', { name: 'Annulla' }).click();
    assert.equal((await dump(a.page))['schede/s1'].archiviata, false);
    // con modifiche non salvate il dialogo lo dice
    await a.page.getByLabel('Nota del trainer', { exact: true }).fill('non salvata');
    await a.page.getByRole('button', { name: 'Archivia' }).click();
    await conferma.getByText('Hai modifiche non salvate: andranno perse.').waitFor();
    await conferma.getByRole('button', { name: 'Archivia' }).click();
    await a.page.getByRole('button', { name: '+ Nuova scheda' }).waitFor();
    assert.equal((await dump(a.page))['schede/s1'].archiviata, true);
    await a.page.getByText('Libera').waitFor({ state: 'detached' });
    // una scheda già archiviata non offre "Archivia"
    await a.page.getByLabel('Mostra archiviate', { exact: true }).check();
    await a.page.getByText('Libera').click();
    await a.page.getByLabel('Nome della scheda', { exact: true }).waitFor();
    assert.equal(await a.page.getByRole('button', { name: 'Archivia' }).count(), 0);

    await vaiASchede(b.page);
    await b.page.getByText('Libera').click();
    await b.page.getByLabel('Nota del trainer', { exact: true }).fill('x');
    assert.equal(await b.page.getByRole('button', { name: 'Salva' }).isDisabled(), true);
    assert.equal(await b.page.getByRole('button', { name: 'Archivia' }).isDisabled(), true);
  } finally { await a.chiudi(); await b.chiudi(); }
});

test('liste: sposta su/giù e rimuovi; modifiche non salvate chiedono conferma', async () => {
  const { page, chiudi } = await trainer();
  try {
    await vaiASchede(page);
    await page.getByRole('button', { name: '+ Nuova scheda' }).click();
    const risc = page.getByRole('region', { name: 'Riscaldamento' });
    await risc.getByRole('button', { name: '+ Aggiungi esercizio' }).click();
    await risc.getByRole('button', { name: '+ Aggiungi esercizio' }).click();
    // nomi liberi: si scrivono nella ricerca e si sceglie "Esercizio non in elenco…"
    for (const [n, nome] of [[1, 'Corda'], [2, 'Cerchi']]) {
      const riga = risc.getByRole('group', { name: `Esercizio ${n}` });
      await riga.getByRole('combobox', { name: 'Nome' }).fill(nome);
      await riga.getByRole('option', { name: 'Esercizio non in elenco…' }).click();
    }
    await risc.getByRole('group', { name: 'Esercizio 2' }).getByRole('button', { name: 'Sposta su' }).click();
    assert.equal(await risc.getByRole('group', { name: 'Esercizio 1' }).getByLabel('Nome', { exact: true }).inputValue(), 'Cerchi');
    await risc.getByRole('group', { name: 'Esercizio 1' }).getByRole('button', { name: 'Rimuovi' }).click();
    assert.equal(await risc.getByRole('group').count(), 1);
    assert.equal(await risc.getByLabel('Nome', { exact: true }).inputValue(), 'Corda');
    // sporco: il cambio di sezione passa dalla guardia
    await page.getByRole('link', { name: 'Piano alimentare' }).click();
    await page.getByRole('dialog', { name: 'Hai modifiche non salvate. Uscire senza salvare?' }).waitFor();
  } finally { await chiudi(); }
});

test('revisione senza salvataIl: cronologia e dettaglio mostrano "…"', async () => {
  const seme = {
    'schede/s1': { nome: 'Senza ora', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-altro' },
    'schede/s1/revisioni/r1': { ...REV, salvataIl: undefined },
  };
  const { page, chiudi } = await trainer({ seme });
  try {
    await vaiASchede(page);
    await page.getByText('Senza ora').click();
    await page.getByRole('button', { name: /gio 1 ott.*Marta.*…/ }).click();
    await page.getByText('Revisione del gio 1 ott · Marta · …').waitFor();
  } finally { await chiudi(); }
});
