import { aggiungiGiorni } from './date.js';

export const OBIETTIVO_SONNO_PREDEFINITO = 480;

const MIN_VALORI = 7;

/** @returns {boolean} vero per numeri finiti maggiori di zero. */
function valido(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Percentuale di sonno rispetto all'obiettivo (spec §6.2), limitata a 100.
 * @param {object} docSalute documento salute del giorno
 * @param {number} [obiettivoMin] obiettivo in minuti (predefinito 480)
 * @returns {number|null} null senza dato di sonno
 */
export function percentualeSonno(docSalute, obiettivoMin = OBIETTIVO_SONNO_PREDEFINITO) {
  const minuti = docSalute?.sonno?.minutiAddormentato;
  if (typeof minuti !== 'number' || !Number.isFinite(minuti)) return null;
  const obiettivo = valido(obiettivoMin) ? obiettivoMin : OBIETTIVO_SONNO_PREDEFINITO;
  return Math.min(100, Math.round((100 * minuti) / obiettivo));
}

/** Somma dei minuti dei pisolini del giorno (0 se nessuno). */
export function minutiPisolini(docSalute) {
  const lista = docSalute?.pisolini;
  if (!Array.isArray(lista)) return 0;
  return lista.reduce((somma, p) => somma + (valido(p?.minutiAddormentato) ? p.minutiAddormentato : 0), 0);
}

/**
 * Medie di FC a riposo e HRV (rmssd) sui 30 giorni precedenti, oggi escluso.
 * @param {Object<string, object>} salute documenti salute per data
 * @param {string} data YYYY-MM-DD
 * @returns {{fc: number|null, nFc: number, hrv: number|null, nHrv: number}}
 */
export function medie30(salute, data) {
  const fc = [];
  const hrv = [];
  for (let i = 1; i <= 30; i++) {
    const doc = salute?.[aggiungiGiorni(data, -i)];
    if (valido(doc?.fcRiposo)) fc.push(doc.fcRiposo);
    if (valido(doc?.hrv?.rmssd)) hrv.push(doc.hrv.rmssd);
  }
  const media = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  return { fc: media(fc), nFc: fc.length, hrv: media(hrv), nHrv: hrv.length };
}

/**
 * Stato di recupero e indice 0-100 (spec §6.3).
 * @param {Object<string, object>} salute documenti salute per data
 * @param {string} data YYYY-MM-DD
 * @returns {{stato: 'nessun-dato'|'calibrazione'|'ok', fc: number|null, freccia: 'su'|'giu'|'uguale'|null, indice: number|null}}
 */
export function recupero(salute, data) {
  const doc = salute?.[data];
  const fcOggi = doc?.fcRiposo;
  if (!valido(fcOggi)) return { stato: 'nessun-dato', fc: null, freccia: null, indice: null };
  const m = medie30(salute, data);
  if (m.nFc < MIN_VALORI) return { stato: 'calibrazione', fc: fcOggi, freccia: null, indice: null };
  const diff = fcOggi - m.fc;
  const freccia = Math.abs(diff) < 1 ? 'uguale' : diff > 0 ? 'su' : 'giu';
  const delta = [(m.fc - fcOggi) / m.fc];
  const hrvOggi = doc?.hrv?.rmssd;
  if (valido(hrvOggi) && m.nHrv >= MIN_VALORI) delta.push((hrvOggi - m.hrv) / m.hrv);
  const media = delta.reduce((s, v) => s + v, 0) / delta.length;
  const indice = Math.max(0, Math.min(100, Math.round(50 + 250 * media)));
  return { stato: 'ok', fc: fcOggi, freccia, indice };
}
