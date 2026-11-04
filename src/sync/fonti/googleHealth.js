// Fonte Google Health: legge i cinque tipi di dato, li normalizza e restituisce
// il risultato di fonte (spec 2c-1 §4.2). Lancia ErroreSync se non può leggere nulla.
import { ErroreSync } from '../errore.js';
import { giorniSalute, sessioniDa } from '../googleHealth/normalizza.js';
import { serieFc } from '../../logic/fc.js';
import { oggiRoma, aggiungiGiorni } from '../../logic/date.js';

const GIORNI_FINESTRA = 3;
const MESSAGGIO_FC = 'FC dettagliata non aggiornata';
const PAGE_SIZE_FC = 1000;

export async function fonteGoogleHealth({ client, adesso }) {
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

  // FC dettagliata: una lettura per sessione conclusa, in sequenza. Mai loggare i valori.
  let fcFallita = false;
  let fcSessioni = 0;
  for (const { doc } of sessioni) {
    doc.fcSerie = null;
    if (!doc.fine) continue;
    try {
      const filtro = `heart_rate.sample_time.physical_time >= "${doc.inizio}" AND heart_rate.sample_time.physical_time < "${doc.fine}"`;
      const punti = await client.elenca('heart-rate', filtro, PAGE_SIZE_FC);
      const campioni = punti.map((p) => ({ t: p?.heartRate?.sampleTime?.physicalTime, bpm: p?.heartRate?.beatsPerMinute }));
      doc.fcSerie = serieFc(campioni, doc.inizio, doc.fine);
      fcSessioni++;
    } catch (e) {
      if (e instanceof ErroreSync && e.codice === 'autorizzazione') throw e;
      fcFallita = true;
    }
  }

  const op = tipiMancanti.length ? 'update' : 'set';
  const operazioni = [
    ...Object.entries(giorni).map(([data, doc]) => ({ op, collection: 'salute', doc_id: data, data: doc })),
    ...sessioni.map(({ id, doc }) => ({ op: 'set', collection: 'sessioni', doc_id: id, data: doc })),
  ];

  return {
    esito: tipiMancanti.length || fcFallita ? 'parziale' : 'ok',
    messaggio: fcFallita ? MESSAGGIO_FC : '',
    finestra: { dal, al },
    tipiMancanti,
    conteggi: { giorni: Object.keys(giorni).length, sessioni: sessioni.length, fcSessioni },
    operazioni,
  };
}
