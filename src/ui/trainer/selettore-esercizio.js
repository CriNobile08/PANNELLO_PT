import { html, useState, useMemo, useRef, useEffect, useLayoutEffect } from '../html.js';
import { Campo } from '../componenti.js';
import { filtraCatalogo } from '../../logic/catalogo.js';

let contatore = 0;
const TESTO_LIBERO = 'Esercizio non in elenco…';

/**
 * Nome di un esercizio scelto da un catalogo (combobox ARIA 1.2 con ricerca e filtri) o scritto a mano.
 * `valore`: { nome, [catalogo.campoId] }. `catalogo`: { voci, campoId, filtri: [{ campo, etichetta, opzioni: [[valore, testo]] }],
 * descrivi(voce) } oppure null (catalogo Hevy assente: nota e testo libero).
 * `campoId`: campo dell'id quando `catalogo` è null (un esercizio già scelto resta riconoscibile e "Cambia" azzera l'id).
 * `onCambia(nuovoValore)` riceve sempre `nome` e l'id (null per un esercizio libero).
 */
export function SelettoreEsercizio({ etichetta, valore, catalogo, campoId: campoIdPredefinito, onCambia, errore }) {
  const base = useRef(null);
  if (base.current === null) base.current = `selettore-${++contatore}`;
  const idLista = `${base.current}-lista`;
  const campoId = catalogo?.campoId ?? campoIdPredefinito;
  const id = campoId ? valore[campoId] ?? null : null;

  // un esercizio già con un nome (e senza id) si apre come testo libero
  const [libero, setLibero] = useState(() => (valore.nome ?? '').trim() !== '');
  const [testo, setTesto] = useState('');
  const [filtri, setFiltri] = useState({});
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(-1);
  const daFocalizzare = useRef(null);
  const radice = useRef(null);

  const risultati = useMemo(() => (catalogo ? filtraCatalogo(catalogo.voci, { testo, filtri }) : []), [catalogo, testo, filtri]);
  const totale = risultati.length + 1; // + "Esercizio non in elenco…"

  // il fuoco segue il cambio di modalità (scelta, "Cambia", testo libero) subito dopo il render
  useLayoutEffect(() => {
    const quale = daFocalizzare.current;
    if (!quale) return;
    daFocalizzare.current = null;
    radice.current?.querySelector(`[data-focus="${quale}"]`)?.focus();
  });
  useEffect(() => {
    if (attivo >= 0) document.getElementById(`${base.current}-opz-${attivo}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [attivo]);

  const nuovo = (nome, idScelto) => (campoId ? { nome, [campoId]: idScelto } : { nome });
  const chiudi = () => { setAperto(false); setAttivo(-1); };

  function scegli(i) {
    if (i >= risultati.length) {
      setLibero(true);
      daFocalizzare.current = 'libero';
      onCambia(nuovo(testo.trim(), null));
    } else {
      const voce = risultati[i];
      daFocalizzare.current = 'cambia';
      onCambia(nuovo(voce.nome, voce.id));
    }
    chiudi();
  }

  function cambia() {
    setTesto('');
    setFiltri({});
    if (catalogo) { setLibero(false); daFocalizzare.current = 'cerca'; onCambia(nuovo('', null)); } else {
      setLibero(true); daFocalizzare.current = 'libero'; onCambia(nuovo(valore.nome ?? '', null));
    }
  }

  function tornaAlCatalogo() {
    setTesto(valore.nome ?? '');
    setLibero(false);
    daFocalizzare.current = 'cerca';
    onCambia(nuovo('', null));
  }

  function tasto(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aperto) { setAperto(true); setAttivo(e.key === 'ArrowDown' ? 0 : totale - 1); return; }
      setAttivo((a) => (e.key === 'ArrowDown' ? Math.min(a + 1, totale - 1) : Math.max(a - 1, 0)));
    } else if (e.key === 'Enter') {
      if (aperto && attivo >= 0) { e.preventDefault(); scegli(attivo); }
    } else if (e.key === 'Escape') {
      if (aperto) { e.preventDefault(); chiudi(); }
    }
  }

  // la lista si chiude quando il fuoco esce dal selettore (non quando passa ai filtri)
  const fuocoFuori = (e) => { if (!radice.current?.contains(e.relatedTarget)) chiudi(); };

  // ---------- scelto dal catalogo ----------
  if (id !== null) {
    const voce = catalogo?.voci.find((v) => v.id === id);
    const secondario = voce ? catalogo.descrivi(voce) : '';
    return html`
      <div class="selettore-esercizio" ref=${radice}>
        <div class="campo">
          <span class="campo-etichetta">${etichetta}</span>
          <div class="esercizio-scelto card-interna">
            <span class="esercizio-scelto-testi">
              <span class="esercizio-nome">${valore.nome}</span>
              ${secondario && html`<span class="esercizio-dettaglio secondario">${secondario}</span>`}
            </span>
            <button type="button" class="pulsante" data-focus="cambia" onClick=${cambia}>Cambia</button>
          </div>
        </div>
      </div>`;
  }

  // ---------- testo libero ----------
  // in ricerca il nome è sempre vuoto: un nome senza id (es. scritto prima che arrivasse il catalogo) è testo libero
  if (!catalogo || libero || (valore.nome ?? '').trim() !== '') {
    return html`
      <div class="selettore-esercizio" ref=${radice}>
        ${!catalogo && html`<p class="nota-catalogo secondario">Catalogo Hevy non ancora disponibile</p>`}
        <${Campo} etichetta=${etichetta} errore=${errore}>
          <input type="text" data-focus="libero" value=${valore.nome} onInput=${(e) => onCambia(nuovo(e.target.value, null))} />
        </${Campo}>
        ${catalogo && html`<button type="button" class="link-azione" onClick=${tornaAlCatalogo}>Scegli dal catalogo</button>`}
      </div>`;
  }

  // ---------- ricerca nel catalogo ----------
  const idOpzione = (i) => `${base.current}-opz-${i}`;
  return html`
    <div class="selettore-esercizio" ref=${radice} onFocusOut=${fuocoFuori}>
      <${Campo} etichetta=${etichetta} errore=${errore}>
        <input type="text" role="combobox" data-focus="cerca" autocomplete="off" placeholder="Cerca un esercizio"
          aria-autocomplete="list" aria-expanded=${aperto ? 'true' : 'false'} aria-controls=${idLista}
          aria-activedescendant=${aperto && attivo >= 0 ? idOpzione(attivo) : undefined}
          value=${testo}
          onInput=${(e) => { setTesto(e.target.value); setAperto(true); setAttivo(-1); }}
          onClick=${() => setAperto(true)}
          onKeyDown=${tasto} />
      </${Campo}>
      ${catalogo.filtri.length > 0 && html`
        <div class="filtri-selettore">
          ${catalogo.filtri.map((f) => html`
            <${Campo} key=${f.campo} etichetta=${f.etichetta}>
              <select aria-label=${f.etichetta} value=${filtri[f.campo] ?? ''} onChange=${(e) => { setFiltri({ ...filtri, [f.campo]: e.target.value }); setAperto(true); setAttivo(-1); }}>
                <option value="">Tutti</option>
                ${f.opzioni.map(([v, t]) => html`<option key=${v} value=${v}>${t}</option>`)}
              </select>
            </${Campo}>`)}
        </div>`}
      ${aperto && risultati.length === 0 && html`<p class="secondario nessun-risultato">Nessun esercizio trovato</p>`}
      <ul class="lista-selettore" id=${idLista} role="listbox" aria-label=${etichetta} hidden=${!aperto}>
        ${aperto && [...risultati.map((v, i) => {
    const secondario = catalogo.descrivi(v);
    return html`
          <li key=${v.id} id=${idOpzione(i)} role="option" aria-selected=${attivo === i ? 'true' : 'false'}
            class=${attivo === i ? 'opzione-selettore attiva' : 'opzione-selettore'}
            onMouseDown=${(e) => e.preventDefault()} onClick=${() => scegli(i)}>
            <span class="esercizio-nome">${v.nome}</span>
            ${secondario && html`<span class="esercizio-dettaglio secondario">${secondario}</span>`}
          </li>`;
  }), html`
          <li key="__libero" id=${idOpzione(risultati.length)} role="option" aria-selected=${attivo === risultati.length ? 'true' : 'false'}
            class=${attivo === risultati.length ? 'opzione-selettore opzione-libera attiva' : 'opzione-selettore opzione-libera'}
            onMouseDown=${(e) => e.preventDefault()} onClick=${() => scegli(risultati.length)}>${TESTO_LIBERO}</li>`]}
      </ul>
    </div>`;
}
