/** Grafici SVG della scheda attività (spec §8): FC nel tempo, percorso e profilo altimetrico. */
import { html, useState } from '../html.js';
import { numero, minSec } from '../formato.js';

const FC = '#2BC4A6';
const ALLENAMENTO = '#5B9BFF';

/** Passo "comodo" per l'asse dei minuti: al massimo ~6 tacche. */
function passoMinuti(totMin) {
  for (const p of [1, 2, 5, 10, 15, 20, 30, 60]) if (totMin / p <= 6) return p;
  return 120;
}

/**
 * Linea della FC nel tempo, interrotta dove `bpm` è null; tratteggiate media e massimo;
 * al tocco o al passaggio del puntatore "12′30″ · 148 bpm".
 * @param {{ fcSerie: {passoSec, bpm: Array<number|null>}, statistiche: {media, massima} }} props
 */
export function GraficoFc({ fcSerie, statistiche }) {
  const [punto, setPunto] = useState(null);
  const W = 600;
  const H = 220;
  const m = { s: 48, d: 10, a: 12, b: 30 };
  const bpm = fcSerie.bpm;
  const passo = fcSerie.passoSec;
  const n = bpm.length;
  const valori = bpm.filter(numero);
  const minimo = Math.floor((Math.min(...valori) - 5) / 10) * 10;
  const massimo = Math.ceil((Math.max(...valori) + 5) / 10) * 10;
  const larg = W - m.s - m.d;
  const alt = H - m.a - m.b;
  const x = (i) => m.s + (n <= 1 ? 0 : (i / (n - 1)) * larg);
  const y = (v) => m.a + alt - ((v - minimo) / (massimo - minimo)) * alt;

  let d = '';
  let aperto = false;
  bpm.forEach((v, i) => {
    if (!numero(v)) { aperto = false; return; }
    d += `${aperto ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    aperto = true;
  });
  // punti isolati (tra due null) visibili come cerchietti
  const isolati = bpm.map((v, i) => (numero(v) && !numero(bpm[i - 1]) && !numero(bpm[i + 1]) ? i : null)).filter((i) => i !== null);

  const totMin = (n * passo) / 60;
  const pm = passoMinuti(totMin);
  const tacche = [];
  for (let t = 0; t <= totMin; t += pm) tacche.push(t);
  const tbpm = [minimo, Math.round((minimo + massimo) / 2), massimo];

  const segui = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    const xs = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((xs - m.s) / larg) * (n - 1));
    if (i < 0 || i >= n) { setPunto(null); return; }
    // valore più vicino non nullo entro 3 blocchi
    for (let k = 0; k <= 3; k++) {
      for (const j of [i - k, i + k]) {
        if (j >= 0 && j < n && numero(bpm[j])) { setPunto(j); return; }
      }
    }
    setPunto(null);
  };

  return html`
    <div class="grafico">
      <p class="grafico-tooltip numero" aria-live="polite">${punto !== null ? `${minSec(punto * passo)} · ${bpm[punto]} bpm` : ''}</p>
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Frequenza cardiaca durante l'allenamento"
        onPointerMove=${segui} onPointerDown=${segui} onPointerLeave=${() => setPunto(null)}>
        ${tbpm.map((v) => html`
          <g key=${'y' + v}>
            <line x1=${m.s} x2=${W - m.d} y1=${y(v)} y2=${y(v)} class="griglia" />
            <text x=${m.s - 6} y=${y(v) + 4} text-anchor="end" class="asse">${v}</text>
          </g>`)}
        ${tacche.map((t) => html`
          <text key=${'x' + t} x=${x(Math.min(n - 1, (t * 60) / passo))} y=${H - 6} text-anchor="middle" class="asse">${t}′</text>`)}
        <line x1=${m.s} x2=${W - m.d} y1=${y(statistiche.media)} y2=${y(statistiche.media)} stroke=${FC} stroke-dasharray="6 6" opacity="0.6" />
        <line x1=${m.s} x2=${W - m.d} y1=${y(statistiche.massima)} y2=${y(statistiche.massima)} stroke="#FF6B6B" stroke-dasharray="6 6" opacity="0.6" />
        <path d=${d} fill="none" stroke=${FC} stroke-width="2" stroke-linejoin="round" />
        ${isolati.map((i) => html`<circle key=${'p' + i} cx=${x(i)} cy=${y(bpm[i])} r="2" fill=${FC} />`)}
        ${punto !== null && html`
          <g>
            <line x1=${x(punto)} x2=${x(punto)} y1=${m.a} y2=${m.a + alt} class="cursore" />
            <circle cx=${x(punto)} cy=${y(bpm[punto])} r="5" fill=${FC} stroke="#000" stroke-width="2" />
          </g>`}
      </svg>
      <p class="legenda secondario">
        <span class="legenda-voce"><span class="tratteggio" style=${`border-color:${FC}`}></span>Media ${statistiche.media} bpm</span>
        <span class="legenda-voce"><span class="tratteggio" style="border-color:#FF6B6B"></span>Massimo ${statistiche.massima} bpm</span>
      </p>
    </div>`;
}

/** Profilo altimetrico da `quote` ([[sec, metri], …]). */
function Profilo({ quote }) {
  const W = 600;
  const H = 120;
  const m = { s: 48, d: 10, a: 12, b: 8 };
  const tMax = Math.max(...quote.map(([t]) => t)) || 1;
  const metri = quote.map(([, q]) => q);
  const qMin = Math.min(...metri);
  const qMax = Math.max(...metri);
  const span = qMax - qMin || 1;
  const x = (t) => m.s + (t / tMax) * (W - m.s - m.d);
  const y = (q) => m.a + (1 - (q - qMin) / span) * (H - m.a - m.b);
  const linea = quote.map(([t, q], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(q).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(quote.at(-1)[0]).toFixed(1)} ${H - m.b} L${x(quote[0][0]).toFixed(1)} ${H - m.b} Z`;
  return html`
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Profilo altimetrico" class="profilo">
      <path d=${area} fill=${ALLENAMENTO} opacity="0.2" />
      <path d=${linea} fill="none" stroke=${ALLENAMENTO} stroke-width="2" />
      <text x=${m.s - 6} y=${y(qMax) + 4} text-anchor="end" class="asse">${Math.round(qMax)}</text>
      <text x=${m.s - 6} y=${y(qMin) + 4} text-anchor="end" class="asse">${Math.round(qMin)}</text>
    </svg>`;
}

/** Percorso nella cornice 1000×1000 con partenza, arrivo e numerini dei km; profilo sotto se ci sono le quote. */
export function MappaTracciato({ tracciato }) {
  const percorso = Array.isArray(tracciato.percorso) ? tracciato.percorso : [];
  const quote = Array.isArray(tracciato.quote) && tracciato.quote.length >= 2 ? tracciato.quote : null;
  const punti = percorso.map(([x, y]) => `${x},${y}`).join(' ');
  const partenza = percorso[0];
  const arrivo = percorso.at(-1);
  return html`
    <div class="tracciato">
      ${percorso.length >= 2 && html`
        <svg viewBox="0 0 1000 1000" width="100%" role="img" aria-label="Percorso" class="mappa">
          <polyline points=${punti} fill="none" stroke=${ALLENAMENTO} stroke-width="8" stroke-linejoin="round" stroke-linecap="round" />
          ${(tracciato.segniKm ?? []).map(([x, y], i) => html`
            <g key=${i}>
              <circle cx=${x} cy=${y} r="22" fill="#16171A" stroke=${ALLENAMENTO} stroke-width="4" />
              <text x=${x} y=${y + 9} text-anchor="middle" class="segno-km">${i + 1}</text>
            </g>`)}
          <circle cx=${partenza[0]} cy=${partenza[1]} r="18" fill=${FC} stroke="#000" stroke-width="4" />
          <circle cx=${arrivo[0]} cy=${arrivo[1]} r="18" fill="#FFFFFF" stroke="#000" stroke-width="4" />
        </svg>`}
      ${quote && html`<${Profilo} quote=${quote} />`}
    </div>`;
}
