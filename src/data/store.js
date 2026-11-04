import { oggiRoma } from '../logic/date.js';
import { prossimoNumero } from '../logic/versioni.js';
import { risolviGiorno, eccezioniSpostamento, usiScheda } from '../logic/risoluzione.js';
import { validaScheda, validaPiano } from '../logic/validazione.js';

export const DIARIO_VUOTO = { riscaldamentoFatti: [], stretchingFatti: [], principaleFatto: false, sensazione: null, nota: '', sessioniCollegate: [], rilevamentoIgnorato: false };
const COLLEZIONI = ['schede', 'settimane', 'eccezioni', 'alimentazione', 'diario', 'salute', 'sessioni', 'impostazioni', 'sync', 'tracciati', 'hevy'];
const CHIAVI_SISTEMA = ['id', 'validaDal', 'autore', 'salvataIl'];

const conId = (d) => ({ ...d.data(), id: d.id });
const perData = (docs) => Object.fromEntries(docs.map((d) => [d.id, d.data()]));
const perIdMappa = (docs) => Object.fromEntries(docs.map((d) => [d.id, conId(d)]));
const elenco = (docs) => docs.map(conId);

// Nota: se un metodo di scrittura viene chiamato prima del primo snapshot di osserva(),
// legge ciò che gli serve con una lettura una tantum (non fallisce).
export function creaStore({ db, autoreId, adesso = () => new Date() }) {
  let ultimi = null;

  const ora = () => adesso().toISOString();

  // Serializza le scritture per percorso di documento; un errore non blocca la coda.
  const code = new Map();
  function serializza(path, fn) {
    const prec = code.get(path) ?? Promise.resolve();
    const corrente = prec.then(fn, fn);
    const coda = corrente.then(() => {}, () => {});
    code.set(path, coda);
    coda.then(() => { if (code.get(path) === coda) code.delete(path); });
    return corrente;
  }

  function autore() {
    if (autoreId === null || autoreId === undefined) {
      return Promise.reject({ codice: 'senza_utente' });
    }
    return Promise.resolve(autoreId);
  }

  async function leggiCollezione(nome) {
    return (await db.collection(nome).get()).docs;
  }

  async function correnti() {
    if (ultimi) return ultimi;
    const [settimane, eccezioni] = await Promise.all([leggiCollezione('settimane'), leggiCollezione('eccezioni')]);
    return { settimane: elenco(settimane), eccezioni: perData(eccezioni) };
  }

  /**
   * Sottoscrizioni: esattamente 11, una per collezione di primo livello, qualunque sia il numero di schede
   * (il db ammette al massimo 64 sottoscrizioni attive per vista).
   * Le revisioni (`schede/{id}/revisioni/{revId}`, §5.2) NON hanno un listener: si leggono con `get()`
   * una tantum. Ogni salvataggio aggiunge la revisione e POI aggiorna `revisioneCorrente` sul documento
   * della scheda, quindi lo snapshot di `schede` segnala ogni nuova revisione: quando `revisioneCorrente`
   * di una scheda cambia rispetto all'ultima lettura, le sue revisioni si rileggono. Le revisioni sono
   * immutabili, quindi nient'altro può cambiarle. Le letture sono al massimo LETTURE_PARALLELE alla volta.
   * Mentre una lettura è in corso non si emette (Dati coerenti: la revisione corrente è sempre nell'elenco).
   * Una lettura fallita non blocca: la scheda resta con le revisioni già note (o []), si emette e
   * l'errore va a onErrore; si riprova al prossimo snapshot di `schede`.
   */
  function osserva(onDati, onErrore) {
    const LETTURE_PARALLELE = 4;
    const caricate = new Set();
    const parziale = { schede: {}, settimane: [], eccezioni: {}, alimentazione: [], diario: {}, salute: {}, sessioni: [], impostazioni: {}, sync: {}, tracciati: {}, hevy: {} };
    const revisioni = {};
    const statoRev = new Map(); // schedaId -> { letta: revisioneCorrente dell'ultima lettura riuscita | undefined, richiesta: chiave in lettura | undefined }
    const coda = [];
    let inLettura = 0;
    let chiuso = false;
    let emesso = false;
    const rinviati = [];

    const inAttesa = () => [...statoRev.values()].some((s) => s.richiesta !== undefined);
    const pronto = () => caricate.size === COLLEZIONI.length && !inAttesa();
    const emetti = () => {
      if (chiuso || !pronto()) return;
      ultimi = {
        schede: parziale.schede,
        revisioni: Object.fromEntries(Object.keys(parziale.schede).map((id) => [id, revisioni[id] ?? []])),
        settimane: parziale.settimane,
        eccezioni: parziale.eccezioni,
        alimentazione: parziale.alimentazione,
        diario: parziale.diario,
        salute: parziale.salute,
        sessioni: parziale.sessioni,
        impostazioni: parziale.impostazioni,
        sync: parziale.sync,
        tracciati: parziale.tracciati,
        hevy: parziale.hevy, // { catalogo } se la sincronizzazione Hevy l'ha già scritto
      };
      onDati(ultimi);
      emesso = true;
      // errori di lettura delle revisioni trattenuti prima della prima emissione: ora che i dati ci sono, si segnalano
      for (const e of rinviati.splice(0)) errore(e);
    };
    const errore = (e) => { if (!chiuso) onErrore?.(e); };
    // Una lettura di revisioni fallita non è un caricamento fallito: prima della prima emissione l'errore
    // si trattiene (chi ascolta tratta un errore prima dei dati come "Impossibile caricare i dati").
    const erroreRevisioni = (e) => { if (emesso) errore(e); else rinviati.push(e); };

    const prossimaLettura = () => {
      while (!chiuso && inLettura < LETTURE_PARALLELE && coda.length) {
        const { id, chiave } = coda.shift();
        const stato = statoRev.get(id);
        if (!stato || stato.richiesta !== chiave) continue;
        inLettura++;
        const fine = () => { inLettura--; prossimaLettura(); };
        db.collection(`schede/${id}/revisioni`).get().then((s) => {
          fine();
          if (chiuso || statoRev.get(id) !== stato || stato.richiesta !== chiave) return;
          revisioni[id] = elenco(s.docs);
          stato.richiesta = undefined;
          // lettura in ritardo rispetto allo snapshot (revisione corrente non ancora visibile): si riprova poco dopo
          const manca = chiave !== null && !revisioni[id].some((r) => r.id === chiave);
          if (stato.tentativiDi !== chiave) { stato.tentativiDi = chiave; stato.tentativi = 0; }
          if (manca && ++stato.tentativi < 3) setTimeout(() => { if (!chiuso) sincronizzaRevisioni(); }, 1000);
          else stato.letta = chiave;
          emetti();
        }, (e) => {
          fine();
          if (chiuso || statoRev.get(id) !== stato || stato.richiesta !== chiave) return;
          stato.richiesta = undefined; // `letta` invariata: si riprova al prossimo snapshot di schede
          emetti();
          erroreRevisioni(e);
        });
      }
    };

    const sincronizzaRevisioni = () => {
      for (const [id, s] of Object.entries(parziale.schede)) {
        const chiave = s.revisioneCorrente ?? null;
        let stato = statoRev.get(id);
        if (!stato) { stato = { letta: undefined, richiesta: undefined }; statoRev.set(id, stato); }
        if (stato.letta === chiave || stato.richiesta === chiave) continue;
        stato.richiesta = chiave;
        coda.push({ id, chiave });
      }
      for (const id of [...statoRev.keys()]) {
        if (id in parziale.schede) continue;
        statoRev.delete(id);
        delete revisioni[id];
      }
      prossimaLettura();
    };

    const conversioni = {
      schede: (d) => { parziale.schede = perIdMappa(d); },
      settimane: (d) => { parziale.settimane = elenco(d); },
      eccezioni: (d) => { parziale.eccezioni = perData(d); },
      alimentazione: (d) => { parziale.alimentazione = elenco(d); },
      diario: (d) => { parziale.diario = perData(d); },
      salute: (d) => { parziale.salute = perData(d); },
      sessioni: (d) => { parziale.sessioni = elenco(d); },
      impostazioni: (d) => { parziale.impostazioni = perData(d); },
      sync: (d) => { parziale.sync = perData(d); },
      tracciati: (d) => { parziale.tracciati = perData(d); },
      hevy: (d) => { parziale.hevy = perData(d); },
    };
    const offs = COLLEZIONI.map((nome) =>
      db.collection(nome).onSnapshot((s) => {
        conversioni[nome](s.docs);
        caricate.add(nome);
        if (nome === 'schede') sincronizzaRevisioni();
        emetti();
      }, errore));

    return () => {
      chiuso = true;
      offs.forEach((o) => o());
      coda.length = 0;
      statoRev.clear();
    };
  }

  function salvaScheda(args) {
    const { schedaId } = args;
    if (schedaId === null || schedaId === undefined) return salvaSchedaInterno(args);
    return serializza(`schede/${schedaId}`, () => salvaSchedaInterno(args));
  }

  async function salvaSchedaInterno({ schedaId, nome, tipo, contenuto, revisioneAttesa, forza = false }) {
    const utente = await autore();
    const errori = validaScheda({ nome, tipo }, contenuto);
    if (errori.length) throw { codice: 'non_valido', errori };

    let id = schedaId;
    if (id === null || id === undefined) {
      const ref = db.collection('schede').doc();
      id = ref.id;
      await ref.set({ nome, tipo, archiviata: false, revisioneCorrente: null, creataDa: utente, creataIl: ora() });
    } else {
      const snap = await db.doc(`schede/${id}`).get();
      const corrente = snap.exists ? snap.data().revisioneCorrente ?? null : null;
      if (corrente !== (revisioneAttesa ?? null) && !forza) {
        const rev = corrente ? await db.doc(`schede/${id}/revisioni/${corrente}`).get() : null;
        return { esito: 'conflitto', revisione: rev?.exists ? rev.data() : null };
      }
    }

    const campi = Object.fromEntries(Object.entries(contenuto).filter(([k]) => !CHIAVI_SISTEMA.includes(k)));
    const rif = await db.collection(`schede/${id}/revisioni`).add({
      ...campi, validaDal: oggiRoma(adesso()), autore: utente, salvataIl: ora(),
    });
    await db.doc(`schede/${id}`).update({ nome, tipo, revisioneCorrente: rif.id });
    return { esito: 'ok', schedaId: id, revId: rif.id };
  }

  async function archiviaScheda(schedaId) {
    await autore();
    const dati = await correnti();
    const usi = usiScheda(schedaId, dati, oggiRoma(adesso()));
    if (usi.length) return { esito: 'in_uso', usi };
    await serializza(`schede/${schedaId}`, () => db.doc(`schede/${schedaId}`).update({ archiviata: true }));
    return { esito: 'ok' };
  }

  async function salvaSettimana({ giorni, validaDal }) {
    const utente = await autore();
    const { settimane } = await correnti();
    const rif = await db.collection('settimane').add({
      numero: prossimoNumero(settimane), validaDal, giorni, autore: utente, creataIl: ora(),
    });
    return rif.id;
  }

  async function impostaEccezione(data, schedaId) {
    const utente = await autore();
    await serializza(`eccezioni/${data}`, () => db.doc(`eccezioni/${data}`).set({ schedaId, origine: null, autore: utente, creataIl: ora() }));
  }

  async function spostaGiorno(da, a) {
    const utente = await autore();
    const dati = await correnti();
    const { schedaId } = risolviGiorno(da, dati);
    for (const { data, doc } of eccezioniSpostamento(da, a, schedaId)) {
      await serializza(`eccezioni/${data}`, () => db.doc(`eccezioni/${data}`).set({ ...doc, autore: utente, creataIl: ora() }));
    }
  }

  async function annullaEccezione(data) {
    await autore();
    await serializza(`eccezioni/${data}`, () => db.doc(`eccezioni/${data}`).delete());
  }

  async function salvaPiano({ indicazioni, pasti, validaDal }) {
    const utente = await autore();
    const errori = validaPiano({ indicazioni, pasti });
    if (errori.length) throw { codice: 'non_valido', errori };
    const piani = ultimi ? ultimi.alimentazione : elenco(await leggiCollezione('alimentazione'));
    const rif = await db.collection('alimentazione').add({
      numero: prossimoNumero(piani), validaDal, indicazioni, pasti, autore: utente, creataIl: ora(),
    });
    return rif.id;
  }

  /**
   * `modifiche`: oggetto da unire, oppure funzione `(attuale) => modifiche` applicata ai dati correnti
   * (con i valori predefiniti del §5.6 se il documento non esiste) dentro la sezione serializzata.
   */
  async function aggiornaDiario(data, modifiche) {
    await autore();
    const path = `diario/${data}`;
    await serializza(path, async () => {
      const rif = db.doc(path);
      const snap = await rif.get();
      const attuale = snap.exists ? { ...DIARIO_VUOTO, ...snap.data() } : { ...DIARIO_VUOTO };
      const dati = { ...(typeof modifiche === 'function' ? modifiche(attuale) : modifiche), aggiornatoIl: ora() };
      if (snap.exists) await rif.update(dati);
      else await rif.set({ ...DIARIO_VUOTO, ...dati });
    });
  }

  async function salvaObiettivi({ sonnoMinuti }) {
    const utente = await autore();
    if (!Number.isInteger(sonnoMinuti) || sonnoMinuti < 180 || sonnoMinuti > 720) throw { codice: 'non_valido' };
    await serializza('impostazioni/obiettivi', () =>
      db.doc('impostazioni/obiettivi').set({ sonnoMinuti, aggiornatoIl: ora(), autore: utente }));
  }

  const idParteValido = (id) => typeof id === 'string' && id !== '' && !id.includes('/');

  /** Scrive `tracciati/{idParte}` (spec §5.2): `doc` più idParte, caricatoIl e autore. */
  async function salvaTracciato({ idParte, doc }) {
    const utente = await autore();
    if (!idParteValido(idParte)) throw { codice: 'non_valido' };
    const path = `tracciati/${idParte}`;
    await serializza(path, () => db.doc(path).set({ ...doc, idParte, caricatoIl: ora(), autore: utente }));
  }

  async function rimuoviTracciato(idParte) {
    await autore();
    if (!idParteValido(idParte)) throw { codice: 'non_valido' };
    const path = `tracciati/${idParte}`;
    await serializza(path, () => db.doc(path).delete());
  }

  return { osserva, salvaTracciato, rimuoviTracciato, salvaScheda, archiviaScheda, salvaSettimana, impostaEccezione, spostaGiorno, annullaEccezione, salvaPiano, aggiornaDiario, salvaObiettivi };
}
