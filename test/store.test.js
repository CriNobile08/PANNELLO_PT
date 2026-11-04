import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../test/support/fake-claude.js';
import { creaStore } from '../src/data/store.js';
import { messaggioErrore, eRifiutoPermessi } from '../src/data/errori.js';

const adesso = () => new Date('2026-11-04T09:00:00Z');
const CONTENUTO_VALIDO = {
  nota: '', durataStimataMin: 60, riscaldamento: [], stretching: [], obiettivo: null,
  principale: [{ nome: 'Panca', serie: 4, ripetizioni: 6, caricoKg: 80, recuperoSec: 150, nota: '', hevyTemplateId: null }],
};
const G = { lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null };
const pick = (o, chiavi) => Object.fromEntries(chiavi.map((k) => [k, o[k]]));
const seme = {
  'schede/tirata': { nome: 'Tirata', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T00:00:00.000Z' },
  'schede/tirata/revisioni/r1': { ...CONTENUTO_VALIDO, validaDal: '2026-10-01', autore: 'u-trainer', salvataIl: '2026-10-01T00:00:00.000Z' },
  'settimane/w1': { numero: 1, validaDal: '2026-10-26', giorni: { ...G, ven: 'tirata' }, autore: 'u-trainer', creataIl: '2026-10-25T00:00:00.000Z' },
};

async function setup(opz = {}) {
  const fake = creaFakeClaude({ seme, ...opz });
  const db = await fake.use('db');
  const store = creaStore({ db, autoreId: 'u-cliente', adesso });
  return { fake, db, store };
}
const primiDati = (store) => new Promise((ok, ko) => { const off = store.osserva((d) => { off(); ok(d); }, ko); });

test('salvaScheda: nuova scheda, conflitto, forza', async () => {
  const { fake, store } = await setup();
  const r = await store.salvaScheda({ schedaId: null, nome: 'Spinta A', tipo: 'palestra', contenuto: CONTENUTO_VALIDO, revisioneAttesa: null });
  assert.equal(r.esito, 'ok');
  const d = fake.dump();
  assert.equal(d[`schede/${r.schedaId}`].revisioneCorrente, r.revId);
  assert.equal(d[`schede/${r.schedaId}/revisioni/${r.revId}`].validaDal, '2026-11-04');
  assert.equal(d[`schede/${r.schedaId}/revisioni/${r.revId}`].autore, 'u-cliente');
  const argomenti = { schedaId: r.schedaId, nome: 'Spinta A', tipo: 'palestra', contenuto: CONTENUTO_VALIDO };
  const r2 = await store.salvaScheda({ ...argomenti, revisioneAttesa: 'vecchia' });
  assert.equal(r2.esito, 'conflitto');
  assert.equal(r2.revisione.autore, 'u-cliente');
  assert.equal((await store.salvaScheda({ ...argomenti, revisioneAttesa: 'vecchia', forza: true })).esito, 'ok');
  assert.equal((await store.salvaScheda({ ...argomenti, revisioneAttesa: fake.dump()[`schede/${r.schedaId}`].revisioneCorrente })).esito, 'ok');
});

test('salvaScheda: validazione', async () => {
  const { store } = await setup();
  await assert.rejects(store.salvaScheda({ schedaId: null, nome: ' ', tipo: 'palestra', contenuto: CONTENUTO_VALIDO, revisioneAttesa: null }), { codice: 'non_valido' });
});

test('numerazione settimane e piani', async () => {
  const { fake, store } = await setup({ seme: {} });
  await store.salvaSettimana({ giorni: G, validaDal: '2026-11-09' });
  await store.salvaSettimana({ giorni: G, validaDal: '2026-11-16' });
  assert.deepEqual(Object.entries(fake.dump()).filter(([p]) => p.startsWith('settimane/')).map(([, v]) => v.numero).sort(), [1, 2]);
  await store.salvaPiano({ indicazioni: 'x', pasti: [], validaDal: '2026-11-04' });
  const p = Object.entries(fake.dump()).filter(([k]) => k.startsWith('alimentazione/'));
  assert.equal(p.length, 1);
  assert.equal(p[0][1].numero, 1);
  assert.equal(p[0][1].autore, 'u-cliente');
});

test('eccezioni: sposta, imposta, annulla', async () => {
  const { fake, store } = await setup();
  await store.spostaGiorno('2026-11-06', '2026-11-05');
  assert.deepEqual(pick(fake.dump()['eccezioni/2026-11-05'], ['schedaId', 'origine']), { schedaId: 'tirata', origine: '2026-11-06' });
  assert.deepEqual(pick(fake.dump()['eccezioni/2026-11-06'], ['schedaId', 'origine']), { schedaId: null, origine: null });
  await store.impostaEccezione('2026-11-07', 'tirata');
  assert.equal(fake.dump()['eccezioni/2026-11-07'].autore, 'u-cliente');
  await store.annullaEccezione('2026-11-07');
  assert.equal(fake.dump()['eccezioni/2026-11-07'], undefined);
});

test('archiviaScheda', async () => {
  const { fake, store } = await setup();
  const r = await store.archiviaScheda('tirata');
  assert.equal(r.esito, 'in_uso');
  assert.ok(r.usi.length > 0);
  fake.dump();
  const lib = await setup({ seme: { ...seme, 'settimane/w1': { ...seme['settimane/w1'], giorni: G } } });
  assert.equal((await lib.store.archiviaScheda('tirata')).esito, 'ok');
  assert.equal(lib.fake.dump()['schede/tirata'].archiviata, true);
});

test('diario: merge', async () => {
  const { fake, store } = await setup();
  await store.aggiornaDiario('2026-11-04', { sensazione: 4 });
  await store.aggiornaDiario('2026-11-04', { nota: 'ok' });
  assert.partialDeepStrictEqual(fake.dump()['diario/2026-11-04'], { sensazione: 4, nota: 'ok' });
  assert.ok(fake.dump()['diario/2026-11-04'].aggiornatoIl);
});

test('utente senza id e permessi', async () => {
  const { db, fake } = await setup();
  const anonimo = creaStore({ db, autoreId: null, adesso });
  await assert.rejects(anonimo.aggiornaDiario('2026-11-04', { nota: 'x' }), { codice: 'senza_utente' });
  assert.equal(fake.dump()['diario/2026-11-04'], undefined);
  const lettore = creaFakeClaude({ puoScrivere: false });
  const storeLettore = creaStore({ db: await lettore.use('db'), autoreId: 'u-cliente', adesso });
  await assert.rejects(storeLettore.salvaSettimana({ giorni: G, validaDal: '2026-11-09' }), { code: 'invalid_argument' });
});

test('messaggi errore', () => {
  assert.equal(messaggioErrore({ code: 'invalid_argument' }), 'Puoi solo leggere: chiedi al proprietario di invitarti come Editor');
  assert.equal(messaggioErrore({ codice: 'senza_utente' }), 'Accedi a Claude per salvare.');
  assert.equal(messaggioErrore({ code: 'revoked' }), 'Accesso al pannello revocato.');
  assert.equal(messaggioErrore(new Error('x')), 'Salvataggio non riuscito. Riprova.');
  assert.equal(eRifiutoPermessi({ code: 'invalid_argument' }), true);
  assert.equal(eRifiutoPermessi(null), false);
});

test('validazione piano', async () => {
  const { store } = await setup();
  await assert.rejects(store.salvaPiano({ indicazioni: '', pasti: [{ nome: '', opzioni: [] }], validaDal: '2026-11-04' }), { codice: 'non_valido' });
});

test('osserva: prima emissione completa, poi aggiornamenti', async () => {
  const { store } = await setup();
  const dati = await primiDati(store);
  assert.ok(Array.isArray(dati.revisioni.tirata));
  assert.equal(dati.revisioni.tirata[0].id, 'r1');
  assert.equal(dati.schede.tirata.id, 'tirata');
  assert.equal(dati.settimane[0].id, 'w1');
  assert.deepEqual(dati.eccezioni, {});
  assert.deepEqual(dati.alimentazione, []);
  assert.deepEqual(dati.diario, {});
  const visti = [];
  const off = store.osserva((d) => visti.push(d), assert.fail);
  await new Promise((r) => setTimeout(r, 20));
  const n = visti.length;
  await store.salvaScheda({ schedaId: null, nome: 'Nuova', tipo: 'palestra', contenuto: CONTENUTO_VALIDO, revisioneAttesa: null });
  await new Promise((r) => setTimeout(r, 20));
  off();
  assert.ok(visti.length > n);
  const ultimo = visti.at(-1);
  assert.equal(Object.keys(ultimo.schede).length, 2);
  assert.ok(Object.values(ultimo.revisioni).every((a) => a.length >= 1));
});

test('scritture concorrenti sullo stesso documento sono serializzate', async () => {
  const { fake, store } = await setup();
  const d = '2026-11-10';
  await Promise.all([store.aggiornaDiario(d, { sensazione: 4 }), store.aggiornaDiario(d, { nota: 'ok' })]);
  assert.partialDeepStrictEqual(fake.dump()[`diario/${d}`], { sensazione: 4, nota: 'ok' });
  await Promise.all([store.impostaEccezione('2026-11-11', 'tirata'), store.impostaEccezione('2026-11-11', null)]);
  assert.equal(fake.dump()['eccezioni/2026-11-11'].schedaId, null);
});

test('una scrittura fallita non blocca la coda', async () => {
  const { db } = await setup();
  const ko = creaStore({ db, autoreId: 'u', adesso });
  const orig = db.doc.bind(db);
  let prima = true;
  const dbRotto = { ...db, collection: db.collection, doc: (p) => {
    const r = orig(p);
    if (prima && p.startsWith('diario/')) { prima = false; return { ...r, get: () => Promise.reject(new Error('boom')) }; }
    return r;
  } };
  const s = creaStore({ db: dbRotto, autoreId: 'u', adesso });
  const a = s.aggiornaDiario('2026-11-12', { nota: 'a' });
  const b = s.aggiornaDiario('2026-11-12', { nota: 'b' });
  await assert.rejects(a, /boom/);
  await b;
  assert.equal((await db.doc('diario/2026-11-12').get()).data().nota, 'b');
  void ko;
});
