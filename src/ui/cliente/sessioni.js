import { html } from '../html.js';
import { oraRoma } from '../../logic/date.js';
import { TIPI } from './tipi.js';
import { conUnita } from '../formato.js';

export const FONTI = { googleHealth: 'Google Health', strava: 'Strava', hevy: 'Hevy', komoot: 'Komoot' };
export const ZONE = [['leggera', 'Leggera'], ['moderata', 'Moderata'], ['intensa', 'Intensa'], ['picco', 'Picco']];

const numero = (v) => typeof v === 'number' && Number.isFinite(v);

/** 62 → "1 h 02"; 48 → "48 min"; null → "—". */
export function testoDurata(min) {
  if (!numero(min)) return '—';
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

const km = (m) => (numero(m) ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : '—');
const nomeTipo = (s) => TIPI[s.tipo] ?? s.nome ?? TIPI.altro;
const nomiFonti = (s) => (s.fonti ?? []).map((f) => FONTI[f] ?? f).join(', ');

/** Riga di elenco di una sessione unita; con `onClick` diventa un pulsante. */
export function RigaSessione({ sessione, onClick }) {
  const contenuto = html`
    <span class="sessione-principale">
      <span class="sessione-tipo">${nomeTipo(sessione)}</span>
      <span class="secondario">${oraRoma(sessione.inizio)}${nomiFonti(sessione) ? ` · ${nomiFonti(sessione)}` : ''}</span>
    </span>
    <span class="sessione-valori">
      <span>${testoDurata(sessione.durataAttivaMin)}</span>
      <span class="secondario">${numero(sessione.fcMedia) ? `${Math.round(sessione.fcMedia)} bpm` : '—'}</span>
    </span>`;
  return onClick
    ? html`<button type="button" class="riga-sessione" onClick=${onClick}>${contenuto}</button>`
    : html`<div class="riga-sessione">${contenuto}</div>`;
}

/** Dettaglio di una sessione unita; i valori mancanti sono "—". */
export function DettaglioSessione({ sessione }) {
  const conDistanza = sessione.tipo === 'corsa' || sessione.tipo === 'trekking';
  const righe = [
    ['Durata', testoDurata(sessione.durataAttivaMin)],
    ['FC media', conUnita(sessione.fcMedia, 'bpm')],
    ['Calorie', conUnita(sessione.calorie, 'kcal')],
    ...(conDistanza ? [['Distanza', km(sessione.distanzaM)], ['Dislivello', conUnita(sessione.dislivelloM, 'm')]] : []),
  ];
  return html`
    <div class="dettaglio-sessione">
      <h3 class="titolo-blocco">${nomeTipo(sessione)}</h3>
      <dl class="dettaglio-righe">
        ${righe.map(([k, v]) => html`<div class="dettaglio-riga" key=${k}><dt class="secondario">${k}</dt><dd>${v}</dd></div>`)}
      </dl>
      <h4 class="secondario">Minuti per zona</h4>
      <dl class="dettaglio-righe">
        ${ZONE.map(([k, et]) => html`
          <div class="dettaglio-riga" key=${k}><dt class="secondario">${et}</dt><dd>${conUnita(sessione.zoneMin?.[k], 'min')}</dd></div>`)}
      </dl>
    </div>`;
}
