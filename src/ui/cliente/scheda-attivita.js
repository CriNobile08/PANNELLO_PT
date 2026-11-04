/** Scheda attività di una sessione unita, in sola lettura (spec §8). */
import { html, useContext } from '../html.js';
import { Contesto } from '../contesto.js';
import { Vuoto } from '../componenti.js';
import { unisciSessioni, sessioniValide } from '../../logic/sessioni.js';
import { statisticheFc, fcPerKm } from '../../logic/fc.js';
import { formatoDataIso, oraRoma } from '../../logic/date.js';
import { numero, migliaia, minSec } from '../formato.js';
import { testoDurata } from './sessioni.js';
import { TIPI } from './tipi.js';
import { GraficoFc, MappaTracciato } from './grafici.js';

const ASSENTE = '—';
const FONTI = { googleHealth: 'Google Health', strava: 'Strava', hevy: 'Hevy', komoot: 'Komoot' };
const ZONE = [['leggera', 'Leggera'], ['moderata', 'Moderata'], ['intensa', 'Intensa'], ['picco', 'Picco']];
const CON_TRACCIATO = ['corsa', 'trekking'];

const conUnita = (v, unita) => (numero(v) ? `${Math.round(v)} ${unita}` : ASSENTE);
const virgola = (v) => String(v).replace('.', ',');
/** 7012 → "7,01 km" */
const testoKm = (m) => (numero(m) ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : ASSENTE);
/** 352 → "5′52″/km" */
const testoRitmo = (secKm) => (numero(secKm) && secKm > 0 ? `${minSec(secKm)}/km` : ASSENTE);
const durataMs = (p) => Math.max(0, (Date.parse(p.fine) - Date.parse(p.inizio)) || 0);
const piuLunga = (parti) => [...parti].sort((a, b) => durataMs(b) - durataMs(a))[0] ?? null;

/** Primo `tracciati[idParte]` tra gli id delle parti della sessione; null se nessuno. */
export function trovaTracciato(sessione, tracciati) {
  for (const p of sessione?.parti ?? []) {
    const t = tracciati?.[p.id];
    if (t) return t;
  }
  return null;
}

/** fcSerie della parte Google Health più lunga che ne ha una. */
function serieDellaSessione(sessione) {
  const conSerie = sessione.parti.filter((p) => p.fonte === 'googleHealth' && Array.isArray(p.fcSerie?.bpm) && numero(p.fcSerie?.passoSec));
  return piuLunga(conSerie)?.fcSerie ?? null;
}

function Righe({ righe }) {
  return html`
    <dl class="dettaglio-righe">
      ${righe.map(([k, v]) => html`<div class="dettaglio-riga" key=${k}><dt class="secondario">${k}</dt><dd>${v}</dd></div>`)}
    </dl>`;
}

function Sezione({ titolo, classe = '', children }) {
  return html`
    <section class=${`card sezione-attivita ${classe}`} aria-label=${titolo}>
      <h2 class="titolo-blocco">${titolo}</h2>
      ${children}
    </section>`;
}

function Riepilogo({ sessione, statistiche, tracciato, hevy }) {
  const fcMedia = numero(sessione.fcMedia) ? sessione.fcMedia : statistiche?.media;
  const righe = [
    ['Durata', testoDurata(sessione.durataAttivaMin)],
    ['FC media', conUnita(fcMedia, 'bpm')],
    ['FC massima', conUnita(statistiche?.massima, 'bpm')],
    ['Calorie', conUnita(sessione.calorie, 'kcal')],
  ];
  if (tracciato) {
    const km = tracciato.distanzaM / 1000;
    righe.push(
      ['Distanza', testoKm(tracciato.distanzaM)],
      ['Ritmo medio', testoRitmo(numero(km) && km > 0 ? tracciato.inMovimentoSec / km : null)],
      ['Dislivello', conUnita(tracciato.dislivelloM, 'm')],
    );
  } else if (numero(sessione.distanzaM) && sessione.distanzaM > 0) {
    const km = sessione.distanzaM / 1000;
    righe.push(
      ['Distanza', testoKm(sessione.distanzaM)],
      ['Ritmo medio', testoRitmo(numero(sessione.durataAttivaMin) ? (sessione.durataAttivaMin * 60) / km : null)],
      ['Dislivello', conUnita(sessione.dislivelloM, 'm')],
    );
  }
  if (hevy) {
    righe.push(
      ['Serie totali', numero(hevy.serieTotali) ? String(hevy.serieTotali) : ASSENTE],
      ['Volume', numero(hevy.volumeKg) ? `${migliaia(hevy.volumeKg)} kg` : ASSENTE],
    );
  }
  return html`<${Sezione} titolo="Riepilogo"><${Righe} righe=${righe} /></${Sezione}>`;
}

function ZoneFc({ zoneMin }) {
  const voci = ZONE.map(([k, et]) => [k, et, numero(zoneMin?.[k]) ? zoneMin[k] : 0]);
  const totale = voci.reduce((t, [, , v]) => t + v, 0);
  if (!(totale > 0)) return html`<${Sezione} titolo="Zone FC"><p class="secondario">Nessun dato</p></${Sezione}>`;
  return html`
    <${Sezione} titolo="Zone FC">
      <div class="barra-zone" aria-hidden="true">
        ${voci.filter(([, , v]) => v > 0).map(([k, , v]) => html`<span key=${k} class=${`zona zona-${k}`} style=${`flex-grow:${v}`}></span>`)}
      </div>
      <dl class="dettaglio-righe">
        ${voci.map(([k, et, v]) => html`
          <div class="dettaglio-riga" key=${k}>
            <dt><span class=${`pallino zona-${k}`} aria-hidden="true"></span>${et}</dt>
            <dd>${`${Math.round(v)} min · ${Math.round((v / totale) * 100)}%`}</dd>
          </div>`)}
      </dl>
    </${Sezione}>`;
}

function SezioneGraficoFc({ fcSerie, statistiche }) {
  return html`
    <${Sezione} titolo="Grafico FC">
      ${statistiche ? html`<${GraficoFc} fcSerie=${fcSerie} statistiche=${statistiche} />` : html`<p class="secondario">Nessun dato</p>`}
    </${Sezione}>`;
}

function Tracciato({ tracciato }) {
  return html`
    <${Sezione} titolo="Tracciato">
      ${tracciato
    ? html`<p class="secondario nome-file">${tracciato.nomeFile ?? 'GPX'}</p><${MappaTracciato} tracciato=${tracciato} />`
    : html`<p class="secondario">Nessun tracciato</p>`}
    </${Sezione}>`;
}

function SplitKm({ tracciato, fcSerie }) {
  const split = tracciato.split ?? [];
  const fc = fcPerKm(fcSerie, tracciato.inizio, tracciato.istantiKm ?? [], tracciato.durataSec);
  const ritmi = split.map((s) => (numero(s.durataSec) && numero(s.distanzaM) && s.distanzaM > 0 ? s.durataSec / (s.distanzaM / 1000) : null));
  const interi = ritmi.filter((r, i) => numero(r) && split[i].distanzaM >= 1000);
  const migliore = interi.length ? Math.min(...interi) : null;
  const validi = ritmi.filter(numero);
  const base = validi.length ? Math.min(...validi) : null;
  return html`
    <${Sezione} titolo="Split per km">
      <table class="tabella-split">
        <thead><tr><th scope="col">Km</th><th scope="col">Tempo</th><th scope="col">Ritmo</th><th scope="col">Disl.</th><th scope="col">FC</th></tr></thead>
        <tbody>
          ${split.map((s, i) => {
    const veloce = migliore !== null && ritmi[i] === migliore && s.distanzaM >= 1000;
    return html`
            <tr key=${i} class=${veloce ? 'piu-veloce' : ''}>
              <td>${s.distanzaM >= 1000 ? s.km : testoKm(s.distanzaM)}</td>
              <td class="numero">${minSec(s.durataSec)}</td>
              <td class="cella-ritmo">
                <span class="barra-ritmo" style=${`width:${numero(ritmi[i]) ? Math.round((base / ritmi[i]) * 100) : 0}%`}></span>
                <span class="numero">${testoRitmo(ritmi[i])}</span>
              </td>
              <td>${conUnita(s.dislivelloM, 'm')}</td>
              <td class="numero">${numero(fc[i]) ? fc[i] : ASSENTE}</td>
            </tr>`;
  })}
        </tbody>
      </table>
    </${Sezione}>`;
}

/** "60 kg × 8", "8 rip.", "45 s", "200 m" … */
function testoSerie(s) {
  const parti = [];
  if (numero(s.kg) && numero(s.ripetizioni)) parti.push(`${virgola(s.kg)} kg × ${s.ripetizioni}`);
  else if (numero(s.kg)) parti.push(`${virgola(s.kg)} kg`);
  else if (numero(s.ripetizioni)) parti.push(`${s.ripetizioni} rip.`);
  if (numero(s.durataSec)) parti.push(s.durataSec >= 60 ? minSec(s.durataSec) : `${s.durataSec} s`);
  if (numero(s.distanzaM)) parti.push(`${Math.round(s.distanzaM)} m`);
  if (numero(s.rpe)) parti.push(`RPE ${virgola(s.rpe)}`);
  return parti.join(' · ');
}

function Esercizio({ esercizio }) {
  let n = 0;
  const serie = [...(esercizio.serie ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  return html`
    <div class="esercizio-hevy">
      <h3 class="nome-esercizio">${esercizio.nome ?? ASSENTE}</h3>
      ${esercizio.note && html`<p class="secondario">${esercizio.note}</p>`}
      <ul class="elenco-serie">
        ${serie.map((s, i) => {
    const risc = s.tipo === 'riscaldamento';
    const etichetta = risc ? 'R' : String(++n);
    const dettaglio = testoSerie(s);
    return html`
          <li key=${i} class=${`serie-hevy ${s.tipo ?? ''}`}>
            <span>${dettaglio ? `${etichetta} · ${dettaglio}` : etichetta}</span>
            ${(s.tipo === 'cedimento' || s.tipo === 'drop') && html`<span class="etichetta-serie">${s.tipo}</span>`}
          </li>`;
  })}
      </ul>
    </div>`;
}

function EserciziHevy({ hevy }) {
  const esercizi = [...(hevy.esercizi ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  // esercizi consecutivi con lo stesso idSuperserie formano un gruppo
  const gruppi = [];
  for (const e of esercizi) {
    const ultimo = gruppi.at(-1);
    const ss = e.idSuperserie ?? null;
    if (ss !== null && ultimo && ultimo.ss === ss) ultimo.esercizi.push(e);
    else gruppi.push({ ss, esercizi: [e] });
  }
  const totali = [
    numero(hevy.serieTotali) && `${hevy.serieTotali} serie`,
    numero(hevy.volumeKg) && `${migliaia(hevy.volumeKg)} kg`,
  ].filter(Boolean).join(' · ');
  return html`
    <${Sezione} titolo="Esercizi Hevy">
      ${gruppi.map((g, i) => (g.ss !== null && g.esercizi.length > 1
    ? html`
          <div class="superserie" key=${i}>
            <div class="secondario etichetta-superserie">Superserie</div>
            ${g.esercizi.map((e, j) => html`<${Esercizio} key=${j} esercizio=${e} />`)}
          </div>`
    : html`<${Esercizio} key=${i} esercizio=${g.esercizi[0]} />`))}
      ${esercizi.length === 0 && html`<p class="secondario">Nessun dato</p>`}
      ${totali && html`<p class="totali-hevy">${totali}</p>`}
    </${Sezione}>`;
}

/** Sezione `sessione`: `id` della sessione unita (o di una sua parte), `da` = sezione di provenienza. */
export function SezioneSessione({ id, da, data }) {
  const { dati, vai } = useContext(Contesto);
  const sessione = unisciSessioni(sessioniValide(dati.sessioni))
    .find((s) => s.id === id || s.parti.some((p) => p.id === id)) ?? null;
  const indietro = () => (da === 'giornata' ? vai('giornata', { data }) : vai(da ?? 'oggi'));
  const pulsante = html`<button type="button" class="pulsante indietro" onClick=${indietro}>‹ Indietro</button>`;

  if (!sessione) {
    return html`
      <section class="sezione scheda-attivita">
        <header class="testata-attivita">${pulsante}</header>
        <${Vuoto} testo="Nessun dato" />
      </section>`;
  }

  const tracciato = trovaTracciato(sessione, dati.tracciati);
  const fcSerie = serieDellaSessione(sessione);
  const statistiche = statisticheFc(fcSerie);
  const hevy = piuLunga(sessione.parti.filter((p) => p.fonte === 'hevy'));
  const tipo = TIPI[sessione.tipo] ?? TIPI.altro;
  const fonti = [...sessione.fonti.map((f) => FONTI[f] ?? f), ...(tracciato ? ['GPX'] : [])].join(' · ');

  const riepilogo = html`<${Riepilogo} sessione=${sessione} statistiche=${statistiche} tracciato=${tracciato} hevy=${hevy} />`;
  const grafico = html`<${SezioneGraficoFc} fcSerie=${fcSerie} statistiche=${statistiche} />`;
  const zone = html`<${ZoneFc} zoneMin=${sessione.zoneMin} />`;
  const sezioni = CON_TRACCIATO.includes(sessione.tipo)
    ? [riepilogo, html`<${Tracciato} tracciato=${tracciato} />`, tracciato && html`<${SplitKm} tracciato=${tracciato} fcSerie=${fcSerie} />`, grafico, zone]
    : [riepilogo, hevy && html`<${EserciziHevy} hevy=${hevy} />`, grafico, zone];

  return html`
    <section class="sezione scheda-attivita">
      <header class="testata-attivita">
        ${pulsante}
        <h1 class="titolo-sezione">${tipo}</h1>
        ${sessione.nome && sessione.nome !== tipo && html`<p class="nome-attivita">${sessione.nome}</p>`}
        <p class="secondario">${`${formatoDataIso(sessione.inizio)} · ${oraRoma(sessione.inizio)}`}</p>
        ${fonti && html`<p class="secondario">${fonti}</p>`}
        ${sessione.registrazioniUnite >= 2 && html`<p class="secondario">${`unite ${sessione.registrazioniUnite} registrazioni`}</p>`}
      </header>
      ${sezioni.filter(Boolean)}
    </section>`;
}
