// Orchestrazione della sincronizzazione: legge i cinque tipi di dato dalla
// Google Health API, li normalizza e produce il risultato di §4.2 del design.
import { ErroreSync } from './googleHealth/client.js';
import { giorniSalute, sessioniDa } from './googleHealth/normalizza.js';
import { oggiRoma, aggiungiGiorni } from '../logic/date.js';

const GIORNI_FINESTRA = 3;

export async function eseguiSync({ client, adesso }) {
  const al = oggiRoma(adesso);
  const dal = aggiungiGiorni(al, -(GIORNI_FINESTRA - 1));
  const al1 = aggiungiGiorni(al, 1);
  const intervallo = (campo) => `${campo} >= "${dal}" AND ${campo} < "${al1}"`;

  const letture = [
    ['sleep', () => client.elenca('sleep', intervallo('sleep.interval.civil_end_time'))],
    ['daily-resting-heart-rate', () => client.elenca('daily-resting-heart-rate', intervallo('daily_resting_heart_rate.date'))],
    ['daily-heart-rate-variability', () => client.elenca('daily-heart-rate-variability', intervallo('daily_heart_rate_variability.date'))],
    ['exercise', () => client.elenca('exercise', intervallo('exercise.interval.civil_start_time'))],
    ['steps', () => client.rollupGiornaliero('steps', dal, al1)],
  ];

  // Sequenziale: un solo scambio di token e nessun picco di richieste.
  const dati = {};
  const tipiMancanti = [];
  for (const [tipo, leggi] of letture) {
    try {
      dati[tipo] = await leggi();
    } catch (e) {
      if (e instanceof ErroreSync && (e.codice === 'autorizzazione' || e.codice === 'configurazione')) throw e;
      tipiMancanti.push(tipo);
    }
  }
  if (tipiMancanti.length === letture.length) throw new ErroreSync('rete', 'Google Health non raggiungibile');

  const giorni = giorniSalute({
    sonno: dati.sleep,
    fcRiposo: dati['daily-resting-heart-rate'],
    hrv: dati['daily-heart-rate-variability'],
    passi: dati.steps,
  }, { dal, al, adesso });
  const sessioni = dati.exercise ? sessioniDa(dati.exercise, { dal, al, adesso }) : [];

  const op = tipiMancanti.length ? 'update' : 'set';
  const operazioni = [
    ...Object.entries(giorni).map(([data, doc]) => ({ op, collection: 'salute', doc_id: data, data: doc })),
    ...sessioni.map(({ id, doc }) => ({ op: 'set', collection: 'sessioni', doc_id: id, data: doc })),
  ];

  return {
    generatoIl: adesso.toISOString(),
    finestra: { dal, al },
    esito: tipiMancanti.length ? 'parziale' : 'ok',
    tipiMancanti,
    conteggi: { giorni: Object.keys(giorni).length, sessioni: sessioni.length },
    operazioni,
  };
}
