/** Logica della frequenza cardiaca (spec §5.1 e §6.3). */

const mediaArrotondata = (valori) =>
  valori.length ? Math.round(valori.reduce((a, b) => a + b, 0) / valori.length) : null;

/**
 * Costruisce fcSerie dai campioni FC: media arrotondata per blocco, null se vuoto.
 * Scarta campioni fuori da [inizio, fine) e valori non numerici o non positivi.
 * @param {Array<{t: string, bpm: number|string}>} campioni
 * @param {string} inizio ISO
 * @param {string} fine ISO
 * @param {number} [passoSec]
 * @returns {{passoSec: number, inizio: string, bpm: Array<number|null>}}
 */
export function serieFc(campioni, inizio, fine, passoSec = 10) {
  const t0 = Date.parse(inizio);
  const t1 = Date.parse(fine);
  const passoMs = passoSec * 1000;
  const n = Number.isNaN(t0) || Number.isNaN(t1) ? 0 : Math.max(0, Math.ceil((t1 - t0) / passoMs));
  const blocchi = Array.from({ length: n }, () => []);
  for (const c of campioni ?? []) {
    const t = Date.parse(c?.t);
    const v = Number(c?.bpm);
    if (Number.isNaN(t) || !Number.isFinite(v) || v <= 0) continue;
    if (t < t0 || t >= t1) continue;
    const i = Math.floor((t - t0) / passoMs);
    if (i >= 0 && i < n) blocchi[i].push(v);
  }
  return { passoSec, inizio, bpm: blocchi.map(mediaArrotondata) };
}

/**
 * Media e massima sui valori non nulli.
 * @param {{bpm: Array<number|null>}|null} fcSerie
 * @returns {{media: number, massima: number}|null}
 */
export function statisticheFc(fcSerie) {
  const v = (fcSerie?.bpm ?? []).filter((x) => typeof x === 'number');
  if (!v.length) return null;
  return { media: mediaArrotondata(v), massima: Math.max(...v) };
}

/**
 * FC media per ogni split. Gli intervalli sono in secondi da inizioGpx:
 * [0, k0), [k0, k1), ..., [k_ultimo, durataSec). Un blocco conta per lo split
 * se il suo inizio (tempo assoluto) cade nell'intervallo.
 * @param {{passoSec: number, inizio: string, bpm: Array<number|null>}|null} fcSerie
 * @param {string} inizioGpx ISO
 * @param {number[]} istantiKm
 * @param {number} durataSec
 * @returns {Array<number|null>}
 */
export function fcPerKm(fcSerie, inizioGpx, istantiKm, durataSec) {
  const estremi = [0, ...istantiKm, durataSec];
  const splits = estremi.slice(0, -1).map((a, i) => [a, estremi[i + 1]]);
  const f0 = Date.parse(fcSerie?.inizio);
  const g0 = Date.parse(inizioGpx);
  if (!fcSerie || Number.isNaN(f0) || Number.isNaN(g0)) return splits.map(() => null);
  const offset = (g0 - f0) / 1000;
  return splits.map(([a, b]) => {
    const valori = [];
    fcSerie.bpm.forEach((v, i) => {
      const inizioBlocco = i * fcSerie.passoSec;
      if (typeof v === 'number' && inizioBlocco >= a + offset && inizioBlocco < b + offset) valori.push(v);
    });
    return mediaArrotondata(valori);
  });
}
