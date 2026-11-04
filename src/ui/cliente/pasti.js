import { html, useState } from '../html.js';
import { testoNumero } from './giornata.js';

/** Pasti di un piano con opzioni selezionabili e grammature, in sola lettura. `chiave` distingue la data. */
export function Pasti({ piano, chiave }) {
  const [scelte, setScelte] = useState({});
  return (piano.pasti ?? []).map((pasto, i) => {
    const opzioni = pasto.opzioni ?? [];
    const k = `${chiave}:${i}`;
    const scelta = Math.min(scelte[k] ?? 0, Math.max(opzioni.length - 1, 0));
    const opzione = opzioni[scelta];
    return html`
      <div class="pasto-oggi" key=${i}>
        <h3 class="sottotitolo">${pasto.nome}</h3>
        ${opzioni.length > 1 && html`
          <div class="schede-opzione">
            ${opzioni.map((o, j) => html`
              <button type="button" key=${j} class="pulsante scheda-opzione" aria-pressed=${j === scelta ? 'true' : 'false'}
                onClick=${() => setScelte({ ...scelte, [k]: j })}>${o.nome}</button>`)}
          </div>`}
        ${opzione && html`
          <ul class="alimenti-oggi">
            ${(opzione.alimenti ?? []).map((a, j) => html`<li key=${j}>${a.nome} <span class="secondario">· ${testoNumero(a.grammi)} g</span></li>`)}
          </ul>
          ${opzione.nota && html`<p class="secondario">${opzione.nota}</p>`}`}
      </div>`;
  });
}
