import { dataDaIso } from './date.js';

const PRIO_SALUTE = ['googleHealth', 'strava', 'hevy', 'komoot'];
const PRIO_TIPO = ['hevy', 'strava', 'komoot', 'googleHealth'];
const PRIO_DISTANZA = ['strava', 'komoot', 'googleHealth', 'hevy'];

/** Priorità delle fonti per ciascun campo unito (spec §6.1). */
export const PRIORITA = {
  tipo: PRIO_TIPO,
  nome: PRIO_TIPO,
  fcMedia: PRIO_SALUTE,
  zoneMin: PRIO_SALUTE,
  calorie: PRIO_SALUTE,
  durataAttivaMin: PRIO_SALUTE,
  passi: PRIO_SALUTE,
  distanzaM: PRIO_DISTANZA,
  dislivelloM: PRIO_DISTANZA,
};

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const durataMs = (s) => {
  const a = ms(s.inizio);
  const b = ms(s.fine);
  return a === null || b === null ? 0 : Math.max(0, b - a);
};

const sovrapposizioneMs = (a, b) => {
  const inizio = Math.max(ms(a.inizio), ms(b.inizio));
  const fine = Math.min(ms(a.fine), ms(b.fine));
  return Math.max(0, fine - inizio);
};

/** Posizione di una fonte nell'elenco di priorità; le fonti non elencate vanno in coda. */
const rango = (elenco, fonte) => {
  const i = elenco.indexOf(fonte);
  return i === -1 ? elenco.length : i;
};

/** Primo valore non nullo tra le parti, in ordine di priorità della fonte. */
function scegli(parti, campo) {
  const elenco = PRIORITA[campo];
  const ordinate = [...parti].sort((a, b) => rango(elenco, a.fonte) - rango(elenco, b.fonte));
  for (const p of ordinate) {
    if (p[campo] !== null && p[campo] !== undefined) return p[campo];
  }
  return null;
}

/**
 * Unisce le sessioni di fonti diverse che si sovrappongono per almeno metà
 * della più breve. Un gruppo non contiene mai due parti della stessa fonte.
 * @param {Array<object>} sessioni documenti sessione con `id`
 * @returns {Array<object>} sessioni unite, per `inizio` decrescente
 */
export function unisciSessioni(sessioni) {
  const n = sessioni.length;
  const durate = sessioni.map(durataMs);

  const coppie = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = sessioni[i];
      const b = sessioni[j];
      if (a.fonte === b.fonte || !durate[i] || !durate[j]) continue;
      const sov = sovrapposizioneMs(a, b);
      if (sov > 0 && sov >= 0.5 * Math.min(durate[i], durate[j])) coppie.push({ i, j, sov });
    }
  }
  coppie.sort((x, y) => y.sov - x.sov || x.i - y.i || x.j - y.j);

  // union-find, con le fonti presenti in ciascun gruppo
  const padre = sessioni.map((_, i) => i);
  const fonti = sessioni.map((s) => new Set([s.fonte]));
  const radice = (x) => {
    while (padre[x] !== x) {
      padre[x] = padre[padre[x]];
      x = padre[x];
    }
    return x;
  };
  for (const { i, j } of coppie) {
    const ri = radice(i);
    const rj = radice(j);
    if (ri === rj) continue;
    if ([...fonti[ri]].some((f) => fonti[rj].has(f))) continue;
    padre[rj] = ri;
    for (const f of fonti[rj]) fonti[ri].add(f);
  }

  const gruppi = new Map();
  sessioni.forEach((s, i) => {
    const r = radice(i);
    if (!gruppi.has(r)) gruppi.set(r, []);
    gruppi.get(r).push(s);
  });

  const unite = [];
  for (const gruppo of gruppi.values()) {
    const parti = [...gruppo].sort((a, b) => (ms(a.inizio) ?? 0) - (ms(b.inizio) ?? 0));
    const inizio = parti[0].inizio;
    const fine = parti.reduce((m, p) => (ms(p.fine) > ms(m) ? p.fine : m), parti[0].fine);
    unite.push({
      id: parti[0].id,
      data: dataDaIso(inizio),
      inizio,
      fine,
      fonti: [...new Set(parti.map((p) => p.fonte))].sort(),
      parti,
      tipo: scegli(parti, 'tipo'),
      nome: scegli(parti, 'nome'),
      durataAttivaMin: scegli(parti, 'durataAttivaMin'),
      fcMedia: scegli(parti, 'fcMedia'),
      zoneMin: scegli(parti, 'zoneMin'),
      calorie: scegli(parti, 'calorie'),
      passi: scegli(parti, 'passi'),
      distanzaM: scegli(parti, 'distanzaM'),
      dislivelloM: scegli(parti, 'dislivelloM'),
    });
  }
  return unite.sort((a, b) => (ms(b.inizio) ?? 0) - (ms(a.inizio) ?? 0));
}
