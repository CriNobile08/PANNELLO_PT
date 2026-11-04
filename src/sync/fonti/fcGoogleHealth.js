// Lettura della FC di Google Health in un intervallo, condivisa tra la fonte
// Google Health (sessioni dell'orologio) e la FC per orario sulle sessioni Hevy.
const PAGE_SIZE_FC = 1000;

/** @returns {Promise<Array<{t: string, bpm: number|string}>>} */
export async function leggiFcIntervallo(client, inizio, fine) {
  const filtro = `heart_rate.sample_time.physical_time >= "${inizio}" AND heart_rate.sample_time.physical_time < "${fine}"`;
  const punti = await client.elenca('heart-rate', filtro, PAGE_SIZE_FC);
  return punti.map((p) => ({ t: p?.heartRate?.sampleTime?.physicalTime, bpm: p?.heartRate?.beatsPerMinute }));
}
