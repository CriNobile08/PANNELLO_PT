import { html, useState, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Campo, Dialogo, Vuoto, SelettoreData } from '../componenti.js';
import { ElencoSchede } from './schede.js';
import { risolviSettimana } from '../../logic/risoluzione.js';
import { versioneValida, versioniFuture, revisionePerGiorno } from '../../logic/versioni.js';
import { statoBlocchi } from '../../logic/completamento.js';
import { GIORNI, lunediDi, aggiungiGiorni, giorniDellaSettimana, formatoData, formatoDataIso, giornoSettimana } from '../../logic/date.js';

const NOMI_GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const TIPI = { palestra: 'Palestra', corsa: 'Corsa', trekking: 'Trekking', altro: 'Altro' };
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;
export const MSG_DATA_PASSATA = 'La data non può essere nel passato';

/** Select di schede: non archiviate (più quella attualmente scelta) e "Riposo". Valore '' = riposo. */
function SelezioneScheda({ etichetta, valore, onCambia }) {
  const { dati } = useContext(Contesto);
  const schede = Object.values(dati.schede)
    .filter((s) => !s.archiviata || s.id === valore)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  return html`
    <${Campo} etichetta=${etichetta}>
      <select value=${valore} onChange=${(e) => onCambia(e.target.value)}>
        <option value="">Riposo</option>
        ${schede.map((s) => html`<option key=${s.id} value=${s.id}>${s.nome}</option>`)}
      </select>
    </${Campo}>`;
}

const vuoti = () => Object.fromEntries(GIORNI.map((g) => [g, '']));

// ---------- editor: solo questa settimana ----------
export function EditorSoloQuestaSettimana({ lunedi, onChiudi }) {
  const { dati, store, puoScrivere, segnalaRifiuto, setSporco } = useContext(Contesto);
  const giorni = risolviSettimana(lunedi, dati);
  // valori di partenza fissati all'apertura: si scrivono solo i giorni che l'utente ha cambiato, così una
  // modifica fatta da un altro nel frattempo su un altro giorno non viene sovrascritta.
  const [iniziali] = useState(() => giorni.map((g) => g.schedaId ?? ''));
  const [valori, setValori] = useState(iniziali);
  const [da, setDa] = useState('');
  const [a, setA] = useState('');
  const [messaggio, setMessaggio] = useState(null);
  const [inCorso, setInCorso] = useState(false);
  const cambiati = giorni
    .map((g, i) => ({ data: g.data, id: valori[i] || null, cambiato: valori[i] !== iniziali[i] }))
    .filter((c) => c.cambiato);
  const inSospeso = cambiati.length > 0;

  const imposta = (i, v) => { setValori(valori.map((x, j) => (j === i ? v : x))); setSporco(true); };
  async function esegui(scrivi) {
    setMessaggio(null);
    setInCorso(true);
    try {
      await scrivi();
      setSporco(false);
      onChiudi?.();
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
    } finally {
      setInCorso(false);
    }
  }
  const salva = () => esegui(async () => { for (const c of cambiati) await store.impostaEccezione(c.data, c.id); });
  const sposta = () => esegui(() => store.spostaGiorno(da, a));
  const annulla = () => { setSporco(false); onChiudi?.(); };
  const opzioniGiorno = (v, set, etichetta) => html`
    <${Campo} etichetta=${etichetta}>
      <select value=${v} onChange=${(e) => set(e.target.value)}>
        <option value="">Scegli un giorno</option>
        ${giorni.map((g) => html`<option key=${g.data} value=${g.data}>${formatoData(g.data)}</option>`)}
      </select>
    </${Campo}>`;

  return html`
    <div class="editor-settimana">
      <div class="card">
        <h2 class="titolo-blocco">Modifica solo questa settimana</h2>
        <div class="griglia-campi">
          ${giorni.map((g, i) => html`<${SelezioneScheda} key=${g.data} etichetta=${formatoData(g.data)} valore=${valori[i]} onCambia=${(v) => imposta(i, v)} />`)}
        </div>
      </div>
      <div class="card" role="group" aria-label="Sposta giorno">
        <h3 class="sottotitolo">Sposta giorno</h3>
        <div class="griglia-campi">
          ${opzioniGiorno(da, setDa, 'Sposta da')}
          ${opzioniGiorno(a, setA, 'Sposta a')}
        </div>
        ${inSospeso && html`<p class="secondario">Salva o annulla le modifiche ai giorni prima di spostare</p>`}
        <button type="button" class="pulsante" disabled=${!puoScrivere || inCorso || inSospeso || !da || !a || da === a} onClick=${sposta}>Sposta giorno</button>
      </div>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <div class="azioni-editor">
        <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso || !inSospeso} onClick=${salva}>Salva</button>
        <button type="button" class="pulsante" onClick=${annulla}>Annulla</button>
      </div>
    </div>`;
}

// ---------- editor: nuova versione ----------
export function EditorNuovaVersione({ onChiudi }) {
  const { dati, store, oggi, puoScrivere, segnalaRifiuto, setSporco } = useContext(Contesto);
  const precompilata = (data) => {
    const v = DATA_OK.test(data) ? versioneValida(dati.settimane, data) : null;
    return Object.fromEntries(GIORNI.map((g) => [g, v?.giorni?.[g] ?? '']));
  };
  const inizio = aggiungiGiorni(lunediDi(oggi), 7);
  const [validaDal, setValidaDal] = useState(inizio);
  const [giorni, setGiorni] = useState(() => precompilata(inizio));
  const [toccato, setToccato] = useState(false);
  const [tentato, setTentato] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  const [inCorso, setInCorso] = useState(false);
  // Una nuova versione non riscrive il passato: "Valida dal" ≥ oggi. Fa eccezione la prima versione
  // (non c'è storia da riscrivere): così la prima settimana tipo può valere anche per i giorni già passati.
  const primaVersione = dati.settimane.length === 0;
  const nelPassato = !primaVersione && DATA_OK.test(validaDal) && validaDal < oggi;
  const errore = !tentato ? undefined : !DATA_OK.test(validaDal) ? 'Campo obbligatorio' : nelPassato ? MSG_DATA_PASSATA : undefined;

  const cambiaData = (v) => {
    setValidaDal(v);
    if (!toccato) setGiorni(precompilata(v));
    setSporco(true);
  };
  const cambiaGiorno = (g, v) => { setGiorni({ ...giorni, [g]: v }); setToccato(true); setSporco(true); };

  async function salva() {
    setTentato(true);
    setMessaggio(null);
    if (!DATA_OK.test(validaDal) || nelPassato) return;
    setInCorso(true);
    try {
      await store.salvaSettimana({ validaDal, giorni: Object.fromEntries(GIORNI.map((g) => [g, giorni[g] || null])) });
      setSporco(false);
      onChiudi?.();
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
    } finally {
      setInCorso(false);
    }
  }
  const annulla = () => { setSporco(false); onChiudi?.(); };

  return html`
    <div class="editor-settimana">
      <div class="card">
        <h2 class="titolo-blocco">Nuova versione da una data…</h2>
        <${Campo} etichetta="Valida dal" errore=${errore}>
          <input type="date" value=${validaDal} min=${primaVersione ? undefined : oggi} onInput=${(e) => cambiaData(e.target.value)} />
        </${Campo}>
        <div class="griglia-campi">
          ${GIORNI.map((g, i) => html`<${SelezioneScheda} key=${g} etichetta=${NOMI_GIORNI[i]} valore=${giorni[g]} onCambia=${(v) => cambiaGiorno(g, v)} />`)}
        </div>
      </div>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <div class="azioni-editor">
        <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso} onClick=${salva}>Salva</button>
        <button type="button" class="pulsante" onClick=${annulla}>Annulla</button>
      </div>
    </div>`;
}

// ---------- vista ----------
function riassuntoBlocchi(rev) {
  if (!rev) return 'Nessun dato';
  if (rev.obiettivo) return rev.obiettivo.descrizione || 'Nessun dato';
  const n = (l) => (l ?? []).length;
  return `Riscaldamento ${n(rev.riscaldamento)} · Principale ${n(rev.principale)} · Stretching ${n(rev.stretching)}`;
}

function CardGiorno({ giorno, indice, onAssegna }) {
  const { dati, store, oggi, puoScrivere, segnalaRifiuto, nomi } = useContext(Contesto);
  const [errore, setErrore] = useState(null);
  const { data, schedaId, eccezione } = giorno;
  const scheda = schedaId ? dati.schede[schedaId] : null;
  const rev = scheda ? revisionePerGiorno(dati.revisioni[schedaId] ?? [], data) : null;
  const èOggi = data === oggi;
  const passato = data < oggi;
  const completati = scheda ? statoBlocchi(rev, dati.diario[data]).completati : 0;
  const diario = èOggi ? `${completati}/3` : completati === 3 ? 'Fatto' : completati === 0 ? 'Non fatto' : `${completati}/3`;
  const autore = eccezione?.autore ? nomi([eccezione.autore])[eccezione.autore] ?? 'Qualcuno' : null;
  const classi = ['card-giorno', 'card', èOggi && 'oggi', eccezione && 'eccezione'].filter(Boolean).join(' ');

  async function ripristina() {
    setErrore(null);
    try { await store.annullaEccezione(data); } catch (e) { setErrore(segnalaRifiuto(e)); }
  }

  return html`
    <article class=${classi} aria-label=${formatoData(data)}>
      <header class="giorno-testata">
        <span class="giorno-etichetta numero">${`${GIORNI[indice].toUpperCase()} ${Number(data.slice(8))}`}</span>
        ${èOggi && html`<span class="giorno-oggi">OGGI</span>`}
      </header>
      ${schedaId
    ? html`
          <strong class="giorno-scheda">${scheda ? scheda.nome : 'Scheda non disponibile'}</strong>
          ${scheda && html`<span class="secondario">${TIPI[scheda.tipo] ?? scheda.tipo}</span>`}
          ${scheda && html`<span class="secondario giorno-blocchi">${riassuntoBlocchi(rev)}</span>`}
          ${scheda && (passato || èOggi) && html`<span class="giorno-diario">${diario}</span>`}`
    : html`<strong class="giorno-scheda">Riposo</strong>`}
      ${eccezione && html`
        <div class="giorno-eccezione">
          <span class="etichetta-eccezione">Eccezione</span>
          <span class="secondario">${`da ${autore} · ${formatoDataIso(eccezione.creataIl)}`}</span>
          ${eccezione.origine && html`<span class="secondario">${`Spostata da ${giornoSettimana(eccezione.origine)}`}</span>`}
          <button type="button" class="pulsante" disabled=${!puoScrivere} onClick=${ripristina}>Ripristina</button>
        </div>`}
      ${!schedaId && html`<button type="button" class="pulsante" disabled=${!puoScrivere} onClick=${() => onAssegna(data)}>+ Assegna scheda</button>`}
      ${errore && html`<p class="errore-scrittura" role="alert">${errore}</p>`}
    </article>`;
}

function Intestazione({ onSolo, onNuova }) {
  const { dati, oggi, puoScrivere, nomi } = useContext(Contesto);
  const [cronologia, setCronologia] = useState(false);
  const attuale = versioneValida(dati.settimane, oggi);
  const future = versioniFuture(dati.settimane, oggi);
  const tutte = [...dati.settimane].sort((a, b) => (a.validaDal < b.validaDal ? 1 : -1));
  const autori = nomi(tutte.map((v) => v.autore));
  const di = (v) => autori[v.autore] ?? 'Qualcuno';
  const chi = (v) => `creata da ${di(v)} il ${formatoDataIso(v.creataIl)}`;
  return html`
    <div class="card intestazione-settimana">
      <p class="versione-attuale">${attuale
    ? `In vigore dal ${formatoData(attuale.validaDal)} · versione ${attuale.numero} · ${chi(attuale)}`
    : 'Nessuna versione in vigore'}</p>
      ${future.map((v) => html`<p key=${v.id} class="secondario">${`In programma dal ${formatoData(v.validaDal)}`}</p>`)}
      <div class="azioni-editor">
        <button type="button" class="pulsante primario" disabled=${!puoScrivere} onClick=${onSolo}>Modifica solo questa settimana</button>
        <button type="button" class="pulsante" disabled=${!puoScrivere} onClick=${onNuova}>Nuova versione da una data…</button>
        <button type="button" class="pulsante" aria-expanded=${cronologia} onClick=${() => setCronologia(!cronologia)}>Cronologia</button>
      </div>
      ${cronologia && html`
        <ul class="lista-righe" aria-label="Cronologia versioni">
          ${tutte.map((v) => html`<li key=${v.id} class="card-interna riga-cronologia">${`Versione ${v.numero} · dal ${formatoData(v.validaDal)} · ${chi(v)}`}</li>`)}
        </ul>`}
    </div>`;
}

function ComeSta() {
  const { dati, oggi } = useContext(Contesto);
  const data = Object.keys(dati.diario).sort().reverse()
    .find((d) => d <= oggi && ((dati.diario[d].nota ?? '').trim() || dati.diario[d].sensazione != null));
  const voce = data ? dati.diario[data] : null;
  const parti = voce && [
    (voce.nota ?? '').trim() ? `“${voce.nota.trim()}”` : null,
    voce.sensazione != null ? `Sensazione ${voce.sensazione}/5` : null,
  ].filter(Boolean);
  return html`
    <section class="card come-sta" role="region" aria-label="Come sta">
      <h2 class="titolo-blocco">Come sta</h2>
      <p class="secondario">${voce ? `Ultima nota · ${formatoData(data)}: ${parti.join(' · ')}` : 'Nessun dato'}</p>
    </section>`;
}

export function SezioneSettimana() {
  const { dati, oggi, store, puoScrivere, segnalaRifiuto, vai } = useContext(Contesto);
  const [lunedi, setLunedi] = useState(() => lunediDi(oggi));
  const [editor, setEditor] = useState(null);
  const [assegna, setAssegna] = useState(null);
  const [messaggio, setMessaggio] = useState(null);
  const chiudi = () => setEditor(null);

  const titolo = html`<h1 class="titolo-sezione">Settimana tipo</h1>`;
  if (editor === 'solo') return html`<section class="sezione">${titolo}<${EditorSoloQuestaSettimana} lunedi=${lunedi} onChiudi=${chiudi} /></section>`;
  if (editor === 'nuova') return html`<section class="sezione">${titolo}<${EditorNuovaVersione} onChiudi=${chiudi} /></section>`;
  if (dati.settimane.length === 0) {
    return html`<section class="sezione">${titolo}
      <${Vuoto} testo="Nessuna settimana tipo" azione=${{ testo: 'Crea la prima settimana tipo', disabled: !puoScrivere, onClick: () => setEditor('nuova') }} /></section>`;
  }

  const giorni = risolviSettimana(lunedi, dati);
  const etichetta = (l) => {
    const intervallo = `${formatoData(l)} – ${formatoData(aggiungiGiorni(l, 6))}`;
    return l === lunediDi(oggi) ? `Questa settimana · ${intervallo}` : intervallo;
  };
  async function scegli(schedaId) {
    const data = assegna;
    setMessaggio(null);
    try {
      await store.impostaEccezione(data, schedaId);
      setAssegna(null);
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
    }
  }

  return html`
    <section class="sezione">
      ${titolo}
      <${Intestazione} onSolo=${() => setEditor('solo')} onNuova=${() => setEditor('nuova')} />
      <div class="settimana-layout">
        <div class="settimana-principale">
          <${SelettoreData} data=${lunedi} passo=${7} formato=${etichetta} onCambia=${setLunedi} />
          <div class="giorni-settimana">
            ${giorni.map((g, i) => html`<${CardGiorno} key=${g.data} giorno=${g} indice=${i} onAssegna=${(d) => { setMessaggio(null); setAssegna(d); }} />`)}
          </div>
        </div>
        <aside class="settimana-laterale">
          <section class="card" role="region" aria-label="Libreria schede">
            <h2 class="titolo-blocco">Libreria schede</h2>
            <${ElencoSchede} onScegli=${() => vai('schede')} />
          </section>
          <${ComeSta} />
        </aside>
      </div>
      ${assegna && html`
        <${Dialogo} titolo=${`Assegna una scheda a ${formatoData(assegna)}`} azioni=${[{ testo: 'Annulla', onClick: () => setAssegna(null) }]}>
          <${ElencoSchede} onScegli=${scegli} />
          ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
        </${Dialogo}>`}
    </section>`;
}
