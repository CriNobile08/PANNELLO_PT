import { dataDaIso, aggiungiGiorni } from '../../logic/date.js';

const FASI = { DEEP: 'profondo', REM: 'rem', LIGHT: 'leggero', AWAKE: 'sveglio' };

export function minutiDaDurata(durata) {
  if (durata === undefined || durata === null) return null;
  const secondi = parseFloat(durata);
  return Number.isFinite(secondi) ? Math.round(secondi / 60) : null;
}

function dataCivile(d) {
  const p = (n, l) => String(n).padStart(l, '0');
  return `${p(d.year, 4)}-${p(d.month, 2)}-${p(d.day, 2)}`;
}

function numero(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fasiDa(sleep) {
  if (sleep.type === 'CLASSIC') return null;
  const fasi = { profondo: 0, rem: 0, leggero: 0, sveglio: 0 };
  for (const f of sleep.summary?.stagesSummary ?? []) {
    if (FASI[f.type]) fasi[FASI[f.type]] = numero(f.minutes);
  }
  return fasi;
}

export function giorniSalute({ sonno, fcRiposo, hrv, passi }, { dal, al, adesso }) {
  const aggiornatoIl = adesso.toISOString();
  const giorni = {};
  for (let d = dal; d <= al; d = aggiungiGiorni(d, 1)) {
    const doc = { fonte: 'googleHealth', aggiornatoIl };
    if (sonno !== undefined) { doc.sonno = null; doc.pisolini = []; }
    if (fcRiposo !== undefined) doc.fcRiposo = null;
    if (hrv !== undefined) doc.hrv = null;
    if (passi !== undefined) doc.passi = null;
    giorni[d] = doc;
  }

  for (const p of sonno ?? []) {
    const s = p.sleep;
    const data = dataDaIso(s?.interval?.endTime);
    if (!giorni[data]) continue;
    const sm = s.summary ?? {};
    const minutiAddormentato = numero(sm.minutesAsleep);
    if (s.metadata?.mainSleep === true) {
      const attuale = giorni[data].sonno;
      if (attuale && (minutiAddormentato === null || (attuale.minutiAddormentato ?? -1) >= minutiAddormentato)) continue;
      giorni[data].sonno = {
        inizio: s.interval.startTime,
        fine: s.interval.endTime,
        minutiAddormentato,
        minutiSveglio: numero(sm.minutesAwake),
        minutiPerAddormentarsi: numero(sm.minutesToFallAsleep),
        fasi: fasiDa(s),
      };
    } else {
      giorni[data].pisolini.push({ inizio: s.interval.startTime, fine: s.interval.endTime, minutiAddormentato });
    }
  }

  for (const p of fcRiposo ?? []) {
    const r = p.dailyRestingHeartRate;
    const data = dataCivile(r.date);
    if (giorni[data]) giorni[data].fcRiposo = numero(r.beatsPerMinute);
  }

  for (const p of hrv ?? []) {
    const h = p.dailyHeartRateVariability;
    const data = dataCivile(h.date);
    if (giorni[data]) {
      giorni[data].hrv = {
        rmssd: numero(h.averageHeartRateVariabilityMilliseconds),
        rmssdProfondo: numero(h.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds),
        fcNonRem: numero(h.nonRemHeartRateBeatsPerMinute),
      };
    }
  }

  for (const p of passi ?? []) {
    const data = dataCivile(p.civilStartTime.date);
    if (giorni[data]) giorni[data].passi = numero(p.steps?.countSum);
  }

  return giorni;
}

const GRUPPI = {
  palestra: 'WEIGHTS WEIGHTLIFTING FREE_WEIGHTS WEIGHT_MACHINES STRENGTH_TRAINING FUNCTIONAL_STRENGTH_TRAINING POWERLIFTING BODY_WEIGHT CALISTHENICS CIRCUIT_TRAINING CORE_TRAINING CROSSFIT CROSS_TRAINING HIIT INTERVAL_WORKOUT TABATA_WORKOUT BOOTCAMP RESISTANCE_BANDS TRX WORKOUT',
  corsa: 'RUNNING TRAIL_RUN TREADMILL INCLINE_RUN',
  trekking: 'HIKING BACKPACKING RUCKING SNOWSHOEING',
  camminata: 'WALKING POWER_WALKING NORDIC_WALKING TREADMILL_WALK INCLINE_WALK STROLLER_WALK WALK_WITH_WEIGHTS',
  bici: 'BIKING OUTDOOR_BIKE MOUNTAIN_BIKE STATIONARY_BIKE SPINNING ELECTRIC_BIKE ASSAULT_BIKE HAND_CYCLING',
};

export const TIPI_ESERCIZIO = Object.fromEntries(
  Object.entries(GRUPPI).flatMap(([tipo, lista]) => lista.split(' ').map((t) => [t, tipo])),
);

function arrotonda(v, divisore = 1) {
  const n = numero(v);
  return n === null ? null : Math.round(n / divisore);
}

export function sessioniDa(punti, { dal, al, adesso }) {
  const aggiornatoIl = adesso.toISOString();
  const risultato = [];
  for (const p of punti ?? []) {
    const e = p.exercise;
    const inizio = e?.interval?.startTime;
    if (!inizio) continue;
    const data = dataDaIso(inizio);
    if (data < dal || data > al) continue;
    const fine = e.interval.endTime ?? null;
    const m = e.metricsSummary ?? {};
    const z = m.heartRateZoneDurations;
    let durataAttivaMin = minutiDaDurata(e.activeDuration);
    if (durataAttivaMin === null && fine) {
      const ms = Date.parse(fine) - Date.parse(inizio);
      durataAttivaMin = Number.isFinite(ms) ? Math.round(ms / 60000) : null;
    }
    const idFonte = p.name.split('/').pop();
    risultato.push({
      id: `googleHealth_${idFonte}`,
      doc: {
        fonte: 'googleHealth', idFonte, data, inizio, fine,
        tipo: TIPI_ESERCIZIO[e.exerciseType] ?? 'altro',
        tipoOriginale: e.exerciseType ?? null,
        nome: e.displayName ?? null,
        durataAttivaMin,
        fcMedia: numero(m.averageHeartRateBeatsPerMinute),
        zoneMin: z ? {
          leggera: minutiDaDurata(z.lightTime),
          moderata: minutiDaDurata(z.moderateTime),
          intensa: minutiDaDurata(z.vigorousTime),
          picco: minutiDaDurata(z.peakTime),
        } : null,
        calorie: arrotonda(m.caloriesKcal),
        passi: numero(m.steps),
        distanzaM: arrotonda(m.distanceMillimeters, 1000),
        dislivelloM: arrotonda(m.elevationGainMillimeters, 1000),
        gps: e.exerciseMetadata?.hasGps === true,
        aggiornatoIl,
      },
    });
  }
  return risultato;
}
