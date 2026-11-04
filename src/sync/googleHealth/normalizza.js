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
    if (FASI[f.type]) fasi[FASI[f.type]] = Number(f.minutes);
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
    const minutiAddormentato = Number(s.summary.minutesAsleep);
    if (s.metadata?.mainSleep === true) {
      const attuale = giorni[data].sonno;
      if (attuale && attuale.minutiAddormentato >= minutiAddormentato) continue;
      giorni[data].sonno = {
        inizio: s.interval.startTime,
        fine: s.interval.endTime,
        minutiAddormentato,
        minutiSveglio: Number(s.summary.minutesAwake),
        minutiPerAddormentarsi: Number(s.summary.minutesToFallAsleep),
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
