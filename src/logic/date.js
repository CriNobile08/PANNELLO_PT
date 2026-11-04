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

export function oraRoma(iso) {
  return fmtOra.format(new Date(iso));
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
