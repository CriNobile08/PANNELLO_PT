// FC per orario: per ogni sessione Hevy appena letta, prende la FC di Google
// Health nello stesso intervallo e la salva come `fcSerie`. Mai loggare i valori.
import { ErroreSync } from './errore.js';
import { serieFc } from '../logic/fc.js';

const valida = (iso) => typeof iso === 'string' && !Number.isNaN(Date.parse(iso));

/**
 * Modifica in place `data.fcSerie` delle operazioni di sessione Hevy.
 * @param {{operazioni: object[], leggiFc: (inizio: string, fine: string) => Promise<Array<{t: string, bpm: number}>>}} p
 * @returns {Promise<{fcSessioni: number, fallite: number}>}
 */
export async function aggiungiFcPerOrario({ operazioni, leggiFc }) {
  let fcSessioni = 0;
  let fallite = 0;
  let interrotta = false;
  for (const o of operazioni) {
    const d = o?.data;
    if (o?.op !== 'set' || o.collection !== 'sessioni' || d?.fonte !== 'hevy' || d.eliminata === true) continue;
    if (!valida(d.inizio) || !valida(d.fine)) continue;
    if (interrotta) {
      d.fcSerie = null;
      fallite++;
      continue;
    }
    try {
      d.fcSerie = serieFc(await leggiFc(d.inizio, d.fine), d.inizio, d.fine);
      fcSessioni++;
    } catch (e) {
      d.fcSerie = null;
      fallite++;
      if (e instanceof ErroreSync && (e.codice === 'autorizzazione' || e.codice === 'configurazione')) interrotta = true;
    }
  }
  return { fcSessioni, fallite };
}
