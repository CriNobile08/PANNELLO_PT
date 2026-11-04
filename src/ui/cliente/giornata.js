import { html, useState, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Campo, Vuoto } from '../componenti.js';
import { revisionePerGiorno } from '../../logic/versioni.js';
import { risolviGiorno } from '../../logic/risoluzione.js';
import { statoBlocchi } from '../../logic/completamento.js';
import { formatoDataLunga } from '../../logic/date.js';

export const TIPI = { palestra: 'Palestra', corsa: 'Corsa', trekking: 'Trekking', altro: 'Altro' };

/** Numero all'italiana: virgola decimale. */
export const testoNumero = (n) => String(n).replace('.', ',');

/** 150 → "2′30" */
export const testoRecupero = (sec) => `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, '0')}`;

/** Voce di diario + scheda risolta per una data. */
export function contestoGiorno(dati, data) {
  const giorno = risolviGiorno(data, dati);
  const scheda = giorno.schedaId ? dati.schede[giorno.schedaId] ?? null : null;
  const revisione = scheda ? revisionePerGiorno(dati.revisioni[giorno.schedaId] ?? [], data) : null;
  const voce = dati.diario[data] ?? null;
  return { giorno, scheda, revisione, voce, stato: statoBlocchi(revisione, voce) };
}

/**
 * Scrittura sul diario con gestione del rifiuto. Ritorna { scrivi, messaggio, inCorso }.
 * `tracciaCorso`: solo per i moduli con pulsante Salva; le spunte non cambiano stato durante la scrittura
 * (un re-render prima dello snapshot riporterebbe la checkbox al valore precedente).
 */
export function useScritturaDiario(data, tracciaCorso = false) {
  const { store, segnalaRifiuto } = useContext(Contesto);
  const [messaggio, setMessaggio] = useState(null);
  const [inCorso, setInCorso] = useState(false);
  async function scrivi(modifiche) {
    setMessaggio(null);
    if (tracciaCorso) setInCorso(true);
    try {
      await store.aggiornaDiario(data, modifiche);
      return true;
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
      return false;
    } finally {
      if (tracciaCorso) setInCorso(false);
    }
  }
  return { scrivi, messaggio, inCorso };
}

const fattiValidi = (fatti, n) => (Array.isArray(fatti) ? fatti.filter((i) => Number.isInteger(i) && i >= 0 && i < n) : []);

function dettaglioEsercizio(e) {
  const parti = [];
  if (e.serie != null && e.ripetizioni != null) parti.push(`${e.serie} × ${e.ripetizioni}`);
  else if (e.ripetizioni != null) parti.push(`${e.ripetizioni} rip.`);
  if (e.durataSec != null) parti.push(`${e.durataSec} s`);
  if (e.perLato) parti.push('per lato');
  if (e.nota) parti.push(e.nota);
  return parti.join(' · ');
}

function BloccoSpunte({ titolo, esercizi, fatti, onCambia, disabilitato }) {
  const validi = fattiValidi(fatti, esercizi.length);
  return html`
    <section class="card blocco-giornata" aria-label=${titolo}>
      <div class="blocco-testata">
        <h2 class="titolo-blocco">${titolo}</h2>
        <span class="contatore numero">${validi.length} / ${esercizi.length}</span>
      </div>
      ${esercizi.length === 0 && html`<p class="secondario">Nessun esercizio</p>`}
      <ul class="elenco-spunte">
        ${esercizi.map((e, i) => html`
          <li key=${i}>
            <label class="spunta">
              <input type="checkbox" checked=${validi.includes(i)} disabled=${disabilitato}
                onChange=${(ev) => onCambia(ev.target.checked
    ? [...new Set([...validi, i])].sort((a, b) => a - b)
    : validi.filter((x) => x !== i))} />
              <span class="spunta-testo">
                <span>${e.nome}</span>
                ${dettaglioEsercizio(e) && html`<span class="secondario">${dettaglioEsercizio(e)}</span>`}
              </span>
            </label>
          </li>`)}
      </ul>
    </section>`;
}

function BloccoPrincipale({ revisione, fatto, onCambia, disabilitato }) {
  const esercizi = revisione.principale ?? [];
  const ob = revisione.obiettivo;
  return html`
    <section class="card blocco-giornata" aria-label="Parte principale">
      <h2 class="titolo-blocco">Parte principale</h2>
      <div class="colonna-programmato">
        <div class="sottotitolo">Programmato</div>
        ${ob && html`
          <div class="programmato-riga">
            <span>${ob.descrizione}</span>
            <span class="secondario">${[ob.distanzaKm != null && `${testoNumero(ob.distanzaKm)} km`, ob.dislivelloM != null && `${testoNumero(ob.dislivelloM)} m D+`].filter(Boolean).join(' · ')}</span>
          </div>`}
        ${esercizi.map((e, i) => html`
          <div class="programmato-riga" key=${i}>
            <span class="programmato-nome">${e.nome}</span>
            <span class="secondario">${[
    `${e.serie} × ${e.ripetizioni}${e.caricoKg != null ? ` · ${testoNumero(e.caricoKg)} kg` : ''}`,
    e.recuperoSec != null && `rec. ${testoRecupero(e.recuperoSec)}`,
    e.nota,
  ].filter(Boolean).join(' · ')}</span>
          </div>`)}
        ${!ob && esercizi.length === 0 && html`<p class="secondario">Nessun esercizio</p>`}
      </div>
      <button type="button" class=${fatto ? 'pulsante primario' : 'pulsante'} aria-pressed=${fatto ? 'true' : 'false'}
        disabled=${disabilitato} onClick=${onCambia}>Segna come fatta</button>
    </section>`;
}

function Modulo({ data, voce }) {
  const { puoScrivere, setSporco } = useContext(Contesto);
  const { scrivi, messaggio, inCorso } = useScritturaDiario(data, true);
  const salvataS = voce?.sensazione ?? null;
  const salvataN = voce?.nota ?? '';
  const [sensazione, setSensazione] = useState(salvataS);
  const [nota, setNota] = useState(salvataN);
  const [base, setBase] = useState({ s: salvataS, n: salvataN });
  const sporco = sensazione !== base.s || nota !== base.n;

  const cambia = (s, n) => { setSensazione(s); setNota(n); setSporco(s !== base.s || n !== base.n); };
  async function salva() {
    if (await scrivi({ sensazione, nota })) {
      setBase({ s: sensazione, n: nota });
      setSporco(false);
    }
  }
  return html`
    <section class="card modulo-sensazione" aria-label="Come ti sei sentito?">
      <h2 class="titolo-blocco">Come ti sei sentito?</h2>
      <div class="sensazioni" role="group" aria-label="Sensazione">
        ${[1, 2, 3, 4, 5].map((n) => html`
          <button type="button" key=${n} class="pulsante sensazione" aria-pressed=${sensazione === n ? 'true' : 'false'}
            onClick=${() => cambia(sensazione === n ? null : n, nota)}>${n}</button>`)}
      </div>
      <${Campo} etichetta="Note per il trainer">
        <textarea rows="3" value=${nota} onInput=${(e) => cambia(sensazione, e.target.value)}></textarea>
      </${Campo}>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso || !sporco} onClick=${salva}>Salva</button>
    </section>`;
}

export function SezioneGiornata({ data: dataProp }) {
  const { dati, oggi, vai, puoScrivere } = useContext(Contesto);
  const data = dataProp ?? oggi;
  const { giorno, scheda, revisione, voce, stato } = contestoGiorno(dati, data);
  const { scrivi, messaggio } = useScritturaDiario(data);
  const disabilitato = !puoScrivere;

  const intestazione = html`
    <header class="intestazione-giornata">
      <button type="button" class="pulsante-icona" aria-label="Torna a Oggi" onClick=${() => vai('oggi', { data })}>‹</button>
      <h1 class="titolo-sezione">${formatoDataLunga(data)}</h1>
    </header>`;

  if (!giorno.versione) {
    return html`<section class="sezione">${intestazione}<${Vuoto} testo="Il trainer non ha ancora preparato il programma" /></section>`;
  }
  if (!giorno.schedaId) {
    return html`<section class="sezione">${intestazione}<div class="card"><p>Riposo</p></div></section>`;
  }
  if (!scheda || !revisione) {
    return html`<section class="sezione">${intestazione}<div class="card"><p>Scheda non disponibile</p></div></section>`;
  }

  const n = stato.completati;
  const segmenti = [stato.riscaldamento, stato.principale, stato.stretching];
  return html`
    <section class="sezione giornata">
      ${intestazione}
      <div class="card testata-giornata">
        <div class="secondario">${TIPI[scheda.tipo] ?? scheda.tipo}${revisione.durataStimataMin != null ? ` · ${revisione.durataStimataMin} min` : ''}</div>
        <h2 class="titolo-scheda">${scheda.nome}</h2>
        <div class="barra-segmenti" aria-hidden="true">
          ${segmenti.map((s, i) => html`<span key=${i} class=${s ? 'segmento pieno' : 'segmento'}></span>`)}
        </div>
        <div class="secondario">${n} ${n === 1 ? 'blocco' : 'blocchi'} su 3 ${n === 1 ? 'completato' : 'completati'}</div>
      </div>
      ${revisione.nota && html`
        <section class="card nota-trainer" aria-label="Nota del trainer">
          <h2 class="titolo-blocco">Nota del trainer</h2>
          <p>${revisione.nota}</p>
        </section>`}
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <${BloccoSpunte} titolo="Riscaldamento" esercizi=${revisione.riscaldamento ?? []} fatti=${voce?.riscaldamentoFatti}
        disabilitato=${disabilitato} onCambia=${(fatti) => scrivi({ riscaldamentoFatti: fatti })} />
      <${BloccoPrincipale} revisione=${revisione} fatto=${voce?.principaleFatto === true}
        disabilitato=${disabilitato} onCambia=${() => scrivi({ principaleFatto: voce?.principaleFatto !== true })} />
      <${BloccoSpunte} titolo="Stretching" esercizi=${revisione.stretching ?? []} fatti=${voce?.stretchingFatti}
        disabilitato=${disabilitato} onCambia=${(fatti) => scrivi({ stretchingFatti: fatti })} />
      <${Modulo} key=${data} data=${data} voce=${voce} />
    </section>`;
}
