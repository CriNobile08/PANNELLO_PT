import { html, useState, useMemo, useContext, useRef } from '../html.js';
import { Contesto } from '../contesto.js';
import { Campo, Dialogo, Vuoto } from '../componenti.js';
import { validaScheda, numeroDaInput } from '../../logic/validazione.js';
import { oraRoma, formatoData } from '../../logic/date.js';

const TIPI = [['palestra', 'Palestra'], ['corsa', 'Corsa'], ['trekking', 'Trekking'], ['altro', 'Altro']];
const nomeTipo = (t) => TIPI.find(([v]) => v === t)?.[1] ?? t;
const conObiettivo = (tipo) => tipo === 'corsa' || tipo === 'trekking';
const coloreTipo = (tipo) => (conObiettivo(tipo) ? '#2BC4A6' : '#5B9BFF');

// ---------- bozza (tutti i numeri sono testo finché non si salva) ----------
const testo = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const num = (t) => numeroDaInput(t);

const nuovoEsercizio = () => ({ nome: '', durataSec: '', serie: '', ripetizioni: '', perLato: false, nota: '' });
const nuovoPrincipale = () => ({ nome: '', serie: '', ripetizioni: '', caricoKg: '', recuperoSec: '', nota: '' });
const obiettivoVuoto = () => ({ descrizione: '', distanzaKm: '', dislivelloM: '' });

const daEsercizio = (e) => ({ nome: e.nome ?? '', durataSec: testo(e.durataSec), serie: testo(e.serie), ripetizioni: testo(e.ripetizioni), perLato: !!e.perLato, nota: e.nota ?? '' });
const daPrincipale = (e) => ({ nome: e.nome ?? '', serie: testo(e.serie), ripetizioni: testo(e.ripetizioni), caricoKg: testo(e.caricoKg), recuperoSec: testo(e.recuperoSec), nota: e.nota ?? '' });

function bozzaDa(scheda, rev) {
  const o = rev?.obiettivo;
  return {
    nome: scheda?.nome ?? '', tipo: scheda?.tipo ?? 'palestra',
    nota: rev?.nota ?? '', durata: testo(rev?.durataStimataMin),
    riscaldamento: (rev?.riscaldamento ?? []).map(daEsercizio),
    principale: (rev?.principale ?? []).map(daPrincipale),
    obiettivo: o ? { descrizione: o.descrizione ?? '', distanzaKm: testo(o.distanzaKm), dislivelloM: testo(o.dislivelloM) } : obiettivoVuoto(),
    stretching: (rev?.stretching ?? []).map(daEsercizio),
  };
}

/** Contenuto con i numeri ancora in testo: va a validaScheda, che li legge con numeroDaInput. */
function contenutoGrezzo(b) {
  const c = { nota: b.nota, durataStimataMin: b.durata, riscaldamento: b.riscaldamento, stretching: b.stretching };
  if (conObiettivo(b.tipo)) c.obiettivo = b.obiettivo; else c.principale = b.principale;
  return c;
}

/** Contenuto da salvare: numeri veri (numeroDaInput), null dove il campo è vuoto. */
function contenutoPerSalvare(b) {
  const esercizio = (e) => ({ nome: e.nome.trim(), durataSec: num(e.durataSec), serie: num(e.serie), ripetizioni: num(e.ripetizioni), perLato: e.perLato, nota: e.nota });
  const c = { nota: b.nota, durataStimataMin: num(b.durata), riscaldamento: b.riscaldamento.map(esercizio), stretching: b.stretching.map(esercizio) };
  if (conObiettivo(b.tipo)) {
    const o = b.obiettivo;
    c.obiettivo = { descrizione: o.descrizione.trim(), distanzaKm: num(o.distanzaKm), dislivelloM: num(o.dislivelloM) };
  } else {
    c.principale = b.principale.map((e) => ({
      nome: e.nome.trim(), serie: num(e.serie), ripetizioni: num(e.ripetizioni), caricoKg: num(e.caricoKg),
      recuperoSec: num(e.recuperoSec), nota: e.nota, hevyTemplateId: null,
    }));
  }
  return c;
}

const sposta = (lista, i, d) => {
  const j = i + d;
  if (j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
};

// ---------- libreria ----------
const esercizi = (n) => `${n} ${n === 1 ? 'esercizio' : 'esercizi'}`;

/** Ricerca e schede (non archiviate, salvo `mostraArchiviate`). Riusabile come selettore con `onScegli`. */
export function ElencoSchede({ onScegli, mostraArchiviate = false }) {
  const { dati } = useContext(Contesto);
  const [ricerca, setRicerca] = useState('');
  const q = ricerca.trim().toLowerCase();
  const righe = Object.values(dati.schede)
    .filter((s) => (mostraArchiviate || !s.archiviata) && s.nome.toLowerCase().includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const dettaglio = (s) => {
    if (conObiettivo(s.tipo)) return nomeTipo(s.tipo);
    const rev = (dati.revisioni[s.id] ?? []).find((r) => r.id === s.revisioneCorrente);
    return rev ? esercizi((rev.principale ?? []).length) : nomeTipo(s.tipo);
  };
  return html`
    <div class="elenco-schede">
      <${Campo} etichetta="Cerca una scheda">
        <input type="search" value=${ricerca} onInput=${(e) => setRicerca(e.target.value)} />
      </${Campo}>
      ${righe.length === 0
    ? html`<${Vuoto} testo=${q ? 'Nessuna scheda trovata' : 'Nessun dato'} />`
    : html`<ul class="lista-righe">${righe.map((s) => html`
          <li key=${s.id}>
            <button type="button" class="riga-scheda card-interna" onClick=${() => onScegli?.(s.id)}>
              <span class="punto" style=${{ background: coloreTipo(s.tipo) }}></span>
              <span class="riga-nome">${s.nome}</span>
              <span class="riga-dettaglio secondario">${s.archiviata ? 'Archiviata' : dettaglio(s)}</span>
            </button>
          </li>`)}</ul>`}
    </div>`;
}

// ---------- editor ----------
function Riga({ blocco, i, n, nomeRiga, onSposta, onRimuovi, children }) {
  return html`
    <div class="riga-esercizio card-interna" role="group" aria-label=${`${nomeRiga} ${i + 1}`}>
      <div class="griglia-campi">${children}</div>
      <div class="azioni-riga">
        <button type="button" class="pulsante" disabled=${i === 0} onClick=${() => onSposta(-1)}>Sposta su</button>
        <button type="button" class="pulsante" disabled=${i === n - 1} onClick=${() => onSposta(1)}>Sposta giù</button>
        <button type="button" class="pulsante" onClick=${onRimuovi}>Rimuovi</button>
      </div>
    </div>`;
}

function Blocco({ titolo, children }) {
  return html`
    <section class="blocco card" role="region" aria-label=${titolo}>
      <h2 class="titolo-blocco">${titolo}</h2>
      ${children}
    </section>`;
}

function ListaEsercizi({ titolo, lista, errori, prefisso, onCambia, principale = false }) {
  const imposta = (i, campo, v) => onCambia(lista.map((e, k) => (k === i ? { ...e, [campo]: v } : e)));
  const campo = (i, chiave, etichetta, extra = {}) => html`
    <${Campo} etichetta=${etichetta} errore=${errori[`${prefisso}.${i}.${chiave}`]}>
      <input type="text" value=${lista[i][chiave]} onInput=${(e) => imposta(i, chiave, e.target.value)} ...${extra} />
    </${Campo}>`;
  const intero = { inputmode: 'numeric' };
  const decimale = { inputmode: 'decimal' };
  return html`
    <${Blocco} titolo=${titolo}>
      ${lista.map((e, i) => html`
        <${Riga} key=${i} i=${i} n=${lista.length} nomeRiga="Esercizio"
          onSposta=${(d) => onCambia(sposta(lista, i, d))} onRimuovi=${() => onCambia(lista.filter((_, k) => k !== i))}>
          ${campo(i, 'nome', 'Nome')}
          ${principale
    ? html`${campo(i, 'serie', 'Serie', intero)}${campo(i, 'ripetizioni', 'Ripetizioni', intero)}
              ${campo(i, 'caricoKg', 'Carico (kg)', decimale)}${campo(i, 'recuperoSec', 'Recupero (s)', intero)}`
    : html`${campo(i, 'durataSec', 'Durata (s)', intero)}${campo(i, 'serie', 'Serie', intero)}${campo(i, 'ripetizioni', 'Ripetizioni', intero)}
              <label class="campo-spunta"><input type="checkbox" checked=${e.perLato} onChange=${(ev) => imposta(i, 'perLato', ev.target.checked)} /> Per lato</label>`}
          ${campo(i, 'nota', 'Nota')}
        </${Riga}>`)}
      <button type="button" class="pulsante" onClick=${() => onCambia([...lista, principale ? nuovoPrincipale() : nuovoEsercizio()])}>+ Aggiungi esercizio</button>
    </${Blocco}>`;
}

function Obiettivo({ valore, errori, onCambia }) {
  const imposta = (k, v) => onCambia({ ...valore, [k]: v });
  return html`
    <${Blocco} titolo="Obiettivo">
      <div class="griglia-campi">
        <${Campo} etichetta="Descrizione" errore=${errori['obiettivo.descrizione']}>
          <input type="text" value=${valore.descrizione} onInput=${(e) => imposta('descrizione', e.target.value)} />
        </${Campo}>
        <${Campo} etichetta="Distanza (km)" errore=${errori['obiettivo.distanzaKm']}>
          <input type="text" inputmode="decimal" value=${valore.distanzaKm} onInput=${(e) => imposta('distanzaKm', e.target.value)} />
        </${Campo}>
        <${Campo} etichetta="Dislivello (m)" errore=${errori['obiettivo.dislivelloM']}>
          <input type="text" inputmode="decimal" value=${valore.dislivelloM} onInput=${(e) => imposta('dislivelloM', e.target.value)} />
        </${Campo}>
      </div>
    </${Blocco}>`;
}

function Sintesi({ titolo, righe }) {
  if (!righe.length) return null;
  return html`<div><h3 class="sottotitolo">${titolo}</h3><ul>${righe.map((r, i) => html`<li key=${i}>${r}</li>`)}</ul></div>`;
}

/** Revisione in sola lettura. */
function VistaRevisione({ rev, tipo, onChiudi, nomeAutore }) {
  const e = (x) => [x.nome, x.serie && `${x.serie} serie`, x.ripetizioni && `${x.ripetizioni} rip.`, x.durataSec && `${x.durataSec} s`,
    x.caricoKg !== null && x.caricoKg !== undefined && `${testo(x.caricoKg)} kg`, x.recuperoSec && `rec. ${x.recuperoSec} s`, x.nota].filter(Boolean).join(' · ');
  const o = rev.obiettivo;
  return html`
    <div class="card-interna vista-revisione">
      <h3 class="sottotitolo">Revisione del ${formatoData(rev.validaDal)} · ${nomeAutore} · ${oraRoma(rev.salvataIl)}</h3>
      ${rev.nota && html`<p>${rev.nota}</p>`}
      ${rev.durataStimataMin ? html`<p class="secondario">Durata stimata: ${rev.durataStimataMin} min</p>` : null}
      <${Sintesi} titolo="Riscaldamento" righe=${(rev.riscaldamento ?? []).map(e)} />
      ${conObiettivo(tipo) && o
    ? html`<${Sintesi} titolo="Obiettivo" righe=${[[o.descrizione, o.distanzaKm && `${testo(o.distanzaKm)} km`, o.dislivelloM && `${testo(o.dislivelloM)} m`].filter(Boolean).join(' · ')]} />`
    : html`<${Sintesi} titolo="Parte principale" righe=${(rev.principale ?? []).map(e)} />`}
      <${Sintesi} titolo="Stretching" righe=${(rev.stretching ?? []).map(e)} />
      <button type="button" class="pulsante" onClick=${onChiudi}>Chiudi revisione</button>
    </div>`;
}

/** Editor di una scheda (`schedaId` null = nuova). `onChiudi(schedaId?)` a salvataggio, archiviazione o uscita. */
export function EditorScheda({ schedaId, onChiudi }) {
  const { dati, store, puoScrivere, segnalaRifiuto, nomi, setSporco } = useContext(Contesto);
  const ultimiDati = useRef(dati);
  ultimiDati.current = dati;

  const scheda = schedaId ? dati.schede[schedaId] : null;
  const revisioni = schedaId ? dati.revisioni[schedaId] ?? [] : [];
  const correnteDi = (s, lista) => lista.find((r) => r.id === s?.revisioneCorrente) ?? null;

  // la bozza e "revisioneAttesa" si fissano al caricamento dell'editor
  const [bozza, setBozza] = useState(() => bozzaDa(scheda, correnteDi(scheda, revisioni)));
  const [attesa, setAttesa] = useState(scheda?.revisioneCorrente ?? null);
  const [modificata, setModificata] = useState(false);
  const [tentato, setTentato] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  const [conflitto, setConflitto] = useState(null); // { revisione }
  const [inUso, setInUso] = useState(null);         // elenco usi
  const [esci, setEsci] = useState(false);
  const [vista, setVista] = useState(null);         // revisione aperta in sola lettura

  const cambia = (parte) => {
    setBozza((b) => ({ ...b, ...parte }));
    setModificata(true);
    setSporco(true);
  };

  const errori = useMemo(() => {
    if (!tentato) return {};
    const m = {};
    for (const e of validaScheda({ nome: bozza.nome, tipo: bozza.tipo }, contenutoGrezzo(bozza))) m[e.campo] ??= e.messaggio;
    return m;
  }, [tentato, bozza]);

  async function salva(forza = false) {
    setTentato(true);
    setMessaggio(null);
    if (validaScheda({ nome: bozza.nome, tipo: bozza.tipo }, contenutoGrezzo(bozza)).length) return;
    setInCorso(true);
    try {
      const r = await store.salvaScheda({
        schedaId: schedaId ?? null, nome: bozza.nome.trim(), tipo: bozza.tipo,
        contenuto: contenutoPerSalvare(bozza), revisioneAttesa: attesa, forza,
      });
      if (r.esito === 'conflitto') { setConflitto({ revisione: r.revisione }); return; }
      setSporco(false);
      onChiudi?.(r.schedaId);
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
    } finally {
      setInCorso(false);
    }
  }

  function vediModifiche() {
    const d = ultimiDati.current;
    const s = d.schede[schedaId] ?? scheda;
    const rev = correnteDi(s, d.revisioni[schedaId] ?? []) ?? conflitto?.revisione ?? null;
    setBozza(bozzaDa(s, rev));
    setAttesa(s?.revisioneCorrente ?? null);
    setModificata(false);
    setSporco(false);
    setTentato(false);
    setConflitto(null);
  }

  async function archivia() {
    setMessaggio(null);
    try {
      const r = await store.archiviaScheda(schedaId);
      if (r.esito === 'in_uso') { setInUso(r.usi); return; }
      setSporco(false);
      onChiudi?.();
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
    }
  }

  const torna = () => { if (modificata) setEsci(true); else onChiudi?.(); };

  if (schedaId && !scheda) {
    return html`<${Vuoto} testo="Nessun dato" azione=${{ testo: 'Torna alle schede', onClick: () => onChiudi?.() }} />`;
  }

  const autoreConflitto = conflitto?.revisione?.autore;
  const nomeConflitto = autoreConflitto ? nomi([autoreConflitto])[autoreConflitto] ?? 'Qualcuno' : 'Qualcuno';
  const oraConflitto = conflitto?.revisione?.salvataIl ? ` alle ${oraRoma(conflitto.revisione.salvataIl)}` : '';
  const ordinate = [...revisioni].sort((a, b) => (a.salvataIl < b.salvataIl ? 1 : -1));
  const autori = nomi(ordinate.map((r) => r.autore));
  const autoreDi = (r) => autori[r.autore] ?? 'Qualcuno';
  const obiettivo = conObiettivo(bozza.tipo);

  return html`
    <div class="editor-scheda">
      <button type="button" class="pulsante" onClick=${torna}>Torna alle schede</button>
      <div class="card">
        <div class="griglia-campi">
          <${Campo} etichetta="Nome della scheda" errore=${errori.nome}>
            <input type="text" value=${bozza.nome} onInput=${(e) => cambia({ nome: e.target.value })} />
          </${Campo}>
          <${Campo} etichetta="Tipo">
            <select value=${bozza.tipo} onChange=${(e) => cambia({ tipo: e.target.value })}>
              ${TIPI.map(([v, t]) => html`<option value=${v} selected=${bozza.tipo === v}>${t}</option>`)}
            </select>
          </${Campo}>
          <${Campo} etichetta="Durata stimata (min)">
            <input type="text" inputmode="numeric" value=${bozza.durata} onInput=${(e) => cambia({ durata: e.target.value })} />
          </${Campo}>
        </div>
        <${Campo} etichetta="Nota del trainer">
          <textarea value=${bozza.nota} onInput=${(e) => cambia({ nota: e.target.value })}></textarea>
        </${Campo}>
      </div>

      <${ListaEsercizi} titolo="Riscaldamento" prefisso="riscaldamento" lista=${bozza.riscaldamento} errori=${errori}
        onCambia=${(l) => cambia({ riscaldamento: l })} />
      ${obiettivo
    ? html`<${Obiettivo} valore=${bozza.obiettivo} errori=${errori} onCambia=${(o) => cambia({ obiettivo: o })} />`
    : html`<${ListaEsercizi} titolo="Parte principale" prefisso="principale" principale=${true} lista=${bozza.principale} errori=${errori}
        onCambia=${(l) => cambia({ principale: l })} />`}
      <${ListaEsercizi} titolo="Stretching" prefisso="stretching" lista=${bozza.stretching} errori=${errori}
        onCambia=${(l) => cambia({ stretching: l })} />

      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <div class="azioni-editor">
        <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso} onClick=${() => salva(false)}>Salva</button>
        ${schedaId && html`<button type="button" class="pulsante" disabled=${!puoScrivere || inCorso} onClick=${archivia}>Archivia</button>`}
      </div>

      ${schedaId && html`
        <section class="card cronologia" role="region" aria-label="Cronologia revisioni">
          <h2 class="titolo-blocco">Cronologia revisioni</h2>
          <ul class="lista-righe">${ordinate.map((r) => html`
            <li key=${r.id}>
              <button type="button" class="riga-scheda card-interna" onClick=${() => setVista(r)}>
                <span class="riga-nome">${formatoData(r.validaDal)} · ${autoreDi(r)} · ${oraRoma(r.salvataIl)}</span>
              </button>
            </li>`)}</ul>
          ${vista && html`<${VistaRevisione} rev=${vista} tipo=${bozza.tipo} nomeAutore=${autoreDi(vista)} onChiudi=${() => setVista(null)} />`}
        </section>`}

      ${conflitto && html`
        <${Dialogo} titolo=${`La scheda è stata modificata da ${nomeConflitto}${oraConflitto}`}
          azioni=${[
    { testo: 'Annulla', onClick: () => setConflitto(null) },
    { testo: 'Vedi le sue modifiche', onClick: vediModifiche },
    { testo: 'Sovrascrivi', primaria: true, onClick: () => { setConflitto(null); salva(true); } },
  ]} />`}
      ${inUso && html`
        <${Dialogo} titolo="Impossibile archiviare: la scheda è in uso" azioni=${[{ testo: 'Chiudi', primaria: true, onClick: () => setInUso(null) }]}>
          <ul>${inUso.map((u, i) => html`<li key=${i}>${u.tipo === 'settimana'
    ? `Settimana tipo n. ${u.versione.numero} (dal ${formatoData(u.versione.validaDal)})`
    : `Eccezione del ${formatoData(u.data)}`}</li>`)}</ul>
        </${Dialogo}>`}
      ${esci && html`
        <${Dialogo} titolo="Hai modifiche non salvate. Uscire senza salvare?" azioni=${[
    { testo: 'Resta', onClick: () => setEsci(false) },
    { testo: 'Esci senza salvare', primaria: true, onClick: () => { setSporco(false); onChiudi?.(); } },
  ]} />`}
    </div>`;
}

// ---------- sezione ----------
export function SezioneSchede() {
  const { puoScrivere } = useContext(Contesto);
  const [editor, setEditor] = useState(null); // null = libreria; { schedaId }
  const [archiviate, setArchiviate] = useState(false);
  return html`
    <section class="sezione">
      <h1 class="titolo-sezione">Schede di allenamento</h1>
      ${editor
    ? html`<${EditorScheda} key=${editor.schedaId ?? 'nuova'} schedaId=${editor.schedaId} onChiudi=${() => setEditor(null)} />`
    : html`
        <div class="barra-libreria">
          <button type="button" class="pulsante primario" disabled=${!puoScrivere} onClick=${() => setEditor({ schedaId: null })}>+ Nuova scheda</button>
          <label class="campo-spunta">
            <input type="checkbox" role="switch" checked=${archiviate} onChange=${(e) => setArchiviate(e.target.checked)} />
            Mostra archiviate
          </label>
        </div>
        <${ElencoSchede} mostraArchiviate=${archiviate} onScegli=${(id) => setEditor({ schedaId: id })} />`}
    </section>`;
}
