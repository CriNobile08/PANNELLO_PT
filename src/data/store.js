import { oggiRoma } from '../logic/date.js';
import { prossimoNumero } from '../logic/versioni.js';
import { risolviGiorno, eccezioniSpostamento, usiScheda } from '../logic/risoluzione.js';
import { validaScheda, validaPiano } from '../logic/validazione.js';

const COLLEZIONI = ['schede', 'settimane', 'eccezioni', 'alimentazione', 'diario'];
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

  function leggiCollezione(nome) {
    return new Promise((ok, ko) => {
      let off = null;
      let fatto = false;
      off = db.collection(nome).onSnapshot((s) => {
        if (fatto) return;
        fatto = true;
        queueMicrotask(() => off?.());
        ok(s.docs);
      }, ko);
    });
  }

  async function correnti() {
    if (ultimi) return ultimi;
    const [settimane, eccezioni] = await Promise.all([leggiCollezione('settimane'), leggiCollezione('eccezioni')]);
    return { settimane: elenco(settimane), eccezioni: perData(eccezioni) };
  }

  function osserva(onDati, onErrore) {
    const caricate = new Set();
    const parziale = { schede: {}, settimane: [], eccezioni: {}, alimentazione: [], diario: {} };
    const revisioni = {};
    const subRev = new Map(); // schedaId -> { off, caricata }
    let chiuso = false;

    const pronto = () =>
      caricate.size === COLLEZIONI.length && [...subRev.values()].every((s) => s.caricata);
    const emetti = () => {
      if (chiuso || !pronto()) return;
      ultimi = {
        schede: parziale.schede,
        revisioni: Object.fromEntries(Object.keys(parziale.schede).map((id) => [id, revisioni[id] ?? []])),
        settimane: parziale.settimane,
        eccezioni: parziale.eccezioni,
        alimentazione: parziale.alimentazione,
        diario: parziale.diario,
      };
      onDati(ultimi);
    };
    const errore = (e) => { if (!chiuso) onErrore?.(e); };

    const sincronizzaRevisioni = () => {
      for (const id of Object.keys(parziale.schede)) {
        if (subRev.has(id)) continue;
        const stato = { caricata: false, off: null };
        subRev.set(id, stato);
        stato.off = db.collection(`schede/${id}/revisioni`).onSnapshot((s) => {
          revisioni[id] = elenco(s.docs);
          stato.caricata = true;
          emetti();
        }, errore);
      }
      for (const [id, stato] of [...subRev]) {
        if (id in parziale.schede) continue;
        stato.off?.();
        subRev.delete(id);
        delete revisioni[id];
      }
    };

    const conversioni = {
      schede: (d) => { parziale.schede = perIdMappa(d); },
      settimane: (d) => { parziale.settimane = elenco(d); },
      eccezioni: (d) => { parziale.eccezioni = perData(d); },
      alimentazione: (d) => { parziale.alimentazione = elenco(d); },
      diario: (d) => { parziale.diario = perData(d); },
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
      subRev.forEach((s) => s.off?.());
      subRev.clear();
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

  async function aggiornaDiario(data, modifiche) {
    await autore();
    const path = `diario/${data}`;
    await serializza(path, async () => {
      const rif = db.doc(path);
      const snap = await rif.get();
      const dati = { ...modifiche, aggiornatoIl: ora() };
      if (snap.exists) await rif.update(dati);
      else {
        await rif.set({
          riscaldamentoFatti: [], stretchingFatti: [], principaleFatto: false, sensazione: null, nota: '',
          ...dati,
        });
      }
    });
  }

  return { osserva, salvaScheda, archiviaScheda, salvaSettimana, impostaEccezione, spostaGiorno, annullaEccezione, salvaPiano, aggiornaDiario };
}
