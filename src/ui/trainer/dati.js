import { html, useState, useEffect, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Campo, SelettoreData, Vuoto } from '../componenti.js';
import { lunediDi, aggiungiGiorni, giorniDellaSettimana, formatoData } from '../../logic/date.js';
import { percentualeSonno, minutiPisolini, recupero, OBIETTIVO_SONNO_PREDEFINITO } from '../../logic/indici.js';
import { unisciSessioni } from '../../logic/sessioni.js';
import { numeroDaInput } from '../../logic/validazione.js';
import { testoDurata } from '../cliente/sessioni.js';
import { TIPI } from '../cliente/tipi.js';
import { numero, migliaia } from '../formato.js';

const ASSENTE = '—';
const MSG_OBIETTIVO = "L'obiettivo deve essere tra 3 h e 12 h";
const QUERY_DESKTOP = '(min-width: 900px)';
const RIGHE = ['Sonno', 'Pisolini', 'FC a riposo', 'HRV', 'Recupero', 'Passi', 'Sessioni'];

/** Testo dell'indice di recupero: numero, "In calibrazione" o "—". */
export function testoIndice(rec) {
  return rec.stato === 'ok' ? String(rec.indice) : rec.stato === 'calibrazione' ? 'In calibrazione' : ASSENTE;
}

/** Valori (testo) delle sette righe per un giorno, nell'ordine di RIGHE. */
function valoriGiorno(dati, data, obiettivo, sessioniUnite) {
  const doc = dati.salute?.[data];
  const sonno = doc?.sonno?.minutiAddormentato;
  const perc = percentualeSonno(doc, obiettivo);
  const pisolini = minutiPisolini(doc);
  const delGiorno = sessioniUnite.filter((s) => s.data === data);
  const tipi = [...new Set(delGiorno.map((s) => TIPI[s.tipo] ?? TIPI.altro))];
  return [
    numero(sonno) ? `${testoDurata(sonno)}${perc !== null ? ` · ${perc}%` : ''}` : ASSENTE,
    pisolini > 0 ? `${pisolini} min` : ASSENTE,
    numero(doc?.fcRiposo) ? `${Math.round(doc.fcRiposo)} bpm` : ASSENTE,
    numero(doc?.hrv?.rmssd) ? `${Math.round(doc.hrv.rmssd)} ms` : ASSENTE,
    testoIndice(recupero(dati.salute, data)),
    numero(doc?.passi) ? migliaia(doc.passi) : ASSENTE,
    delGiorno.length > 0 ? `${delGiorno.length} · ${tipi.join(', ')}` : ASSENTE,
  ];
}

function useDesktop() {
  const leggi = () => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY_DESKTOP).matches : false);
  const [desktop, setDesktop] = useState(leggi);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(QUERY_DESKTOP);
    const cambia = () => setDesktop(mq.matches);
    mq.addEventListener?.('change', cambia);
    return () => mq.removeEventListener?.('change', cambia);
  }, []);
  return desktop;
}

function ObiettivoSonno() {
  const { dati, store, puoScrivere, segnalaRifiuto } = useContext(Contesto);
  const minuti = dati.impostazioni?.obiettivi?.sonnoMinuti ?? OBIETTIVO_SONNO_PREDEFINITO;
  const [ore, setOre] = useState(String(Math.floor(minuti / 60)));
  const [min, setMin] = useState(String(minuti % 60));
  const [errore, setErrore] = useState(null);
  const [salvato, setSalvato] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  async function salva() {
    setErrore(null);
    setSalvato(false);
    const h = numeroDaInput(ore);
    const m = numeroDaInput(min);
    setInCorso(true);
    try {
      await store.salvaObiettivi({ sonnoMinuti: h === null || m === null ? NaN : h * 60 + m });
      setSalvato(true);
    } catch (e) {
      setErrore(e?.codice === 'non_valido' ? MSG_OBIETTIVO : segnalaRifiuto(e));
    } finally {
      setInCorso(false);
    }
  }

  return html`
    <section class="card obiettivo-sonno" aria-label="Obiettivo sonno">
      <h2 class="titolo-blocco">Obiettivo sonno</h2>
      <div class="obiettivo-campi">
        <${Campo} etichetta="Ore">
          <input type="text" inputmode="numeric" value=${ore} onInput=${(e) => setOre(e.target.value)} />
        </${Campo}>
        <${Campo} etichetta="Minuti">
          <input type="text" inputmode="numeric" value=${min} onInput=${(e) => setMin(e.target.value)} />
        </${Campo}>
        <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso} onClick=${salva}>Salva</button>
      </div>
      ${errore && html`<p class="errore-scrittura" role="alert">${errore}</p>`}
      ${salvato && html`<p class="secondario" role="status">Obiettivo salvato</p>`}
    </section>`;
}

export function SezioneDatiCliente() {
  const { dati, oggi } = useContext(Contesto);
  const [lunedi, setLunedi] = useState(() => lunediDi(oggi));
  const desktop = useDesktop();
  const obiettivo = dati.impostazioni?.obiettivi?.sonnoMinuti ?? OBIETTIVO_SONNO_PREDEFINITO;
  const giorni = giorniDellaSettimana(lunedi);
  const unite = unisciSessioni(dati.sessioni ?? []);
  const colonne = giorni.map((g) => valoriGiorno(dati, g, obiettivo, unite));
  const vuota = colonne.every((c) => c.every((v) => v === ASSENTE));
  const etichetta = (l) => {
    const intervallo = `${formatoData(l)} – ${formatoData(aggiungiGiorni(l, 6))}`;
    return l === lunediDi(oggi) ? `Questa settimana · ${intervallo}` : intervallo;
  };

  let corpo;
  if (vuota) corpo = html`<${Vuoto} testo="Nessun dato" />`;
  else if (desktop) {
    corpo = html`
      <div class="card tabella-dati-contenitore">
        <table class="tabella-dati">
          <thead>
            <tr><th scope="col"><span class="visivamente-nascosto">Dato</span></th>
              ${giorni.map((g) => html`<th scope="col" key=${g}>${formatoData(g)}</th>`)}</tr>
          </thead>
          <tbody>
            ${RIGHE.map((nome, r) => html`
              <tr key=${nome}>
                <th scope="row">${nome}</th>
                ${colonne.map((c, i) => html`<td key=${giorni[i]}>${c[r]}</td>`)}
              </tr>`)}
          </tbody>
        </table>
      </div>`;
  } else {
    corpo = html`
      <div class="giorni-dati">
        ${giorni.map((g, i) => html`
          <article class="card" key=${g} aria-label=${formatoData(g)}>
            <h3 class="titolo-blocco">${formatoData(g)}</h3>
            <dl class="dettaglio-righe">
              ${RIGHE.map((nome, r) => html`
                <div class="dettaglio-riga" key=${nome}><dt class="secondario">${nome}</dt><dd>${colonne[i][r]}</dd></div>`)}
            </dl>
          </article>`)}
      </div>`;
  }

  return html`
    <section class="sezione dati-cliente">
      <h1 class="titolo-sezione">Dati del cliente</h1>
      <${SelettoreData} data=${lunedi} passo=${7} formato=${etichetta} onCambia=${setLunedi} />
      ${corpo}
      <${ObiettivoSonno} />
    </section>`;
}
