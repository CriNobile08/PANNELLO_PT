import { html, useState, useEffect, useRef, useContext } from '../html.js';
import { DIARIO_VUOTO } from '../../data/store.js';
import { Contesto } from '../contesto.js';
import { Campo, Vuoto } from '../componenti.js';
import { revisionePerGiorno } from '../../logic/versioni.js';
import { risolviGiorno } from '../../logic/risoluzione.js';
import { statoBlocchi } from '../../logic/completamento.js';
import { formatoDataLunga } from '../../logic/date.js';
import { unisciSessioni } from '../../logic/sessioni.js';
import { DettaglioSessione } from './sessioni.js';

export const TIPI = { palestra: 'Palestra', corsa: 'Corsa', trekking: 'Trekking', camminata: 'Camminata', bici: 'Bici', altro: 'Altro' };

/** Numero all'italiana: virgola decimale. */
export const testoNumero = (n) => String(n).replace('.', ',');

/** 150 → "2′30" */
export const testoRecupero = (sec) => `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, '0')}`;

/** Scheda, revisione e stato dei blocchi per una data; `voce` = voce di diario effettiva (con overlay). */
export function contestoGiorno(dati, data, voce = dati.diario[data] ?? null) {
  const giorno = risolviGiorno(data, dati);
  const scheda = giorno.schedaId ? dati.schede[giorno.schedaId] ?? null : null;
  const revisione = scheda ? revisionePerGiorno(dati.revisioni[giorno.schedaId] ?? [], data) : null;
  return { giorno, scheda, revisione, voce, stato: statoBlocchi(revisione, voce) };
}

const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Diario di una data con scritture funzionali e overlay ottimistico.
 * `modifica(op)`: `op` è un oggetto o una funzione `(attuale) => modifiche`; la funzione gira nello store,
 * dentro la sezione serializzata (nessuna spunta si perde), e subito dopo sull'ultimo valore ottimistico.
 * Il valore in attesa sparisce quando lo snapshot lo riflette, dopo 3 s a scritture finite, o in caso di errore.
 * Ritorna { voce, modifica, messaggio, inCorso }; `modifica` risolve a true/false.
 */
export function useDiario(data) {
  const { dati, store, segnalaRifiuto } = useContext(Contesto);
  const salvata = dati.diario[data] ?? null;
  const [pendenti, setPendenti] = useState({});
  const [messaggio, setMessaggio] = useState(null);
  const [inCorso, setInCorso] = useState(false);
  const inVolo = useRef(0);
  const ottimistica = useRef(null);

  const campi = pendenti[data] ?? {};
  const voce = { ...DIARIO_VUOTO, ...salvata, ...campi };
  ottimistica.current = voce;

  useEffect(() => {
    if (!pendenti[data]) return;
    const resto = Object.fromEntries(Object.entries(pendenti[data]).filter(([k, v]) =>
      !uguali(v, (salvata ?? DIARIO_VUOTO)[k] ?? DIARIO_VUOTO[k])));
    if (Object.keys(resto).length !== Object.keys(pendenti[data]).length) setPendenti({ ...pendenti, [data]: resto });
  }, [salvata, pendenti, data]);

  async function modifica(op) {
    const f = typeof op === 'function' ? op : () => op;
    setMessaggio(null);
    const previsione = f(ottimistica.current);
    ottimistica.current = { ...ottimistica.current, ...previsione };
    setPendenti((p) => ({ ...p, [data]: { ...p[data], ...previsione } }));
    inVolo.current += 1;
    setInCorso(true);
    try {
      await store.aggiornaDiario(data, f);
      return true;
    } catch (e) {
      setMessaggio(segnalaRifiuto(e));
      setPendenti((p) => {
        const c = { ...p[data] };
        for (const k of Object.keys(previsione)) delete c[k];
        return { ...p, [data]: c };
      });
      return false;
    } finally {
      inVolo.current -= 1;
      if (inVolo.current === 0) {
        setInCorso(false);
        // rete di sicurezza: se lo snapshot non riflette mai il valore (modifica altrui), l'overlay sparisce
        setTimeout(() => { if (inVolo.current === 0) setPendenti((p) => ({ ...p, [data]: {} })); }, 3000);
      }
    }
  }
  return { voce, modifica, messaggio, inCorso };
}

/** Funzione per `modifica`: aggiunge o toglie l'indice `i` dall'elenco `campo`, sul valore corrente. */
export const spunta = (campo, i, attivo) => (att) => {
  const set = new Set(att[campo]);
  if (attivo) set.add(i); else set.delete(i);
  return { [campo]: [...set].sort((a, b) => a - b) };
};
export const impostaBlocco = (campo, n) => () => ({ [campo]: Array.from({ length: n }, (_, i) => i) });
const salvataVoce = (dati, data) => dati.diario[data] ?? null;

const fattiValidi = (fatti, n) => (Array.isArray(fatti) ? fatti.filter((i) => Number.isInteger(i) && i >= 0 && i < n) : []);

function dettaglioEsercizio(e) {
  const parti = [];
  if (e.serie != null && e.ripetizioni != null) parti.push(`${e.serie} × ${e.ripetizioni}`);
  else if (e.ripetizioni != null) parti.push(`${e.ripetizioni} rip.`);
  if (e.durataSec != null) parti.push(`${e.durataSec} s`);
  if (e.perLato) parti.push('per lato');
  if (e.nota) parti.push(e.nota);
  return parti.join(' · ');
}

function BloccoSpunte({ titolo, esercizi, fatti, onCambia, disabilitato }) {
  const validi = fattiValidi(fatti, esercizi.length);
  return html`
    <section class="card blocco-giornata" aria-label=${titolo}>
      <div class="blocco-testata">
        <h2 class="titolo-blocco">${titolo}</h2>
        <span class="contatore numero">${validi.length} / ${esercizi.length}</span>
      </div>
      ${esercizi.length === 0 && html`<p class="secondario">Nessun esercizio</p>`}
      <ul class="elenco-spunte">
        ${esercizi.map((e, i) => html`
          <li key=${i}>
            <label class="spunta">
              <input type="checkbox" checked=${validi.includes(i)} disabled=${disabilitato}
                onChange=${(ev) => onCambia(i, ev.target.checked)} />
              <span class="spunta-testo">
                <span>${e.nome}</span>
                ${dettaglioEsercizio(e) && html`<span class="secondario">${dettaglioEsercizio(e)}</span>`}
              </span>
            </label>
          </li>`)}
      </ul>
    </section>`;
}

/** Spec §6.4: scheda in programma, principale non fatto, rilevamento non ignorato, almeno una sessione unita nel giorno. */
export function avvisoRilevamento({ haScheda, voce, sessioniGiorno }) {
  return Boolean(haScheda) && voce?.principaleFatto !== true && voce?.rilevamentoIgnorato !== true && sessioniGiorno.length > 0;
}

function ColonnaFatto({ sessioni }) {
  return html`
    <div class="colonna-fatto">
      <div class="sottotitolo">Fatto</div>
      ${sessioni.map((s) => html`<${DettaglioSessione} key=${s.id} sessione=${s} />`)}
    </div>`;
}

function AvvisoRilevamento({ onSi, onNo, disabilitato }) {
  return html`
    <div class="card avviso-rilevamento" role="status">
      <p>Allenamento rilevato: segnalo come fatto?</p>
      <div class="azioni-avviso">
        <button type="button" class="pulsante primario" disabled=${disabilitato} onClick=${onSi}>Sì</button>
        <button type="button" class="pulsante" disabled=${disabilitato} onClick=${onNo}>No</button>
      </div>
    </div>`;
}

function BloccoPrincipale({ revisione, fatto, onCambia, disabilitato, sessioni = [] }) {
  const esercizi = revisione.principale ?? [];
  const ob = revisione.obiettivo;
  return html`
    <section class="card blocco-giornata" aria-label="Parte principale">
      <h2 class="titolo-blocco">Parte principale</h2>
      <div class=${sessioni.length ? 'colonne-giornata' : ''}>
      <div class="colonna-programmato">
        <div class="sottotitolo">Programmato</div>
        ${ob && html`
          <div class="programmato-riga">
            <span>${ob.descrizione}</span>
            <span class="secondario">${[ob.distanzaKm != null && `${testoNumero(ob.distanzaKm)} km`, ob.dislivelloM != null && `${testoNumero(ob.dislivelloM)} m D+`].filter(Boolean).join(' · ')}</span>
          </div>`}
        ${esercizi.map((e, i) => html`
          <div class="programmato-riga" key=${i}>
            <span class="programmato-nome">${e.nome}</span>
            <span class="secondario">${[
    `${e.serie} × ${e.ripetizioni}${e.caricoKg != null ? ` · ${testoNumero(e.caricoKg)} kg` : ''}`,
    e.recuperoSec != null && `rec. ${testoRecupero(e.recuperoSec)}`,
    e.nota,
  ].filter(Boolean).join(' · ')}</span>
          </div>`)}
        ${!ob && esercizi.length === 0 && html`<p class="secondario">Nessun esercizio</p>`}
      </div>
      ${sessioni.length > 0 && html`<${ColonnaFatto} sessioni=${sessioni} />`}
      </div>
      <button type="button" class=${fatto ? 'pulsante primario' : 'pulsante'} aria-pressed=${fatto ? 'true' : 'false'}
        disabled=${disabilitato} onClick=${onCambia}>Segna come fatta</button>
    </section>`;
}

function Modulo({ data, voce, modifica, messaggio, inCorso }) {
  const { puoScrivere, setSporco } = useContext(Contesto);
  const salvataS = voce?.sensazione ?? null;
  const salvataN = voce?.nota ?? '';
  const [sensazione, setSensazione] = useState(salvataS);
  const [nota, setNota] = useState(salvataN);
  const [base, setBase] = useState({ s: salvataS, n: salvataN });
  const sporco = sensazione !== base.s || nota !== base.n;

  const cambia = (s, n) => { if (!puoScrivere) return; setSensazione(s); setNota(n); setSporco(s !== base.s || n !== base.n); };
  async function salva() {
    if (await modifica({ sensazione, nota })) {
      setBase({ s: sensazione, n: nota });
      setSporco(false);
    }
  }
  return html`
    <section class="card modulo-sensazione" aria-label="Come ti sei sentito?">
      <h2 class="titolo-blocco">Come ti sei sentito?</h2>
      <div class="sensazioni" role="group" aria-label="Sensazione">
        ${[1, 2, 3, 4, 5].map((n) => html`
          <button type="button" key=${n} class="pulsante sensazione" aria-pressed=${sensazione === n ? 'true' : 'false'} disabled=${!puoScrivere}
            onClick=${() => cambia(sensazione === n ? null : n, nota)}>${n}</button>`)}
      </div>
      <${Campo} etichetta="Note per il trainer">
        <textarea rows="3" value=${nota} disabled=${!puoScrivere} onInput=${(e) => cambia(sensazione, e.target.value)}></textarea>
      </${Campo}>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <button type="button" class="pulsante primario" disabled=${!puoScrivere || inCorso || !sporco} onClick=${salva}>Salva</button>
    </section>`;
}

export function SezioneGiornata({ data: dataProp }) {
  const { dati, oggi, vai, puoScrivere } = useContext(Contesto);
  const data = dataProp ?? oggi;
  const { voce, modifica, messaggio, inCorso } = useDiario(data);
  const { giorno, scheda, revisione, stato } = contestoGiorno(dati, data, voce);
  const disabilitato = !puoScrivere;
  const sessioniGiorno = unisciSessioni(dati.sessioni ?? []).filter((s) => s.data === data);

  const intestazione = html`
    <header class="intestazione-giornata">
      <button type="button" class="pulsante-icona" aria-label="Torna a Oggi" onClick=${() => vai('oggi', { data })}>‹</button>
      <h1 class="titolo-sezione">${formatoDataLunga(data)}</h1>
    </header>`;

  if (!giorno.versione) {
    return html`<section class="sezione">${intestazione}<${Vuoto} testo="Il trainer non ha ancora preparato il programma" /></section>`;
  }
  if (!giorno.schedaId) {
    return html`<section class="sezione">${intestazione}<div class="card"><p>Riposo</p></div>
      ${sessioniGiorno.length > 0 && html`<div class="card"><${ColonnaFatto} sessioni=${sessioniGiorno} /></div>`}</section>`;
  }
  if (!scheda || !revisione) {
    return html`<section class="sezione">${intestazione}<div class="card"><p>Scheda non disponibile</p></div></section>`;
  }

  const mostraAvviso = avvisoRilevamento({ haScheda: true, voce, sessioniGiorno });
  const ids = sessioniGiorno.flatMap((s) => s.parti.map((p) => p.id));
  const n = stato.completati;
  const segmenti = [stato.riscaldamento, stato.principale, stato.stretching];
  return html`
    <section class="sezione giornata">
      ${intestazione}
      <div class="card testata-giornata">
        <div class="secondario">${TIPI[scheda.tipo] ?? scheda.tipo}${revisione.durataStimataMin != null ? ` · ${revisione.durataStimataMin} min` : ''}</div>
        <h2 class="titolo-scheda">${scheda.nome}</h2>
        <div class="barra-segmenti" aria-hidden="true">
          ${segmenti.map((s, i) => html`<span key=${i} class=${s ? 'segmento pieno' : 'segmento'}></span>`)}
        </div>
        <div class="secondario">${n} ${n === 1 ? 'blocco' : 'blocchi'} su 3 ${n === 1 ? 'completato' : 'completati'}</div>
      </div>
      ${revisione.nota && html`
        <section class="card nota-trainer" aria-label="Nota del trainer">
          <h2 class="titolo-blocco">Nota del trainer</h2>
          <p>${revisione.nota}</p>
        </section>`}
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      <${BloccoSpunte} titolo="Riscaldamento" esercizi=${revisione.riscaldamento ?? []} fatti=${voce.riscaldamentoFatti}
        disabilitato=${disabilitato} onCambia=${(i, v) => modifica(spunta('riscaldamentoFatti', i, v))} />
      ${mostraAvviso && html`<${AvvisoRilevamento} disabilitato=${disabilitato || inCorso}
        onSi=${() => modifica({ principaleFatto: true, sessioniCollegate: ids })}
        onNo=${() => modifica({ rilevamentoIgnorato: true })} />`}
      <${BloccoPrincipale} revisione=${revisione} fatto=${voce.principaleFatto === true} sessioni=${sessioniGiorno}
        disabilitato=${disabilitato} onCambia=${() => modifica((att) => ({ principaleFatto: att.principaleFatto !== true }))} />
      <${BloccoSpunte} titolo="Stretching" esercizi=${revisione.stretching ?? []} fatti=${voce.stretchingFatti}
        disabilitato=${disabilitato} onCambia=${(i, v) => modifica(spunta('stretchingFatti', i, v))} />
      <${Modulo} key=${data} data=${data} voce=${salvataVoce(dati, data)} modifica=${modifica} messaggio=${null} inCorso=${inCorso} />
    </section>`;
}
