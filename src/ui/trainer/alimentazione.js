import { html, useState, useMemo, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Campo, Dialogo, Vuoto } from '../componenti.js';
import { validaPiano, numeroDaInput } from '../../logic/validazione.js';
import { versioneValida, versioniFuture } from '../../logic/versioni.js';
import { formatoData, formatoDataIso } from '../../logic/date.js';

const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;
const MSG_DATA_PASSATA = 'La data non può essere nel passato';
const testo = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

// ---------- bozza (i grammi sono testo finché non si salva) ----------
const nuovoAlimento = () => ({ nome: '', grammi: '' });
const nuovaOpzione = (n) => ({ nome: `Opzione ${n}`, nota: '', alimenti: [nuovoAlimento()] });
const nuovoPasto = () => ({ nome: '', opzioni: [nuovaOpzione(1)] });

function bozzaDa(versione) {
  return {
    indicazioni: versione?.indicazioni ?? '',
    pasti: (versione?.pasti ?? []).map((p) => ({
      nome: p.nome ?? '',
      opzioni: (p.opzioni ?? []).map((o, j) => ({
        nome: o.nome || `Opzione ${j + 1}`, nota: o.nota ?? '',
        alimenti: (o.alimenti ?? []).map((a) => ({ nome: a.nome ?? '', grammi: testo(a.grammi) })),
      })),
    })),
  };
}

function perSalvare(b) {
  return {
    indicazioni: b.indicazioni,
    pasti: b.pasti.map((p) => ({
      nome: p.nome.trim(),
      opzioni: p.opzioni.map((o) => ({
        nome: o.nome, nota: o.nota,
        alimenti: o.alimenti.map((a) => ({ nome: a.nome.trim(), grammi: numeroDaInput(a.grammi) })),
      })),
    })),
  };
}

const sostituisci = (lista, i, valore) => lista.map((x, k) => (k === i ? valore : x));

/** Versioni dalla più recente per validaDal (a parità, numero più alto). */
const perValidita = (versioni) => [...versioni]
  .sort((a, b) => (a.validaDal < b.validaDal ? 1 : a.validaDal > b.validaDal ? -1 : b.numero - a.numero));

// ---------- intestazione ----------
function Intestazione({ sporco, inCorso, onAnnulla, onSalva }) {
  const { dati, oggi, puoScrivere, nomi } = useContext(Contesto);
  const [cronologia, setCronologia] = useState(false);
  const attuale = versioneValida(dati.alimentazione, oggi);
  const future = versioniFuture(dati.alimentazione, oggi);
  const tutte = perValidita(dati.alimentazione);
  const autori = nomi(tutte.map((v) => v.autore));
  const chi = (v) => {
    return `creato da ${autori[v.autore] ?? 'Qualcuno'} il ${formatoDataIso(v.creataIl)}`;
  };
  return html`
    <div class="card intestazione-piano">
      <p class="versione-attuale">${attuale
    ? `In vigore dal ${formatoData(attuale.validaDal)} · versione ${attuale.numero} · ${chi(attuale)}`
    : 'Nessuna versione in vigore'}</p>
      ${future.map((v) => html`<p key=${v.id} class="secondario">${`In programma dal ${formatoData(v.validaDal)}`}</p>`)}
      ${sporco && html`<p class="avviso-modifiche" role="status">Modifiche non salvate</p>`}
      <div class="azioni-editor">
        <button type="button" class="pulsante" disabled=${!sporco} onClick=${onAnnulla}>Annulla</button>
        <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso} onClick=${onSalva}>Salva come nuova versione da…</button>
        ${tutte.length > 0 && html`<button type="button" class="pulsante" aria-expanded=${cronologia} onClick=${() => setCronologia(!cronologia)}>Cronologia</button>`}
      </div>
      ${cronologia && html`
        <ul class="lista-righe" aria-label="Cronologia versioni">
          ${tutte.map((v) => html`<li key=${v.id} class="card-interna riga-cronologia">${`Versione ${v.numero} · dal ${formatoData(v.validaDal)} · ${chi(v)}`}</li>`)}
        </ul>`}
    </div>`;
}

// ---------- pasto ----------
function riassunto(pasto) {
  const primi = pasto.opzioni.map((o) => o.alimenti[0]?.nome?.trim()).filter(Boolean);
  const n = pasto.opzioni.length;
  return [...primi, `${n} ${n === 1 ? 'opzione' : 'opzioni'}`].join(' · ');
}

const haErrori = (errori, prefisso) => Object.keys(errori).some((k) => k === prefisso || k.startsWith(`${prefisso}.`));

function PastoAperto({ pasto, i, errori, opzioneAttiva, onOpzione, onCambia, onRimuovi }) {
  const attiva = Math.min(opzioneAttiva, pasto.opzioni.length - 1);
  const opzione = pasto.opzioni[attiva];
  const percorso = `pasti.${i}.opzioni.${attiva}`;
  const cambiaOpzione = (nuova) => onCambia({ ...pasto, opzioni: sostituisci(pasto.opzioni, attiva, nuova) });
  const cambiaAlimento = (k, parte) => cambiaOpzione({ ...opzione, alimenti: sostituisci(opzione.alimenti, k, { ...opzione.alimenti[k], ...parte }) });
  return html`
    <div class="pasto-aperto">
      <${Campo} etichetta="Nome del pasto" errore=${errori[`pasti.${i}.nome`]}>
        <input type="text" value=${pasto.nome} onInput=${(e) => onCambia({ ...pasto, nome: e.target.value })} />
      </${Campo}>
      <div class="schede-opzione" role="tablist" aria-label="Opzioni">
        ${pasto.opzioni.map((o, j) => html`
          <button key=${j} type="button" role="tab" class=${`pulsante scheda-opzione${j === attiva ? ' attiva' : ''}`} aria-selected=${j === attiva}
            onClick=${() => onOpzione(j)}>${`Opzione ${j + 1}`}${haErrori(errori, `pasti.${i}.opzioni.${j}`) ? html` <span class="da-correggere">Da correggere</span>` : ''}</button>`)}
        <button type="button" class="pulsante" onClick=${() => {
    onCambia({ ...pasto, opzioni: [...pasto.opzioni, nuovaOpzione(pasto.opzioni.length + 1)] });
    onOpzione(pasto.opzioni.length);
  }}>+ Opzione</button>
      </div>
      <div class="opzione" role="tabpanel">
        <button type="button" class="pulsante" aria-label=${`Rimuovi opzione ${attiva + 1}`} disabled=${pasto.opzioni.length <= 1}
          onClick=${() => {
    onCambia({ ...pasto, opzioni: pasto.opzioni.filter((_, x) => x !== attiva).map((o, x) => ({ ...o, nome: `Opzione ${x + 1}` })) });
    onOpzione(Math.max(0, attiva - 1));
  }}>Rimuovi opzione</button>
        ${opzione.alimenti.map((a, k) => html`
          <div key=${`${attiva}-${k}`} class="riga-alimento card-interna" role="group" aria-label=${`Alimento ${k + 1}`}>
            <${Campo} etichetta="Alimento" errore=${errori[`${percorso}.alimenti.${k}.nome`]}>
              <input type="text" value=${a.nome} onInput=${(e) => cambiaAlimento(k, { nome: e.target.value })} />
            </${Campo}>
            <div class="con-suffisso">
              <${Campo} etichetta="Grammi" errore=${errori[`${percorso}.alimenti.${k}.grammi`]}>
                <input type="text" inputmode="decimal" value=${a.grammi} onInput=${(e) => cambiaAlimento(k, { grammi: e.target.value })} />
              </${Campo}>
              <span class="suffisso secondario" aria-hidden="true">g</span>
            </div>
            <button type="button" class="pulsante" onClick=${() => cambiaOpzione({ ...opzione, alimenti: opzione.alimenti.filter((_, x) => x !== k) })}>Rimuovi alimento</button>
          </div>`)}
        <button type="button" class="pulsante" onClick=${() => cambiaOpzione({ ...opzione, alimenti: [...opzione.alimenti, nuovoAlimento()] })}>+ Aggiungi alimento</button>
        <${Campo} etichetta="Nota dell'opzione">
          <textarea value=${opzione.nota} onInput=${(e) => cambiaOpzione({ ...opzione, nota: e.target.value })}></textarea>
        </${Campo}>
      </div>
      <button type="button" class="pulsante" aria-label=${`Rimuovi pasto ${pasto.nome.trim() || i + 1}`} onClick=${onRimuovi}>Rimuovi pasto</button>
    </div>`;
}

// ---------- editor ----------
/** Etichetta di una versione: "Versione n · dal …" più "in vigore" / "in programma". */
function etichettaVersione(v, attuale, oggi) {
  const stato = attuale && v.id === attuale.id ? ' · in vigore' : v.validaDal > oggi ? ' · in programma' : '';
  return `Versione ${v.numero} · dal ${formatoData(v.validaDal)}${stato}`;
}

function Editor() {
  const { dati, store, oggi, puoScrivere, segnalaRifiuto, setSporco } = useContext(Contesto);
  // Base della bozza: di default la versione più recente per validaDal (anche se in programma), così un
  // piano futuro si vede e si modifica; il trainer può caricarne un'altra dal selettore.
  const [versioneId, setVersioneId] = useState(() => perValidita(dati.alimentazione)[0]?.id ?? null);
  const versione = dati.alimentazione.find((v) => v.id === versioneId) ?? null;
  const [base, setBase] = useState(() => bozzaDa(dati.alimentazione.find((v) => v.id === versioneId)));
  const [bozza, setBozza] = useState(base);
  const [sporco, setSporcoLocale] = useState(false);
  const [tentato, setTentato] = useState(false);
  const [aperto, setAperto] = useState(0);
  const [opzioni, setOpzioni] = useState({}); // indice del pasto -> opzione attiva
  const [dialogo, setDialogo] = useState(false);
  const [data, setData] = useState(oggi);
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  const [daCaricare, setDaCaricare] = useState(null); // versione scelta col selettore, in attesa di conferma
  const [giro, setGiro] = useState(0); // rimonta il select dopo "Resta"

  const attuale = versioneValida(dati.alimentazione, oggi);
  const versioni = perValidita(dati.alimentazione);

  function carica(id) {
    const nuova = bozzaDa(dati.alimentazione.find((v) => v.id === id));
    setVersioneId(id);
    setBase(nuova);
    setBozza(nuova);
    setSporcoLocale(false);
    setSporco(false);
    setTentato(false);
    setMessaggio(null);
    setAperto(0);
    setOpzioni({});
    setDaCaricare(null);
  }
  const scegliVersione = (id) => {
    if (id === versioneId) return;
    if (sporco) setDaCaricare(id);
    else carica(id);
  };
  const resta = () => { setDaCaricare(null); setGiro((n) => n + 1); };
  const dataProposta = () => (versione && versione.validaDal > oggi ? versione.validaDal : oggi);

  const cambia = (parte) => {
    setBozza((b) => ({ ...b, ...parte }));
    setSporcoLocale(true);
    setSporco(true);
  };

  const errori = useMemo(() => {
    if (!tentato) return {};
    const m = {};
    for (const e of validaPiano(bozza)) m[e.campo] ??= e.messaggio;
    return m;
  }, [tentato, bozza]);

  const annulla = () => {
    setBozza(base);
    setSporcoLocale(false);
    setSporco(false);
    setTentato(false);
    setMessaggio(null);
    setAperto(0);
    setOpzioni({});
  };

  // "Valido dal" ≥ oggi (una nuova versione non riscrive il passato), salvo il primo piano.
  const primaVersione = dati.alimentazione.length === 0;
  const nelPassato = !primaVersione && DATA_OK.test(data) && data < oggi;
  const errData = !dialogo ? undefined : !DATA_OK.test(data) ? 'Campo obbligatorio' : nelPassato ? MSG_DATA_PASSATA : undefined;

  async function conferma() {
    if (!DATA_OK.test(data) || nelPassato) return;
    setTentato(true);
    setMessaggio(null);
    const trovati = validaPiano(bozza);
    if (trovati.length) {
      // apre il pasto (e l'opzione) del primo errore
      const [, p, , o] = trovati[0].campo.split('.');
      setAperto(Number(p));
      if (o !== undefined) setOpzioni((x) => ({ ...x, [Number(p)]: Number(o) }));
      setDialogo(false);
      setTimeout(() => {
        const el = document.querySelector('.editor-piano [aria-invalid="true"]');
        if (el) { el.scrollIntoView?.({ block: 'center' }); el.focus(); }
      }, 50);
      return;
    }
    setInCorso(true);
    try {
      const id = await store.salvaPiano({ ...perSalvare(bozza), validaDal: data });
      setVersioneId(id);
      setBase(bozza);
      setSporcoLocale(false);
      setSporco(false);
      setTentato(false);
      setDialogo(false);
    } catch (e) {
      setDialogo(false);
      setMessaggio(segnalaRifiuto(e));
    } finally {
      setInCorso(false);
    }
  }

  const cambiaPasto = (i, nuovo) => cambia({ pasti: sostituisci(bozza.pasti, i, nuovo) });
  const rimuoviPasto = (i) => {
    cambia({ pasti: bozza.pasti.filter((_, k) => k !== i) });
    setAperto(bozza.pasti.length > 1 ? Math.max(0, i - 1) : 0);
    setOpzioni({});
  };
  const aggiungiPasto = () => {
    cambia({ pasti: [...bozza.pasti, nuovoPasto()] });
    setAperto(bozza.pasti.length);
  };

  return html`
    <div class="editor-piano">
      <${Intestazione} sporco=${sporco} inCorso=${inCorso} onAnnulla=${annulla} onSalva=${() => { setData(dataProposta()); setDialogo(true); }} />
      ${versioni.length > 0 && html`
        <div class="card">
          <${Campo} etichetta="Versione da modificare">
            <select key=${giro} value=${versioneId ?? ''} onChange=${(e) => scegliVersione(e.target.value)}>
              ${versioni.map((v) => html`<option key=${v.id} value=${v.id}>${etichettaVersione(v, attuale, oggi)}</option>`)}
            </select>
          </${Campo}>
          ${versione && html`<p class="secondario">${`Stai modificando: ${etichettaVersione(versione, attuale, oggi)}`}</p>`}
        </div>`}
      <div class="card">
        <${Campo} etichetta="Indicazioni generali">
          <textarea value=${bozza.indicazioni} onInput=${(e) => cambia({ indicazioni: e.target.value })}></textarea>
        </${Campo}>
      </div>
      ${Object.keys(errori).length > 0 && html`<p class="errore-scrittura" role="alert">Correggi i campi evidenziati</p>`}
      ${bozza.pasti.map((p, i) => html`
        <section key=${i} class="card pasto" role="region" aria-label=${p.nome.trim() || `Pasto ${i + 1}`}>
          ${i === aperto
    ? html`<${PastoAperto} pasto=${p} i=${i} errori=${errori} opzioneAttiva=${opzioni[i] ?? 0}
              onOpzione=${(j) => setOpzioni((x) => ({ ...x, [i]: j }))} onCambia=${(n) => cambiaPasto(i, n)} onRimuovi=${() => rimuoviPasto(i)} />`
    : html`<button type="button" class="riga-scheda card-interna pasto-chiuso" onClick=${() => setAperto(i)}>
              <span class="riga-nome">${p.nome.trim() || `Pasto ${i + 1}`}</span>
              <span class="riga-dettaglio secondario">${riassunto(p)}</span>
              ${haErrori(errori, `pasti.${i}`) && html`<span class="da-correggere">Da correggere</span>`}
            </button>`}
        </section>`)}
      <button type="button" class="pulsante" onClick=${aggiungiPasto}>+ Aggiungi pasto</button>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      ${dialogo && html`
        <${Dialogo} titolo="Salva come nuova versione da…" azioni=${[
    { testo: 'Annulla', onClick: () => setDialogo(false) },
    { testo: 'Salva', primaria: true, disabled: !puoScrivere || inCorso, onClick: conferma },
  ]}>
          <${Campo} etichetta="Valido dal" errore=${errData}>
            <input type="date" value=${data} min=${primaVersione ? undefined : oggi} onInput=${(e) => setData(e.target.value)} />
          </${Campo}>
        </${Dialogo}>`}
      ${daCaricare && html`
        <${Dialogo} titolo="Hai modifiche non salvate. Caricare un'altra versione?" azioni=${[
    { testo: 'Resta', onClick: resta },
    { testo: 'Carica senza salvare', primaria: true, onClick: () => carica(daCaricare) },
  ]} />`}
    </div>`;
}

// ---------- sezione ----------
export function SezionePiano() {
  const { dati, puoScrivere } = useContext(Contesto);
  const [creando, setCreando] = useState(false);
  const titolo = html`<h1 class="titolo-sezione">Piano alimentare</h1>`;
  if (dati.alimentazione.length === 0 && !creando) {
    return html`<section class="sezione">${titolo}
      <${Vuoto} testo="Nessun piano alimentare" azione=${{ testo: 'Crea il piano alimentare', disabled: !puoScrivere, onClick: () => setCreando(true) }} /></section>`;
  }
  return html`<section class="sezione">${titolo}<${Editor} /></section>`;
}
