// Client minimale dell'API Hevy: eventi degli allenamenti e catalogo degli
// esercizi, seguendo le pagine. `fetch` ed `env` sono iniettati; il modulo non
// stampa nulla e non mette mai la chiave nei messaggi d'errore.
import { ErroreSync } from '../errore.js';

const BASE = 'https://api.hevyapp.com/v1';
const ATTESE_RITENTATIVO = [2000, 4000, 8000];

const attesaPredefinita = (ms) => new Promise((r) => setTimeout(r, ms));

export function creaClientHevy({ env, fetch, attendi = attesaPredefinita }) {
  const chiave = env?.HEVY_API_KEY;
  const pulisci = (testo) => (chiave ? String(testo ?? '').split(chiave).join('***') : String(testo ?? ''));

  // Ritenta rete/429/5xx; restituisce la risposta (anche 4xx).
  async function conTentativi(fai) {
    for (let tentativo = 0; ; tentativo++) {
      let risposta = null;
      try {
        risposta = await fai();
      } catch {
        risposta = null;
      }
      if (risposta && risposta.status !== 429 && risposta.status < 500) return risposta;
      if (tentativo >= ATTESE_RITENTATIVO.length) {
        throw new ErroreSync('rete', risposta ? `Hevy non disponibile (stato ${risposta.status})` : 'Rete non raggiungibile');
      }
      await attendi(ATTESE_RITENTATIVO[tentativo]);
    }
  }

  async function leggiJson(r) {
    try { return await r.json(); } catch { return {}; }
  }

  async function chiama(percorso, parametri) {
    if (!chiave) throw new ErroreSync('configurazione', 'Variabile mancante: HEVY_API_KEY');
    const url = `${BASE}${percorso}?${new URLSearchParams(parametri)}`;
    const r = await conTentativi(() => fetch(url, { headers: { 'api-key': chiave, accept: 'application/json' } }));
    if (r.ok) return leggiJson(r);
    if (r.status === 401 || r.status === 403) throw new ErroreSync('autorizzazione', `Hevy ha rifiutato la chiave (${r.status})`);
    const dati = await leggiJson(r);
    const dettaglio = typeof dati?.error === 'string' ? `: ${pulisci(dati.error)}` : '';
    const errore = new Error(`Hevy API ha risposto ${r.status}${dettaglio}`);
    errore.status = r.status;
    throw errore;
  }

  async function tutteLePagine(percorso, parametri, estrai) {
    const elementi = [];
    for (let pagina = 1; ; pagina++) {
      const dati = await chiama(percorso, { ...parametri, page: String(pagina) });
      elementi.push(...(estrai(dati) ?? []));
      if (!(pagina < Number(dati.page_count))) return elementi;
    }
  }

  return {
    elencaEventi: (since) => tutteLePagine('/workouts/events', { pageSize: '10', since }, (d) => d.events ?? d.workouts),
    elencaTemplate: () => tutteLePagine('/exercise_templates', { pageSize: '100' }, (d) => d.exercise_templates),
  };
}
