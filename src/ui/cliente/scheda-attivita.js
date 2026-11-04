/** Scheda attività di una sessione unita (spec §8): lettura, più caricamento del GPX per chi può scrivere. */
import { html, useContext, useState, useRef } from '../html.js';
import { Contesto } from '../contesto.js';
import { Vuoto, Dialogo } from '../componenti.js';
import { leggiGpx, analizzaGpx, sovrapposizione } from '../../logic/gpx.js';
import { unisciSessioni, sessioniValide } from '../../logic/sessioni.js';
import { statisticheFc, fcPerKm } from '../../logic/fc.js';
import { formatoDataIso, oraRoma } from '../../logic/date.js';
import { numero, migliaia, minSec, conUnita } from '../formato.js';
import { testoDurata, FONTI, ZONE } from './sessioni.js';
import { TIPI } from './tipi.js';
import { GraficoFc, MappaTracciato } from './grafici.js';

const ASSENTE = '—';
const CON_TRACCIATO = ['corsa', 'trekking'];

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

/** Id della parte con un tracciato (la chiave in `tracciati`), o null. */
function chiaveTracciato(sessione, tracciati) {
  return (sessione?.parti ?? []).find((p) => tracciati?.[p.id])?.id ?? null;
}

/**
 * Parte a cui collegare un nuovo tracciato: la parte Google Health più lunga, altrimenti la prima per `inizio`.
 * @returns {string|null} id della parte
 */
export function parteDaCollegare(sessione) {
  const parti = sessione?.parti ?? [];
  const gh = piuLunga(parti.filter((p) => p.fonte === 'googleHealth'));
  if (gh) return gh.id;
  const prima = [...parti].sort((a, b) => (Date.parse(a.inizio) || 0) - (Date.parse(b.inizio) || 0))[0];
  return prima?.id ?? null;
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

const MAX_BYTE_GPX = 15 * 1024 * 1024;
const SOVRAPPOSIZIONE_MINIMA = 0.5;
const TESTO = {
  troppoGrande: 'File troppo grande (massimo 15 MB)',
  nonValido: 'File GPX non valido: servono punti con data e ora',
  nonRiuscito: 'Caricamento non riuscito. Riprova.',
  sovrapposizione: 'Il tracciato non coincide con questa sessione (orari diversi). Collegarlo comunque?',
};
const avvisa = (testo) => (e) => console.warn(testo, e);

/**
 * Sezione Tracciato. Con `puoScrivere` e `asset`: caricamento, sostituzione e rimozione del GPX (spec §8, §9).
 * Ordine: lettura (≤ 15 MB) → leggiGpx → analizzaGpx → sovrapposizione (dialogo se < 0,5) → asset.carica →
 * store.salvaTracciato → (sostituzione) asset.elimina(vecchio). Se la scrittura fallisce si elimina l'asset nuovo.
 */
function Tracciato({ sessione, tracciato }) {
  const { dati, store, asset, puoScrivere, segnalaRifiuto } = useContext(Contesto);
  const [occupato, setOccupato] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  const [dialogo, setDialogo] = useState(null); // null | { tipo: 'sovrapposizione', collega } | { tipo: 'rimuovi' }
  const input = useRef(null);
  const modificabile = puoScrivere && !!asset;
  const chiave = chiaveTracciato(sessione, dati.tracciati);

  async function salva(file, analisi) {
    const idParte = chiave ?? parteDaCollegare(sessione);
    const vecchio = chiave ? dati.tracciati[chiave]?.idAsset ?? null : null;
    let idAsset;
    try {
      ({ id: idAsset } = await asset.carica(file));
    } catch (e) {
      console.warn('Caricamento del GPX non riuscito', e);
      setMessaggio(TESTO.nonRiuscito);
      setOccupato(false);
      return;
    }
    try {
      await store.salvaTracciato({ idParte, doc: { ...analisi, idParte, fonte: 'gpx', nomeFile: String(file.name ?? 'GPX'), idAsset } });
    } catch (e) {
      segnalaRifiuto?.(e);
      asset.elimina(idAsset).catch(avvisa('Eliminazione dell\'asset non riuscita'));
      setMessaggio(TESTO.nonRiuscito);
      setOccupato(false);
      return;
    }
    if (vecchio && vecchio !== idAsset) asset.elimina(vecchio).catch(avvisa('Eliminazione del vecchio asset non riuscita'));
    setOccupato(false);
  }

  async function scelto(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // lo stesso file si può scegliere di nuovo
    if (!file || occupato) return;
    setMessaggio(null);
    if (file.size > MAX_BYTE_GPX) {
      setMessaggio(TESTO.troppoGrande);
      return;
    }
    setOccupato(true);
    let analisi;
    try {
      analisi = analizzaGpx(leggiGpx(await file.text(), DOMParser));
    } catch {
      setMessaggio(TESTO.nonValido);
      setOccupato(false);
      return;
    }
    if (sovrapposizione(analisi, sessione) < SOVRAPPOSIZIONE_MINIMA) {
      setDialogo({ tipo: 'sovrapposizione', collega: () => salva(file, analisi) });
      return;
    }
    await salva(file, analisi);
  }

  async function rimuovi() {
    setDialogo(null);
    setMessaggio(null);
    setOccupato(true);
    const idAsset = dati.tracciati[chiave]?.idAsset ?? null;
    try {
      await store.rimuoviTracciato(chiave);
    } catch (e) {
      setMessaggio(segnalaRifiuto?.(e) ?? 'Salvataggio non riuscito. Riprova.');
      setOccupato(false);
      return;
    }
    if (idAsset) asset.elimina(idAsset).catch(avvisa('Eliminazione dell\'asset non riuscita'));
    setOccupato(false);
  }

  const scegli = () => input.current?.click();
  const controlli = modificabile && html`
    <input type="file" accept=".gpx,application/gpx+xml" class="visivamente-nascosto" tabindex="-1" aria-hidden="true"
      ref=${input} disabled=${occupato} onChange=${scelto} />
    <div class="azioni-riga">
      ${tracciato
    ? html`
          <button type="button" class="pulsante" disabled=${occupato} onClick=${scegli}>Sostituisci</button>
          <button type="button" class="pulsante" disabled=${occupato} onClick=${() => setDialogo({ tipo: 'rimuovi' })}>Rimuovi</button>`
    : html`<button type="button" class="pulsante primario" disabled=${occupato} onClick=${scegli}>Carica tracciato GPX</button>`}
    </div>
    ${messaggio && html`<p class="errore-scrittura" role="alert">${messaggio}</p>`}`;

  return html`
    <${Sezione} titolo="Tracciato">
      ${tracciato
    ? html`<p class="secondario nome-file">${tracciato.nomeFile ?? 'GPX'}</p><${MappaTracciato} tracciato=${tracciato} />`
    : html`<p class="secondario">Nessun tracciato</p>`}
      ${controlli}
      ${dialogo?.tipo === 'sovrapposizione' && html`
        <${Dialogo} titolo=${TESTO.sovrapposizione} azioni=${[
  { testo: 'Annulla', onClick: () => { setDialogo(null); setOccupato(false); } },
  { testo: 'Collega', primaria: true, onClick: () => { const { collega } = dialogo; setDialogo(null); collega(); } },
]} />`}
      ${dialogo?.tipo === 'rimuovi' && html`
        <${Dialogo} titolo="Rimuovere il tracciato?" azioni=${[
  { testo: 'Annulla', onClick: () => setDialogo(null) },
  { testo: 'Rimuovi', primaria: true, onClick: rimuovi },
]} />`}
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

  const riepilogo = html`<${Riepilogo} key="riepilogo" sessione=${sessione} statistiche=${statistiche} tracciato=${tracciato} hevy=${hevy} />`;
  const grafico = html`<${SezioneGraficoFc} key="grafico" fcSerie=${fcSerie} statistiche=${statistiche} />`;
  const zone = html`<${ZoneFc} key="zone" zoneMin=${sessione.zoneMin} />`;
  const sezioni = CON_TRACCIATO.includes(sessione.tipo)
    ? [riepilogo, html`<${Tracciato} key="tracciato" sessione=${sessione} tracciato=${tracciato} />`,
      tracciato && html`<${SplitKm} key="split" tracciato=${tracciato} fcSerie=${fcSerie} />`, grafico, zone]
    : [riepilogo, hevy && html`<${EserciziHevy} key="hevy" hevy=${hevy} />`, grafico, zone];

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
