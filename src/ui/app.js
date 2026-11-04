import { html, useState, useEffect, useRef } from './html.js';
import { Contesto } from './contesto.js';
import { Dialogo, AvvisoSolaLettura } from './componenti.js';
import { oggiRoma } from '../logic/date.js';
import { SezioneSchede } from './trainer/schede.js';
import { SezioneSettimana } from './trainer/settimana.js';
import { vistaIniziale, salvaVista } from '../logic/vista.js';

/** Memoria del browser: ogni accesso dentro try/catch (vista.js protegge getItem/setItem). */
function memoria() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const segnaposto = (titolo) => {
  const Segnaposto = () => html`
    <section class="sezione">
      <h1 class="titolo-sezione">${titolo}</h1>
      <div class="card segnaposto">${titolo}</div>
    </section>`;
  return Segnaposto;
};

/**
 * Sezioni registrate: chiave → componente. Il componente riceve i `parametri` di `vai()` come props
 * (es. `giornata` riceve `{ data }`). I Task 8–12 sostituiscono i segnaposto.
 */
export const SEZIONI = {
  // vista cliente
  oggi: segnaposto('Oggi'),
  giornata: segnaposto('Giornata'),
  allenamento: segnaposto('Allenamento'),
  alimentazione: segnaposto('Alimentazione'),
  // vista trainer
  settimana: SezioneSettimana,
  schede: SezioneSchede,
  piano: segnaposto('Piano alimentare'),
};

/** Voci di navigazione per vista. `disattivata` → aria-disabled e "In arrivo". */
export const NAVIGAZIONE = {
  cliente: [
    { sezione: 'oggi', etichetta: 'Oggi', icona: '◉' },
    { sezione: 'allenamento', etichetta: 'Allenamento', icona: '▤' },
    { sezione: 'alimentazione', etichetta: 'Alimentazione', icona: '◍' },
    { sezione: 'dati', etichetta: 'Dati', icona: '∿', disattivata: true },
  ],
  trainer: [
    { sezione: 'settimana', etichetta: 'Settimana tipo', icona: '▦' },
    { sezione: 'schede', etichetta: 'Schede di allenamento', icona: '▤' },
    { sezione: 'piano', etichetta: 'Piano alimentare', icona: '◍' },
    { sezione: 'dati-cliente', etichetta: 'Dati del cliente', icona: '∿', disattivata: true },
    { sezione: 'report', etichetta: 'Report settimanali', icona: '▥', disattivata: true },
  ],
};

export const SEZIONE_INIZIALE = { cliente: 'oggi', trainer: 'settimana' };

function SelettoreVista({ vista, onCambia }) {
  return html`
    <div class="selettore-vista" role="group" aria-label="Vista">
      ${[['cliente', 'Cliente'], ['trainer', 'Trainer']].map(([v, testo]) => html`
        <button type="button" aria-pressed=${vista === v ? 'true' : 'false'} onClick=${() => onCambia(v)}>${testo}</button>`)}
    </div>`;
}

function Navigazione({ vista, sezione, onVai }) {
  // `giornata` appartiene a "Oggi" per l'evidenziazione
  const attiva = sezione === 'giornata' ? 'oggi' : sezione;
  return html`
    <nav class="navigazione" aria-label="Sezioni">
      ${NAVIGAZIONE[vista].map((v) => v.disattivata
    ? html`
          <a href="#" class="voce disattivata" aria-disabled="true" onClick=${(e) => e.preventDefault()}>
            <span class="voce-icona" aria-hidden="true">${v.icona}</span>
            <span class="voce-etichetta">${v.etichetta}</span>
            <span class="voce-badge">In arrivo</span>
          </a>`
    : html`
          <a href="#" class="voce" aria-current=${attiva === v.sezione ? 'page' : undefined}
            onClick=${(e) => { e.preventDefault(); onVai(v.sezione); }}>
            <span class="voce-icona" aria-hidden="true">${v.icona}</span>
            <span class="voce-etichetta">${v.etichetta}</span>
          </a>`)}
    </nav>`;
}

/**
 * Guscio dell'app. Le props arrivano da main.js dopo il caricamento:
 * { dati, store, utenteId, isOwner, puoScrivere, segnalaRifiuto, nomi }.
 */
export function App({ dati, store, utenteId = null, isOwner = false, puoScrivere = true, segnalaRifiuto, nomi }) {
  const [vista, setVistaInterna] = useState(() => vistaIniziale({ isOwner, storage: memoria() }));
  const [posizione, setPosizione] = useState(() => ({ sezione: SEZIONE_INIZIALE[vista], parametri: {} }));
  const [inSospeso, setInSospeso] = useState(null); // azione bloccata dalla guardia
  const sporco = useRef(false);
  const [, setTic] = useState(0);

  // "oggi" si ricalcola a ogni render; un tic al minuto fa passare la mezzanotte.
  const oggi = oggiRoma();
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const avviso = (e) => {
      if (!sporco.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avviso);
    return () => window.removeEventListener('beforeunload', avviso);
  }, []);

  const conGuardia = (azione) => {
    if (sporco.current) setInSospeso(() => azione);
    else azione();
  };

  const vai = (sezione, parametri = {}) => conGuardia(() => {
    setPosizione({ sezione, parametri });
    window.scrollTo?.(0, 0);
  });

  const setVista = (nuova) => {
    if (nuova === vista) return;
    conGuardia(() => {
      salvaVista(memoria(), nuova);
      setVistaInterna(nuova);
      setPosizione({ sezione: SEZIONE_INIZIALE[nuova], parametri: {} });
    });
  };

  const setSporco = (v) => { sporco.current = !!v; };

  const valore = {
    dati, store, oggi, utenteId, vista, setVista, puoScrivere, segnalaRifiuto, nomi,
    sezione: posizione.sezione, parametri: posizione.parametri, vai, setSporco,
  };

  const Sezione = SEZIONI[posizione.sezione] ?? segnaposto(posizione.sezione);

  return html`
    <${Contesto.Provider} value=${valore}>
      <div class="guscio">
        <header class="intestazione">
          <div class="marchio">Pannello PT</div>
          <${SelettoreVista} vista=${vista} onCambia=${setVista} />
        </header>
        ${!puoScrivere && html`<${AvvisoSolaLettura} />`}
        <div class="corpo">
          <${Navigazione} vista=${vista} sezione=${posizione.sezione} onVai=${vai} />
          <main class="contenuto">
            <${Sezione} key=${vista + ':' + posizione.sezione} ...${posizione.parametri} />
          </main>
        </div>
        ${inSospeso && html`
          <${Dialogo}
            titolo="Hai modifiche non salvate. Uscire senza salvare?"
            azioni=${[
    { testo: 'Resta', onClick: () => setInSospeso(null) },
    { testo: 'Esci senza salvare', primaria: true, onClick: () => { sporco.current = false; setInSospeso(null); inSospeso(); } },
  ]} />`}
      </div>
    </${Contesto.Provider}>`;
}

/** Schermata di caricamento (prima del primo snapshot). */
export function Caricamento() {
  return html`<div class="schermo-centrale"><div class="card stato-avvio" role="status">Caricamento…</div></div>`;
}

/** Errore di caricamento con "Riprova" (§8). */
export function ErroreCaricamento({ onRiprova }) {
  return html`
    <div class="schermo-centrale">
      <div class="card stato-avvio" role="alert">
        <p>Impossibile caricare i dati</p>
        <button type="button" class="pulsante primario" onClick=${onRiprova}>Riprova</button>
      </div>
    </div>`;
}
