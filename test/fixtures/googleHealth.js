// Fixture con le chiavi reali viste nello spike dell'API Google Health.
// I numeri marcati "stringa" arrivano come stringhe JSON.

function dataCivile(data) {
  const [year, month, day] = data.split('-').map(Number);
  return { year, month, day };
}

export function puntoSonno({ inizio, fine, principale = true, fasi, tipo = 'STAGES', minutiAddormentato = 0 }) {
  const minutiSveglio = fasi?.AWAKE ?? 0;
  return {
    name: 'users/me/dataTypes/sleep/dataPoints/sonno-' + fine,
    dataSource: { recordingMethod: 'DERIVED' },
    sleep: {
      interval: { startTime: inizio, startUtcOffset: '3600s', endTime: fine, endUtcOffset: '3600s' },
      type: tipo,
      stages: [],
      metadata: { stagesStatus: 'SUCCEEDED', processed: true, mainSleep: principale },
      summary: {
        minutesInSleepPeriod: String(minutiAddormentato + minutiSveglio),
        minutesAfterWakeUp: '0',
        minutesToFallAsleep: '12',
        minutesAsleep: String(minutiAddormentato),
        minutesAwake: String(minutiSveglio),
        stagesSummary: fasi
          ? Object.entries(fasi).map(([type, minuti]) => ({ type, minutes: String(minuti), count: '1' }))
          : [],
      },
      createTime: fine,
      updateTime: fine,
    },
  };
}

export function puntoFc(data, bpm) {
  return {
    dataSource: { recordingMethod: 'DERIVED' },
    dailyRestingHeartRate: {
      date: dataCivile(data),
      beatsPerMinute: String(bpm),
      dailyRestingHeartRateMetadata: { calculationMethod: 'WITH_SLEEP' },
    },
  };
}

export function puntoHrv(data, rmssd, { profondo, fcNonRem } = {}) {
  const dailyHeartRateVariability = {
    date: dataCivile(data),
    averageHeartRateVariabilityMilliseconds: rmssd,
    entropy: 2.1,
  };
  if (profondo !== undefined) dailyHeartRateVariability.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds = profondo;
  if (fcNonRem !== undefined) dailyHeartRateVariability.nonRemHeartRateBeatsPerMinute = String(fcNonRem);
  return { dataSource: { recordingMethod: 'DERIVED' }, dailyHeartRateVariability };
}

export function rollupPassi(data, n) {
  const date = dataCivile(data);
  return {
    civilStartTime: { date, time: {} },
    civilEndTime: { date, time: {} },
    steps: { countSum: String(n) },
  };
}

export function puntoEsercizio({
  id = 'es1', inizio, fine, tipo = 'WEIGHTS', nome = 'Pesi', durataAttiva = '3720s',
  fcMedia = 118, kcal = 310, passi = 0, distanzaMm = 0, dislivelloMm = 0,
  zone = { lightTime: '600s', moderateTime: '1800s', vigorousTime: '900s', peakTime: '60s' },
  gps = false,
} = {}) {
  return {
    name: 'users/me/dataTypes/exercise/dataPoints/' + id,
    dataSource: { recordingMethod: 'ACTIVELY_MEASURED' },
    exercise: {
      interval: { startTime: inizio, endTime: fine, startUtcOffset: '3600s', endUtcOffset: '3600s' },
      exerciseType: tipo,
      displayName: nome,
      activeDuration: durataAttiva,
      metricsSummary: {
        averageHeartRateBeatsPerMinute: String(fcMedia),
        caloriesKcal: kcal,
        steps: String(passi),
        distanceMillimeters: distanzaMm,
        elevationGainMillimeters: dislivelloMm,
        heartRateZoneDurations: zone,
      },
      exerciseMetadata: { hasGps: gps },
    },
  };
}
