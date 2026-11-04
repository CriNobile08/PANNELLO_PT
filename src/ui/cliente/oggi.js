import { html, useState, useContext, useEffect, useRef } from '../html.js';
import { Contesto } from '../contesto.js';
import { Anello, Dialogo, Campo, SelettoreData, Vuoto } from '../componenti.js';
import { versioneValida } from '../../logic/versioni.js';
import { formatoData, aggiungiGiorni, oraRoma } from '../../logic/date.js';
import { percentualeSonno, minutiPisolini, recupero, OBIETTIVO_SONNO_PREDEFINITO } from '../../logic/indici.js';
import { unisciSessioni, sessioniValide } from '../../logic/sessioni.js';
import { fontiStato } from '../../logic/statoSync.js';
import { RigaSessione, testoDurata } from './sessioni.js';
import { Pasti } from './pasti.js';
import { contestoGiorno, useDiario, impostaBlocco } from './giornata.js';
import { TIPI } from './tipi.js';
import { numero, migliaia } from '../formato.js';

const FRECCE = { su: '↑', giu: '↓', uguale: '=' };
const MESSA_IN_ATTESA_MS = 120000;
const testoObiettivo = (min) => `su ${testoDurata(min).replace(' 00', '')}`;

function datiCard(doc) {
  const fasi = doc?.sonno?.fasi;
  return [
    ['Passi', numero(doc?.passi) ? migliaia(doc.passi) : null],
    ['HRV', numero(doc?.hrv?.rmssd) ? `${Math.round(doc.hrv.rmssd)} ms` : null],
    ['Sonno profondo', numero(fasi?.profondo) ? `${fasi.profondo} min` : null],
    ['REM', numero(fasi?.rem) ? `${fasi.rem} min` : null],
  ];
}

function StatoSync({ stato }) {
  if (!stato) return null;
  const ora = oraRoma(stato.ultimaEsecuzione);
  const fonti = fontiStato(stato);
  if (!stato.fonti) {
    // Formato del 2a: testi invariati.
    const testo = stato.esito === 'errore'
      ? `Ultimo aggiornamento non riuscito alle ${ora}: ${stato.messaggio || 'Google Health non raggiungibile'}`
      : stato.esito === 'parziale'
        ? `Aggiornato alle ${ora} · Alcuni dati non aggiornati`
        : `Aggiornato alle ${ora}`;
    return html`<p class=${stato.esito === 'errore' ? 'stato-sync errore-scrittura' : 'stato-sync secondario'}>${testo}</p>`;
  }
  const inErrore = fonti.filter((f) => f.esito === 'errore');
  const tutteInErrore = stato.esito === 'errore';
  const principale = tutteInErrore
    ? `Ultimo aggiornamento non riuscito alle ${ora}: ${inErrore[0]?.messaggio || 'Fonti non raggiungibili'}`
    : `Aggiornato alle ${ora}`;
  const righe = [
    ...inErrore.slice(tutteInErrore ? 1 : 0).map((f) => `${f.nome}: ultimo aggiornamento non riuscito alle ${ora}: ${f.messaggio}`),
    ...fonti.filter((f) => f.esito === 'parziale').map((f) => `${f.nome}: alcuni dati non aggiornati`),
  ];
  return html`
    <div class="stato-sync">
      <p class=${tutteInErrore ? 'errore-scrittura' : 'secondario'}>${principale}</p>
      ${righe.map((r) => html`<p key=${r} class=${tutteInErrore ? 'errore-scrittura' : 'secondario'}>${r}</p>`)}
    </div>`;
}

function AggiornaOra({ aggiornaOra }) {
  const [inCorso, setInCorso] = useState(false);
  const [nonDisponibile, setNonDisponibile] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!aggiornaOra) return null;
  const premi = () => {
    setInCorso(true);
    timer.current = setTimeout(() => setInCorso(false), MESSA_IN_ATTESA_MS);
    Promise.resolve().then(aggiornaOra).catch(() => {
      clearTimeout(timer.current);
      setInCorso(false);
      setNonDisponibile(true);
    });
  };
  return html`
    <button type="button" class="pulsante aggiorna-ora" disabled=${inCorso || nonDisponibile} onClick=${premi}>
      ${nonDisponibile ? 'Non disponibile' : inCorso ? 'Aggiornamento in corso…' : 'Aggiorna ora'}
    </button>`;
}

function AttivitaRecenti() {
  const { dati, oggi } = useContext(Contesto);
  const dal = aggiungiGiorni(oggi, -6);
  const elenco = unisciSessioni(sessioniValide(dati.sessioni))
    .filter((s) => s.data >= dal && s.data <= oggi)
    .sort((a, b) => Date.parse(b.inizio) - Date.parse(a.inizio))
    .slice(0, 10);
  if (elenco.length === 0) return null;
  return html`
    <section class="card" aria-label="Attività recenti">
      <h2 class="titolo-blocco">Attività recenti</h2>
      <div class="elenco-sessioni">
        ${elenco.map((s) => html`<${RigaSessione} key=${s.id} sessione=${s} />`)}
      </div>
    </section>`;
}

const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

function riepilogoPrincipale(revisione) {
  if (revisione.obiettivo) return revisione.obiettivo.descrizione;
  const es = revisione.principale ?? [];
  const serie = es.reduce((t, e) => t + (e.serie ?? 0), 0);
  return `${plurale(es.length, 'esercizio', 'esercizi')} · ${plurale(serie, 'serie', 'serie')}`;
}

function DialogoNota({ notaIniziale, modifica, messaggio, onChiudi }) {
  const { puoScrivere } = useContext(Contesto);
  const [inCorso, setInCorso] = useState(false);
  const [nota, setNota] = useState(notaIniziale);
  return html`
    <${Dialogo} titolo="Nota per il trainer" azioni=${[
    { testo: 'Annulla', onClick: onChiudi },
    { testo: 'Salva nota', primaria: true, disabled: !puoScrivere || inCorso, onClick: async () => {
      setInCorso(true);
      const ok = await modifica({ nota });
      setInCorso(false);
      if (ok) onChiudi();
    } },
  ]}>
      <${Campo} etichetta="Nota">
        <textarea rows="4" value=${nota} onInput=${(e) => setNota(e.target.value)}></textarea>
      </${Campo}>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
    </${Dialogo}>`;
}

function BloccoCheckbox({ etichetta, completo, vuoto, disabilitato, onCambia }) {
  return html`
    <label class="spunta riga-blocco">
      <input type="checkbox" checked=${completo} disabled=${disabilitato || vuoto}
        onChange=${(e) => onCambia(e.target.checked)} />
      <span>${etichetta}</span>
    </label>`;
}

function CardAllenamento({ data, ctx, modifica, messaggio }) {
  const { vai, puoScrivere } = useContext(Contesto);
  const [nota, setNota] = useState(false);
  const { giorno, scheda, revisione, voce, stato } = ctx;
  const disabilitato = !puoScrivere;

  if (!giorno.versione) {
    return html`<${Vuoto} testo="Il trainer non ha ancora preparato il programma" />`;
  }
  if (!giorno.schedaId) return html`<div class="card"><h2 class="titolo-blocco">Allenamento di oggi</h2><p>Riposo</p></div>`;
  if (!scheda || !revisione) return html`<div class="card"><h2 class="titolo-blocco">Allenamento di oggi</h2><p>Scheda non disponibile</p></div>`;

  const nRisc = (revisione.riscaldamento ?? []).length;
  const nStr = (revisione.stretching ?? []).length;
  return html`
    <div class="card card-allenamento">
      <div class="allenamento-testata">
        <a href="#" class="allenamento-link" onClick=${(e) => { e.preventDefault(); vai('giornata', { data }); }}>
          <span class="secondario">Allenamento di oggi</span>
          <span class="titolo-scheda">${scheda.nome}</span>
          <span class="secondario">${TIPI[scheda.tipo] ?? scheda.tipo}</span>
        </a>
        <button type="button" class="pulsante-icona" aria-label="Aggiungi nota" disabled=${!puoScrivere} onClick=${() => setNota(true)}>+</button>
      </div>
      <div class="blocchi">
        <${BloccoCheckbox} etichetta="Riscaldamento" completo=${stato.riscaldamento} vuoto=${nRisc === 0} disabilitato=${disabilitato}
          onCambia=${(v) => modifica(v ? impostaBlocco('riscaldamentoFatti', nRisc) : () => ({ riscaldamentoFatti: [] }))} />
        <div class="riga-blocco">
          <span class=${stato.principale ? 'segno fatto' : 'segno'} aria-hidden="true">${stato.principale ? '✓' : ''}</span>
          <span><span>Parte principale</span> <span class="secondario">${riepilogoPrincipale(revisione)}</span></span>
        </div>
        <${BloccoCheckbox} etichetta="Stretching" completo=${stato.stretching} vuoto=${nStr === 0} disabilitato=${disabilitato}
          onCambia=${(v) => modifica(v ? impostaBlocco('stretchingFatti', nStr) : () => ({ stretchingFatti: [] }))} />
      </div>
      ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}
      ${nota && html`<${DialogoNota} key=${data} modifica=${modifica} messaggio=${messaggio} notaIniziale=${voce?.nota ?? ''} onChiudi=${() => setNota(false)} />`}
    </div>`;
}

function CardAlimentazione({ data }) {
  const { dati } = useContext(Contesto);
  const piano = versioneValida(dati.alimentazione, data);
  if (!piano) return html`<${Vuoto} testo="Nessun piano alimentare" />`;
  return html`
    <section class="card" aria-label="Alimentazione di oggi">
      <h2 class="titolo-blocco">Alimentazione di oggi</h2>
      <${Pasti} piano=${piano} chiave=${data} />
    </section>`;
}

export function SezioneOggi({ data: iniziale }) {
  const { dati, oggi, aggiornaOra } = useContext(Contesto);
  const [data, setData] = useState(iniziale ?? oggi);
  const { voce, modifica, messaggio } = useDiario(data);
  const ctx = contestoGiorno(dati, data, voce);
  const { giorno, stato } = ctx;
  const riposo = giorno.versione && !giorno.schedaId;
  const haScheda = giorno.versione && giorno.schedaId && ctx.revisione;
  const doc = dati.salute?.[data];
  const sonno = doc?.sonno;
  const obSalvato = dati.impostazioni?.obiettivi?.sonnoMinuti;
  const obiettivo = numero(obSalvato) && obSalvato > 0 ? obSalvato : OBIETTIVO_SONNO_PREDEFINITO;
  const percSonno = percentualeSonno(doc, obiettivo);
  const pisolino = minutiPisolini(doc);
  const rec = recupero(dati.salute, data);
  const fasi = sonno?.fasi;
  const testoFasi = [['Profondo', fasi?.profondo], ['REM', fasi?.rem], ['Leggero', fasi?.leggero]]
    .filter(([, v]) => numero(v)).map(([n, v]) => `${n} ${v}′`).join(' · ');

  return html`
    <section class="sezione oggi">
      <${SelettoreData} data=${data} onCambia=${setData}
        formato=${(d) => (d === oggi ? `Oggi · ${formatoData(d)}` : formatoData(d))} />
      <div class="card anelli">
        <${Anello} valore=${percSonno} massimo=${100} colore="#E08A4F" etichetta="Sonno"
          testo=${percSonno === null ? 'Nessun dato' : testoDurata(sonno.minutiAddormentato)}
          sottotesto=${percSonno === null ? undefined : testoObiettivo(obiettivo)} />
        <${Anello} valore=${rec.stato === 'ok' ? rec.indice : null} massimo=${100} colore="#2BC4A6" etichetta="Cuore a riposo"
          testo=${rec.stato === 'nessun-dato' ? 'Nessun dato' : `${rec.fc}${rec.freccia ? ` ${FRECCE[rec.freccia]}` : ''}`}
          sottotesto=${rec.stato === 'ok' ? 'bpm' : rec.stato === 'calibrazione' ? 'In calibrazione' : undefined} />
        <${Anello} valore=${haScheda ? stato.completati : null} massimo=${3} colore="#5B9BFF" etichetta="Allenamento"
          testo=${riposo ? 'Riposo' : haScheda ? `${stato.completati}/3` : 'Nessun dato'}
          sottotesto=${haScheda ? 'blocchi' : undefined} />
      </div>
      ${(testoFasi || pisolino > 0) && html`
        <p class="secondario riga-fasi">
          ${testoFasi}${testoFasi && pisolino > 0 && ' · '}${pisolino > 0 && `+ pisolino ${pisolino} min`}
        </p>`}
      <${CardAllenamento} data=${data} ctx=${ctx} modifica=${modifica} messaggio=${messaggio} />
      <div class="dati-griglia">
        ${datiCard(doc).map(([t, v]) => html`
          <div class="card-interna dato" key=${t}>
            <div class="secondario">${t}</div>
            <div class=${v === null ? 'dato-valore' : 'dato-valore presente'}>${v ?? 'Nessun dato'}</div>
          </div>`)}
      </div>
      <${StatoSync} stato=${dati.sync?.stato} />
      <${AggiornaOra} aggiornaOra=${aggiornaOra} />
      <${AttivitaRecenti} />
      <${CardAlimentazione} data=${data} />
    </section>`;
}
