// Avvio: capability, ruolo, sottoscrizioni db. Nessun ricaricamento automatico (§8).
import { render } from 'preact';
import { html } from './ui/html.js';
import { App, Caricamento, ErroreCaricamento } from './ui/app.js';
import { creaStore } from './data/store.js';
import { messaggioErrore, eRifiutoPermessi } from './data/errori.js';

const ATTESA_MS = 10_000;
const radice = document.getElementById('app');

let tentativo = 0;
let chiudiIscrizione = null;
let timer = null;
let stato = null;

/** Esegue `fn` (sincrona o asincrona) in try/catch; in caso di errore restituisce `ripiego`. */
async function prova(fn, ripiego) {
  try {
    return await fn();
  } catch {
    return ripiego;
  }
}

function disegna() {
  if (!stato || stato.fase === 'caricamento') render(html`<${Caricamento} />`, radice);
  else if (stato.fase === 'errore') render(html`<${ErroreCaricamento} onRiprova=${avvia} />`, radice);
  else {
    render(html`<${App}
      dati=${stato.dati} store=${stato.store} utenteId=${stato.utenteId} isOwner=${stato.isOwner}
      puoScrivere=${stato.puoScrivere} avviaAttivita=${stato.avviaAttivita} asset=${stato.asset} segnalaRifiuto=${stato.segnalaRifiuto} nomi=${stato.nomi} />`, radice);
  }
}

function pulisci() {
  clearTimeout(timer);
  timer = null;
  chiudiIscrizione?.();
  chiudiIscrizione = null;
}

/** Cache dei nomi: nomi(ids) è sincrono; gli id mancanti si chiedono a user.profiles e poi si ridisegna. */
function creaNomi(user, mioTentativo) {
  const cache = new Map();
  const inCorso = new Set();
  const nomeDa = (p) => (p && (p.name ?? p.displayName ?? p.display_name)) || '';

  function carica(ids) {
    ids.forEach((i) => inCorso.add(i));
    prova(() => user.profiles(ids), null).then((profili) => {
      const trovati = {};
      if (Array.isArray(profili)) profili.forEach((p) => { if (p?.id) trovati[p.id] = nomeDa(p); });
      else if (profili && typeof profili === 'object') Object.entries(profili).forEach(([k, p]) => { trovati[k] = nomeDa(p); });
      ids.forEach((i) => { inCorso.delete(i); cache.set(i, trovati[i] || 'Qualcuno'); });
      if (mioTentativo === tentativo) disegna();
    });
  }

  return function nomi(ids) {
    const risultato = {};
    const mancanti = [];
    for (const id of new Set(ids ?? [])) {
      if (id === null || id === undefined || id === '') continue;
      if (cache.has(id)) risultato[id] = cache.get(id);
      else {
        risultato[id] = '…';
        if (!inCorso.has(id)) mancanti.push(id);
      }
    }
    if (mancanti.length) {
      if (user?.profiles) carica(mancanti);
      else mancanti.forEach((i) => { cache.set(i, 'Qualcuno'); risultato[i] = 'Qualcuno'; });
    }
    return risultato;
  };
}

async function avvia() {
  pulisci();
  const mio = ++tentativo;
  const attuale = () => mio === tentativo;
  stato = { fase: 'caricamento' };
  disegna();

  const fallisci = () => {
    if (!attuale() || stato.fase === 'pronto') return;
    tentativo++; // il tentativo è chiuso: risposte tardive ignorate, l'errore resta fino a "Riprova"
    pulisci();
    stato = { fase: 'errore' };
    disegna();
  };
  timer = setTimeout(fallisci, ATTESA_MS);

  const claude = window.claude;
  if (!claude?.use) return fallisci();

  const [db, user, mcp, assets] = await Promise.all([
    prova(() => claude.use('db'), null),
    prova(() => claude.use('user'), null),
    prova(() => claude.use('mcp'), null),
    prova(() => claude.use('assets'), null),
  ]);
  if (!attuale()) return;
  if (!db) return fallisci();

  const [utenteId, isOwner, puo] = await Promise.all([
    prova(() => user?.id() ?? null, null),
    prova(() => user?.isOwner() ?? false, false),
    prova(() => user?.can('data.write') ?? null, null),
  ]);
  if (!attuale()) return;

  const store = creaStore({ db, autoreId: utenteId ?? null });
  const segnalaRifiuto = (e) => {
    if (eRifiutoPermessi(e) && attuale() && stato.puoScrivere) {
      stato = { ...stato, puoScrivere: false };
      disegna();
    }
    return messaggioErrore(e);
  };
  const base = {
    store, utenteId: utenteId ?? null, isOwner: isOwner === true,
    puoScrivere: puo !== false, segnalaRifiuto,
    // Avvia l'attività di sincronizzazione; un rifiuto di callTool si propaga a chi chiama.
    avviaAttivita: isOwner === true && mcp
      ? (triggerId) => mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id: triggerId }, { cache: false })
      : null, nomi: creaNomi(user, mio),
    // GPX originale come asset (spec §5.3): si conserva solo l'id. Il tipo `application/gpx+xml` non è
    // accettato dallo store degli asset, il GPX (testo UTF-8) si carica come `text/plain`.
    asset: assets
      ? {
        carica: async (file) => ({ id: (await assets.upload(file, { type: 'text/plain' })).id }),
        elimina: async (id) => { await assets.delete(id); },
      }
      : null,
  };

  chiudiIscrizione = store.osserva(
    (dati) => {
      if (!attuale()) return;
      clearTimeout(timer);
      stato = stato.fase === 'pronto' ? { ...stato, dati } : { ...base, fase: 'pronto', dati };
      disegna();
    },
    (e) => {
      // Prima del primo snapshot l'errore equivale a un caricamento fallito; dopo, i dati restano quelli già mostrati.
      if (stato.fase !== 'pronto') fallisci();
      else console.warn('Aggiornamento dati non riuscito', e);
    },
  );
}

avvia();
