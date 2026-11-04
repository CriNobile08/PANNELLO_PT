export const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const GIORNI_LUNGHI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const fmtData = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
});
const fmtOra = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function oggiRoma(adesso = new Date()) {
  return fmtData.format(adesso);
}

const istanteValido = (iso) => {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Ora "HH:MM" (Roma) di un timestamp ISO; "…" se manca o non è valido. */
export function oraRoma(iso) {
  const d = istanteValido(iso);
  return d ? fmtOra.format(d) : '…';
}

/** Data "YYYY-MM-DD" (Roma) di un timestamp ISO; null se manca o non è valido. */
export function dataDaIso(iso) {
  const d = istanteValido(iso);
  return d ? oggiRoma(d) : null;
}

/** Data breve (es. "mer 4 nov") di un timestamp ISO; "…" se manca o non è valido. */
export function formatoDataIso(iso) {
  const data = dataDaIso(iso);
  return data ? formatoData(data) : '…';
}

function parti(data) {
  const [a, m, g] = data.split('-').map(Number);
  return { a, m, g };
}

function utc(data) {
  const { a, m, g } = parti(data);
  return Date.UTC(a, m - 1, g);
}

function indiceGiorno(data) {
  return (new Date(utc(data)).getUTCDay() + 6) % 7;
}

export function giornoSettimana(data) {
  return GIORNI[indiceGiorno(data)];
}

export function aggiungiGiorni(data, n) {
  return new Date(utc(data) + n * 86400000).toISOString().slice(0, 10);
}

export function lunediDi(data) {
  return aggiungiGiorni(data, -indiceGiorno(data));
}

export function giorniDellaSettimana(lunedi) {
  return Array.from({ length: 7 }, (_, i) => aggiungiGiorni(lunedi, i));
}

export function formatoData(data) {
  const { m, g } = parti(data);
  return `${giornoSettimana(data)} ${g} ${MESI[m - 1]}`;
}

export function formatoDataLunga(data) {
  const { m, g } = parti(data);
  return `${GIORNI_LUNGHI[indiceGiorno(data)]} ${g} ${MESI_LUNGHI[m - 1]}`;
}
