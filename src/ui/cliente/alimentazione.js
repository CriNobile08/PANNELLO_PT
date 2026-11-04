import { html, useState, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { SelettoreData, Vuoto } from '../componenti.js';
import { versioneValida, versioniFuture } from '../../logic/versioni.js';
import { formatoData } from '../../logic/date.js';
import { Pasti } from './pasti.js';

export function SezioneAlimentazioneCliente() {
  const { dati, oggi } = useContext(Contesto);
  const [data, setData] = useState(oggi);
  const piano = versioneValida(dati.alimentazione, data);
  const futura = versioniFuture(dati.alimentazione, oggi)[0];
  return html`
    <section class="sezione">
      <h1 class="titolo-sezione">Alimentazione</h1>
      <${SelettoreData} data=${data} onCambia=${setData}
        formato=${(d) => (d === oggi ? `Oggi · ${formatoData(d)}` : formatoData(d))} />
      ${futura && html`<p class="secondario">In programma dal ${formatoData(futura.validaDal)}</p>`}
      ${piano
    ? html`
        <div class="card">
          ${piano.indicazioni && html`
            <h2 class="titolo-blocco">Indicazioni generali</h2>
            <p>${piano.indicazioni}</p>`}
          <${Pasti} piano=${piano} chiave=${data} />
        </div>`
    : html`<${Vuoto} testo="Nessun piano alimentare" />`}
    </section>`;
}
