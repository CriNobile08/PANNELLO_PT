// Client minimale della Google Health API: token OAuth, elenco con paginazione,
// roll-up giornaliero. Il `fetch` è iniettato; il modulo non stampa nulla e non
// mette mai token o segreti nei messaggi d'errore.

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const BASE = 'https://health.googleapis.com/v4/users/me/dataTypes';
const ATTESE_RITENTATIVO = [2000, 4000, 8000];
const TIPI_CON_PAGESIZE = new Set(['sleep', 'exercise']);
const VARIABILI = ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'GH_REFRESH_TOKEN'];

export class ErroreSync extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreSync';
    this.codice = codice;
  }
}

const attesaPredefinita = (ms) => new Promise((r) => setTimeout(r, ms));

function dataCivile(testo) {
  const [year, month, day] = testo.split('-').map(Number);
  return { date: { year, month, day } };
}

export function creaClient({ env, fetch, attendi = attesaPredefinita }) {
  let token = null;

  const segreti = () => [env.GH_CLIENT_SECRET, env.GH_REFRESH_TOKEN, token].filter(Boolean);
  const pulisci = (testo) => segreti().reduce((t, s) => t.split(s).join('***'), String(testo ?? ''));

  function verificaConfigurazione() {
    const mancanti = VARIABILI.filter((v) => !env?.[v]);
    if (mancanti.length) throw new ErroreSync('configurazione', `Variabili mancanti: ${mancanti.join(', ')}`);
  }

  // Esegue la richiesta con ritentativi su rete/429/5xx; restituisce la risposta (anche 4xx).
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
        throw new ErroreSync('rete', risposta ? `Google Health non disponibile (stato ${risposta.status})` : 'Rete non raggiungibile');
      }
      await attendi(ATTESE_RITENTATIVO[tentativo]);
    }
  }

  async function leggiJson(risposta) {
    try { return await risposta.json(); } catch { return {}; }
  }

  async function ottieniToken() {
    if (token) return token;
    verificaConfigurazione();
    const corpo = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GH_CLIENT_ID,
      client_secret: env.GH_CLIENT_SECRET,
      refresh_token: env.GH_REFRESH_TOKEN,
    }).toString();
    const r = await conTentativi(() => fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo,
    }));
    const dati = await leggiJson(r);
    if (r.ok && dati.access_token) {
      token = dati.access_token;
      return token;
    }
    if (dati.error === 'invalid_grant' || r.status === 401) {
      throw new ErroreSync('autorizzazione', 'Autorizzazione Google Health scaduta o revocata');
    }
    const errore = new Error(`Scambio del token rifiutato (stato ${r.status}${typeof dati.error === 'string' ? `: ${pulisci(dati.error)}` : ''})`);
    errore.status = r.status;
    throw errore;
  }

  async function chiama(url, opzioni = {}) {
    const t = await ottieniToken();
    const r = await conTentativi(() => fetch(url, {
      ...opzioni,
      headers: { ...opzioni.headers, Authorization: `Bearer ${t}` },
    }));
    if (r.ok) return leggiJson(r);
    if (r.status === 401) throw new ErroreSync('autorizzazione', 'Autorizzazione Google Health rifiutata (401)');
    const dati = await leggiJson(r);
    const dettaglio = dati?.error?.message ? `: ${pulisci(dati.error.message)}` : '';
    const errore = new Error(`Google Health API ha risposto ${r.status}${dettaglio}`);
    errore.status = r.status;
    throw errore;
  }

  async function elenca(tipo, filtro, pageSize) {
    const dimensione = pageSize ?? (TIPI_CON_PAGESIZE.has(tipo) ? 25 : null);
    const punti = [];
    let pagina = null;
    do {
      const parametri = new URLSearchParams({ filter: filtro });
      if (dimensione) parametri.set('pageSize', String(dimensione));
      if (pagina) parametri.set('pageToken', pagina);
      const dati = await chiama(`${BASE}/${tipo}/dataPoints?${parametri}`);
      punti.push(...(dati.dataPoints ?? []));
      pagina = dati.nextPageToken || null;
    } while (pagina);
    return punti;
  }

  async function rollupGiornaliero(tipo, dal, alEscluso) {
    const punti = [];
    let pagina = null;
    do {
      const corpo = { range: { start: dataCivile(dal), end: dataCivile(alEscluso) } };
      if (pagina) corpo.pageToken = pagina;
      const dati = await chiama(`${BASE}/${tipo}/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      punti.push(...(dati.rollupDataPoints ?? []));
      pagina = dati.nextPageToken || null;
    } while (pagina);
    return punti;
  }

  return { elenca, rollupGiornaliero };
}
