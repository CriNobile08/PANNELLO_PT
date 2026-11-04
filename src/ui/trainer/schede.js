import { html, useState, useMemo, useContext, useRef } from '../html.js';
import { Contesto } from '../contesto.js';
import { Campo, Dialogo, Vuoto } from '../componenti.js';
import { validaScheda, numeroDaInput } from '../../logic/validazione.js';
import { oraRoma, formatoData } from '../../logic/date.js';
import { ETICHETTE_GRUPPI, ETICHETTE_ATTREZZI, ETICHETTE_CATEGORIE, etichetta } from '../../logic/catalogo.js';
import { SelettoreEsercizio } from './selettore-esercizio.js';
import CATALOGO_RISCALDAMENTO from '../../data/catalogo-riscaldamento.json' with { type: 'json' };

const TIPI = [['palestra', 'Palestra'], ['corsa', 'Corsa'], ['trekking', 'Trekking'], ['altro', 'Altro']];
const nomeTipo = (t) => TIPI.find(([v]) => v === t)?.[1] ?? t;
const conObiettivo = (tipo) => tipo === 'corsa' || tipo === 'trekking';
const coloreTipo = (tipo) => (conObiettivo(tipo) ? '#2BC4A6' : '#5B9BFF');

// ---------- bozza (tutti i numeri sono testo finché non si salva) ----------
const testo = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const num = (t) => numeroDaInput(t);

// `chiave`: identità stabile della riga nella bozza (lo stato del selettore segue la riga quando si sposta); non si salva.
let ultimaChiave = 0;
const chiave = () => ++ultimaChiave;
const idONull = (v) => (typeof v === 'string' && v !== '' ? v : null);

const nuovoEsercizio = () => ({ chiave: chiave(), nome: '', idCatalogo: null, durataSec: '', serie: '', ripetizioni: '', perLato: false, nota: '' });
const nuovoPrincipale = () => ({ chiave: chiave(), nome: '', hevyTemplateId: null, serie: '', ripetizioni: '', caricoKg: '', recuperoSec: '', nota: '' });
const obiettivoVuoto = () => ({ descrizione: '', distanzaKm: '', dislivelloM: '' });

const daEsercizio = (e) => ({ chiave: chiave(), nome: e.nome ?? '', idCatalogo: idONull(e.idCatalogo), durataSec: testo(e.durataSec), serie: testo(e.serie), ripetizioni: testo(e.ripetizioni), perLato: !!e.perLato, nota: e.nota ?? '' });
const daPrincipale = (e) => ({ chiave: chiave(), nome: e.nome ?? '', hevyTemplateId: idONull(e.hevyTemplateId), serie: testo(e.serie), ripetizioni: testo(e.ripetizioni), caricoKg: testo(e.caricoKg), recuperoSec: testo(e.recuperoSec), nota: e.nota ?? '' });

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
  const esercizio = (e) => ({ nome: e.nome.trim(), idCatalogo: idONull(e.idCatalogo), durataSec: num(e.durataSec), serie: num(e.serie), ripetizioni: num(e.ripetizioni), perLato: e.perLato, nota: e.nota });
  const c = { nota: b.nota, durataStimataMin: num(b.durata), riscaldamento: b.riscaldamento.map(esercizio), stretching: b.stretching.map(esercizio) };
  if (conObiettivo(b.tipo)) {
    const o = b.obiettivo;
    c.obiettivo = { descrizione: o.descrizione.trim(), distanzaKm: num(o.distanzaKm), dislivelloM: num(o.dislivelloM) };
  } else {
    c.principale = b.principale.map((e) => ({
      nome: e.nome.trim(), serie: num(e.serie), ripetizioni: num(e.ripetizioni), caricoKg: num(e.caricoKg),
      recuperoSec: num(e.recuperoSec), nota: e.nota, hevyTemplateId: idONull(e.hevyTemplateId),
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

// ---------- cataloghi degli esercizi ----------
const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/** Opzioni di un filtro: i valori presenti nelle voci (anche dentro gli array), ordinati per testo. */
const opzioniDa = (voci, campo, testoDi) => [...new Set(voci.flatMap((v) => (Array.isArray(v[campo]) ? v[campo] : [v[campo]])))]
  .filter((k) => typeof k === 'string' && k !== '')
  .map((k) => [k, testoDi(k)])
  .sort((a, b) => a[1].localeCompare(b[1], 'it'));
const unisci = (parti) => parti.filter(Boolean).join(' · ');

function catalogoLocale(categorie) {
  const voci = CATALOGO_RISCALDAMENTO.filter((v) => categorie.includes(v.categoria));
  return {
    voci,
    campoId: 'idCatalogo',
    filtri: [
      { campo: 'categoria', etichetta: 'Categoria', opzioni: opzioniDa(voci, 'categoria', (k) => etichetta(ETICHETTE_CATEGORIE, k)) },
      { campo: 'muscoli', etichetta: 'Muscolo', opzioni: opzioniDa(voci, 'muscoli', maiuscola) },
    ],
    descrivi: (v) => unisci([etichetta(ETICHETTE_CATEGORIE, v.categoria), (v.muscoli ?? []).join(', ')]),
  };
}
const CATALOGO_RISC = catalogoLocale(['cardio_warmup', 'dynamic_mobility', 'foam_rolling']);
const CATALOGO_STRETCHING = catalogoLocale(['static_stretching', 'foam_rolling']);

/** Catalogo Hevy dal documento `hevy/catalogo`; null se manca o è vuoto. */
function catalogoHevy(doc) {
  const voci = Array.isArray(doc?.esercizi)
    ? doc.esercizi.filter((v) => v && typeof v.id === 'string' && v.id !== '' && typeof v.nome === 'string')
    : [];
  if (!voci.length) return null;
  return {
    voci,
    campoId: 'hevyTemplateId',
    filtri: [
      { campo: 'gruppo', etichetta: 'Gruppo muscolare', opzioni: opzioniDa(voci, 'gruppo', (k) => etichetta(ETICHETTE_GRUPPI, k)) },
      { campo: 'attrezzo', etichetta: 'Attrezzo', opzioni: opzioniDa(voci, 'attrezzo', (k) => etichetta(ETICHETTE_ATTREZZI, k)) },
    ],
    descrivi: (v) => unisci([v.gruppo && etichetta(ETICHETTE_GRUPPI, v.gruppo), v.attrezzo && etichetta(ETICHETTE_ATTREZZI, v.attrezzo)]),
  };
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

function ListaEsercizi({ titolo, lista, errori, prefisso, onCambia, catalogo, campoId, principale = false }) {
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
        <${Riga} key=${e.chiave} i=${i} n=${lista.length} nomeRiga="Esercizio"
          onSposta=${(d) => onCambia(sposta(lista, i, d))} onRimuovi=${() => onCambia(lista.filter((_, k) => k !== i))}>
          <${SelettoreEsercizio} etichetta="Nome" valore=${e} catalogo=${catalogo} campoId=${campoId}
            errore=${errori[`${prefisso}.${i}.nome`]} onCambia=${(v) => onCambia(lista.map((x, k) => (k === i ? { ...x, ...v } : x)))} />
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
  const [confermaArchivia, setConfermaArchivia] = useState(false);
  const [vista, setVista] = useState(null);         // revisione aperta in sola lettura

  const cambia = (parte) => {
    setBozza((b) => ({ ...b, ...parte }));
    setModificata(true);
    setSporco(true);
  };

  const docHevy = dati.hevy?.catalogo;
  const hevy = useMemo(() => catalogoHevy(docHevy), [docHevy]);

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
    setConfermaArchivia(false);
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
        catalogo=${CATALOGO_RISC} campoId="idCatalogo"
        onCambia=${(l) => cambia({ riscaldamento: l })} />
      ${obiettivo
    ? html`<${Obiettivo} valore=${bozza.obiettivo} errori=${errori} onCambia=${(o) => cambia({ obiettivo: o })} />`
    : html`<${ListaEsercizi} titolo="Parte principale" prefisso="principale" principale=${true} lista=${bozza.principale} errori=${errori}
        catalogo=${hevy} campoId="hevyTemplateId"
        onCambia=${(l) => cambia({ principale: l })} />`}
      <${ListaEsercizi} titolo="Stretching" prefisso="stretching" lista=${bozza.stretching} errori=${errori}
        catalogo=${CATALOGO_STRETCHING} campoId="idCatalogo"
        onCambia=${(l) => cambia({ stretching: l })} />

      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <div class="azioni-editor">
        <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso} onClick=${() => salva(false)}>Salva</button>
        ${schedaId && !scheda.archiviata && html`<button type="button" class="pulsante" disabled=${!puoScrivere || inCorso} onClick=${() => setConfermaArchivia(true)}>Archivia</button>`}
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
      ${confermaArchivia && html`
        <${Dialogo} titolo="Archiviare la scheda?" azioni=${[
    { testo: 'Annulla', onClick: () => setConfermaArchivia(false) },
    { testo: 'Archivia', primaria: true, disabled: !puoScrivere, onClick: archivia },
  ]}>
          <p>Non comparirà più nella libreria e nelle assegnazioni.</p>
          ${modificata && html`<p class="avviso-modifiche">Hai modifiche non salvate: andranno perse.</p>`}
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
