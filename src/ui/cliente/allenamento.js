import { html, useState, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Vuoto } from '../componenti.js';
import { EditorSoloQuestaSettimana, EditorNuovaVersione } from '../trainer/settimana.js';
import { ElencoSchede, EditorScheda } from '../trainer/schede.js';
import { risolviSettimana } from '../../logic/risoluzione.js';
import { lunediDi, formatoData } from '../../logic/date.js';

export function SezioneAllenamentoCliente() {
  const { dati, oggi, vai, puoScrivere } = useContext(Contesto);
  const [editor, setEditor] = useState(null); // 'solo' | 'nuova' | { schedaId }
  const lunedi = lunediDi(oggi);
  const chiudi = () => setEditor(null);
  const titolo = html`<h1 class="titolo-sezione">Allenamento</h1>`;

  if (editor === 'solo') return html`<section class="sezione">${titolo}<${EditorSoloQuestaSettimana} lunedi=${lunedi} onChiudi=${chiudi} /></section>`;
  if (editor === 'nuova') return html`<section class="sezione">${titolo}<${EditorNuovaVersione} onChiudi=${chiudi} /></section>`;
  if (editor) return html`<section class="sezione">${titolo}<${EditorScheda} key=${editor.schedaId ?? 'nuova'} schedaId=${editor.schedaId} onChiudi=${chiudi} /></section>`;

  const giorni = risolviSettimana(lunedi, dati);
  return html`
    <section class="sezione">
      ${titolo}
      <div class="azioni-editor">
        <button type="button" class="pulsante" disabled=${!puoScrivere} onClick=${() => setEditor('solo')}>Solo questa settimana</button>
        <button type="button" class="pulsante" disabled=${!puoScrivere} onClick=${() => setEditor('nuova')}>Da una data in poi</button>
      </div>
      ${dati.settimane.length === 0 && html`<${Vuoto} testo="Il trainer non ha ancora preparato il programma" />`}
      <div class="card">
        <h2 class="titolo-blocco">Questa settimana</h2>
        <ul class="lista-righe">
          ${giorni.map((g) => {
    const scheda = g.schedaId ? dati.schede[g.schedaId] : null;
    const testo = !g.versione && g.fonte !== 'eccezione' ? 'Nessun dato' : g.schedaId ? (scheda?.nome ?? 'Scheda non disponibile') : 'Riposo';
    return html`
              <li key=${g.data}>
                <button type="button" class="riga-scheda card-interna" data-testid="riga-giorno" onClick=${() => vai('giornata', { data: g.data })}>
                  <span class="riga-nome">${formatoData(g.data)}</span>
                  <span class="riga-dettaglio">${testo}</span>
                  ${g.fonte === 'eccezione' && html`<span class="secondario">Eccezione</span>`}
                </button>
              </li>`;
  })}
        </ul>
      </div>
      <div class="card">
        <h2 class="titolo-blocco">Schede</h2>
        <${ElencoSchede} onScegli=${(id) => setEditor({ schedaId: id })} />
      </div>
    </section>`;
}
