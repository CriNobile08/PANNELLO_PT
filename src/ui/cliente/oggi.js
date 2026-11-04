import { html, useState, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Anello, Dialogo, Campo, SelettoreData, Vuoto } from '../componenti.js';
import { versioneValida } from '../../logic/versioni.js';
import { formatoData } from '../../logic/date.js';
import { Pasti } from './pasti.js';
import { TIPI, contestoGiorno, useDiario, impostaBlocco } from './giornata.js';

const DATI_VUOTI = ['FC a riposo', 'HRV', 'Passi', 'Fasi del sonno'];

const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

function riepilogoPrincipale(revisione) {
  if (revisione.obiettivo) return revisione.obiettivo.descrizione;
  const es = revisione.principale ?? [];
  const serie = es.reduce((t, e) => t + (e.serie ?? 0), 0);
  return `${plurale(es.length, 'esercizio', 'esercizi')} · ${plurale(serie, 'serie', 'serie')}`;
}

function DialogoNota({ notaIniziale, modifica, messaggio, onChiudi }) {
  const { puoScrivere } = useContext(Contesto);
  const [inCorso, setInCorso] = useState(false);
  const [nota, setNota] = useState(notaIniziale);
  return html`
    <${Dialogo} titolo="Nota per il trainer" azioni=${[
    { testo: 'Annulla', onClick: onChiudi },
    { testo: 'Salva nota', primaria: true, disabled: !puoScrivere || inCorso, onClick: async () => {
      setInCorso(true);
      const ok = await modifica({ nota });
      setInCorso(false);
      if (ok) onChiudi();
    } },
  ]}>
      <${Campo} etichetta="Nota">
        <textarea rows="4" value=${nota} onInput=${(e) => setNota(e.target.value)}></textarea>
      </${Campo}>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
    </${Dialogo}>`;
}

function BloccoCheckbox({ etichetta, completo, vuoto, disabilitato, onCambia }) {
  return html`
    <label class="spunta riga-blocco">
      <input type="checkbox" checked=${completo} disabled=${disabilitato || vuoto}
        onChange=${(e) => onCambia(e.target.checked)} />
      <span>${etichetta}</span>
    </label>`;
}

function CardAllenamento({ data, ctx, modifica, messaggio }) {
  const { vai, puoScrivere } = useContext(Contesto);
  const [nota, setNota] = useState(false);
  const { giorno, scheda, revisione, voce, stato } = ctx;
  const disabilitato = !puoScrivere;

  if (!giorno.versione) {
    return html`<${Vuoto} testo="Il trainer non ha ancora preparato il programma" />`;
  }
  if (!giorno.schedaId) return html`<div class="card"><h2 class="titolo-blocco">Allenamento di oggi</h2><p>Riposo</p></div>`;
  if (!scheda || !revisione) return html`<div class="card"><h2 class="titolo-blocco">Allenamento di oggi</h2><p>Scheda non disponibile</p></div>`;

  const nRisc = (revisione.riscaldamento ?? []).length;
  const nStr = (revisione.stretching ?? []).length;
  return html`
    <div class="card card-allenamento">
      <div class="allenamento-testata">
        <a href="#" class="allenamento-link" onClick=${(e) => { e.preventDefault(); vai('giornata', { data }); }}>
          <span class="secondario">Allenamento di oggi</span>
          <span class="titolo-scheda">${scheda.nome}</span>
          <span class="secondario">${TIPI[scheda.tipo] ?? scheda.tipo}</span>
        </a>
        <button type="button" class="pulsante-icona" aria-label="Aggiungi nota" disabled=${!puoScrivere} onClick=${() => setNota(true)}>+</button>
      </div>
      <div class="blocchi">
        <${BloccoCheckbox} etichetta="Riscaldamento" completo=${stato.riscaldamento} vuoto=${nRisc === 0} disabilitato=${disabilitato}
          onCambia=${(v) => modifica(v ? impostaBlocco('riscaldamentoFatti', nRisc) : () => ({ riscaldamentoFatti: [] }))} />
        <div class="riga-blocco">
          <span class=${stato.principale ? 'segno fatto' : 'segno'} aria-hidden="true">${stato.principale ? '✓' : ''}</span>
          <span><span>Parte principale</span> <span class="secondario">${riepilogoPrincipale(revisione)}</span></span>
        </div>
        <${BloccoCheckbox} etichetta="Stretching" completo=${stato.stretching} vuoto=${nStr === 0} disabilitato=${disabilitato}
          onCambia=${(v) => modifica(v ? impostaBlocco('stretchingFatti', nStr) : () => ({ stretchingFatti: [] }))} />
      </div>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      ${nota && html`<${DialogoNota} key=${data} modifica=${modifica} messaggio=${messaggio} notaIniziale=${voce?.nota ?? ''} onChiudi=${() => setNota(false)} />`}
    </div>`;
}

function CardAlimentazione({ data }) {
  const { dati } = useContext(Contesto);
  const piano = versioneValida(dati.alimentazione, data);
  if (!piano) return html`<${Vuoto} testo="Nessun piano alimentare" />`;
  return html`
    <section class="card" aria-label="Alimentazione di oggi">
      <h2 class="titolo-blocco">Alimentazione di oggi</h2>
      <${Pasti} piano=${piano} chiave=${data} />
    </section>`;
}

export function SezioneOggi({ data: iniziale }) {
  const { dati, oggi } = useContext(Contesto);
  const [data, setData] = useState(iniziale ?? oggi);
  const { voce, modifica, messaggio } = useDiario(data);
  const ctx = contestoGiorno(dati, data, voce);
  const { giorno, stato } = ctx;
  const riposo = giorno.versione && !giorno.schedaId;
  const haScheda = giorno.versione && giorno.schedaId && ctx.revisione;

  return html`
    <section class="sezione oggi">
      <${SelettoreData} data=${data} onCambia=${setData}
        formato=${(d) => (d === oggi ? `Oggi · ${formatoData(d)}` : formatoData(d))} />
      <div class="card anelli">
        <${Anello} valore=${null} colore="#E08A4F" etichetta="Sonno" testo="Nessun dato" />
        <${Anello} valore=${null} colore="#2BC4A6" etichetta="Cuore a riposo" testo="Nessun dato" />
        <${Anello} valore=${haScheda ? stato.completati : null} massimo=${3} colore="#5B9BFF" etichetta="Allenamento"
          testo=${riposo ? 'Riposo' : haScheda ? `${stato.completati}/3` : 'Nessun dato'}
          sottotesto=${haScheda ? 'blocchi' : undefined} />
      </div>
      <${CardAllenamento} data=${data} ctx=${ctx} modifica=${modifica} messaggio=${messaggio} />
      <div class="dati-griglia">
        ${DATI_VUOTI.map((t) => html`
          <div class="card-interna dato" key=${t}>
            <div class="secondario">${t}</div>
            <div class="dato-valore">Nessun dato</div>
          </div>`)}
      </div>
      <${CardAlimentazione} data=${data} />
    </section>`;
}
