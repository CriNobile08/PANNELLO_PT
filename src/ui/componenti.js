import { cloneElement, toChildArray } from 'preact';
import { html, useRef, useEffect } from './html.js';
import { aggiungiGiorni } from '../logic/date.js';

let contatoreId = 0;
const nuovoId = (prefisso) => `${prefisso}-${++contatoreId}`;
function useIdStabile(prefisso) {
  const r = useRef(null);
  if (r.current === null) r.current = nuovoId(prefisso);
  return r.current;
}

/**
 * Anello di avanzamento. `valore: null` → solo la traccia (nessun dato).
 * `testo` e `sottotesto` stanno al centro, `etichetta` sotto l'anello.
 */
export function Anello({ valore, massimo = 1, colore = '#5B9BFF', etichetta, testo, sottotesto }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const frazione = valore === null || valore === undefined || !(massimo > 0)
    ? 0
    : Math.max(0, Math.min(1, valore / massimo));
  return html`
    <div class="anello">
      <div class="anello-cerchio">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r=${r} class="anello-traccia" />
          ${frazione > 0 && html`
            <circle cx="50" cy="50" r=${r} class="anello-valore" stroke=${colore}
              stroke-dasharray=${`${circ * frazione} ${circ}`} transform="rotate(-90 50 50)" />`}
        </svg>
        <div class="anello-testi">
          ${testo !== undefined && testo !== null && html`<div class="anello-testo">${testo}</div>`}
          ${sottotesto && html`<div class="anello-sottotesto">${sottotesto}</div>`}
        </div>
      </div>
      ${etichetta && html`<div class="anello-etichetta"><span class="punto" style=${{ background: colore }}></span>${etichetta}</div>`}
    </div>`;
}

/**
 * Dialogo modale. `azioni`: [{ testo, primaria?, onClick, disabled? }]. Il dialogo non si chiude da solo:
 * ogni azione decide cosa fare (di solito chiude il dialogo togliendolo dal render).
 */
export function Dialogo({ titolo, children, azioni = [] }) {
  const idTitolo = useIdStabile('dialogo-titolo');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[data-primaria]') ?? ref.current?.querySelector('button');
    el?.focus();
  }, []);
  return html`
    <div class="velo">
      <div class="dialogo card" role="dialog" aria-modal="true" aria-labelledby=${idTitolo} ref=${ref}>
        <h2 id=${idTitolo} class="dialogo-titolo">${titolo}</h2>
        ${children && html`<div class="dialogo-corpo">${children}</div>`}
        <div class="dialogo-azioni">
          ${azioni.map((a) => html`
            <button type="button" class=${a.primaria ? 'pulsante primario' : 'pulsante'}
              data-primaria=${a.primaria ? '' : undefined} disabled=${a.disabled} onClick=${a.onClick}>${a.testo}</button>`)}
        </div>
      </div>
    </div>`;
}

const CONTROLLI = ['input', 'select', 'textarea'];

/**
 * Campo con etichetta. Avvolge i controlli in una <label> (così getByLabel(etichetta) li trova),
 * imposta aria-invalid sui controlli figli diretti e mostra `errore` sotto il campo.
 */
export function Campo({ etichetta, errore, children }) {
  const idErrore = useIdStabile('errore');
  const figli = toChildArray(children).map((c) =>
    c && typeof c === 'object' && CONTROLLI.includes(c.type)
      ? cloneElement(c, {
        'aria-invalid': errore ? 'true' : undefined,
        'aria-describedby': errore ? idErrore : undefined,
      })
      : c);
  return html`
    <label class=${errore ? 'campo campo-errore' : 'campo'}>
      <span class="campo-etichetta">${etichetta}</span>
      ${figli}
      ${errore && html`<span class="campo-messaggio" id=${idErrore} role="alert">${errore}</span>`}
    </label>`;
}

/**
 * ‹ data › . `formato(data)` produce l'etichetta; `passo` è in giorni (1 = giorno, 7 = settimana).
 */
export function SelettoreData({ data, onCambia, formato = (d) => d, passo = 1 }) {
  const [prima, dopo] = passo === 7
    ? ['Settimana precedente', 'Settimana successiva']
    : ['Giorno precedente', 'Giorno successivo'];
  return html`
    <div class="selettore-data">
      <button type="button" class="pulsante-icona" aria-label=${prima}
        onClick=${() => onCambia(aggiungiGiorni(data, -passo))}>‹</button>
      <span class="selettore-data-etichetta">${formato(data)}</span>
      <button type="button" class="pulsante-icona" aria-label=${dopo}
        onClick=${() => onCambia(aggiungiGiorni(data, passo))}>›</button>
    </div>`;
}

/** Stato vuoto. `azione`: { testo, onClick, disabled? } → pulsante primario. */
export function Vuoto({ testo, azione }) {
  return html`
    <div class="vuoto card">
      ${testo && html`<p>${testo}</p>`}
      ${azione && html`<button type="button" class="pulsante primario" disabled=${azione.disabled} onClick=${azione.onClick}>${azione.testo}</button>`}
    </div>`;
}

export const TESTO_SOLA_LETTURA = 'Puoi solo leggere: chiedi al proprietario di invitarti come Editor';

/** Avviso fisso di sola lettura (App lo mostra quando puoScrivere è false). */
export function AvvisoSolaLettura() {
  return html`<div class="avviso-sola-lettura" role="status">${TESTO_SOLA_LETTURA}</div>`;
}
