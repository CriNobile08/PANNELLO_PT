import { versioneValida, versioniFuture } from './versioni.js';
import { GIORNI, giornoSettimana, giorniDellaSettimana } from './date.js';

export function risolviGiorno(data, { settimane, eccezioni }) {
  const versione = versioneValida(settimane, data);
  const eccezione = eccezioni?.[data] ?? null;
  if (eccezione) {
    return { data, schedaId: eccezione.schedaId ?? null, fonte: 'eccezione', eccezione, versione };
  }
  if (versione) {
    const schedaId = versione.giorni?.[giornoSettimana(data)] ?? null;
    return { data, schedaId, fonte: 'settimana', eccezione: null, versione };
  }
  return { data, schedaId: null, fonte: 'nessuna', eccezione: null, versione: null };
}

export function risolviSettimana(lunedi, dati) {
  return giorniDellaSettimana(lunedi).map((data, i) => ({
    ...risolviGiorno(data, dati),
    giorno: GIORNI[i],
  }));
}

export function eccezioniSpostamento(da, a, schedaId) {
  return [
    { data: a, doc: { schedaId, origine: da } },
    { data: da, doc: { schedaId: null, origine: null } },
  ];
}

const usaScheda = (versione, schedaId) =>
  Object.values(versione.giorni ?? {}).includes(schedaId);

export function usiScheda(schedaId, { settimane, eccezioni }, oggi) {
  const usi = [];
  const inVigore = versioneValida(settimane, oggi);
  if (inVigore && usaScheda(inVigore, schedaId)) usi.push({ tipo: 'settimana', versione: inVigore });
  for (const v of versioniFuture(settimane, oggi)) {
    if (usaScheda(v, schedaId)) usi.push({ tipo: 'settimana', versione: v });
  }
  for (const data of Object.keys(eccezioni ?? {}).sort()) {
    if (data >= oggi && eccezioni[data]?.schedaId === schedaId) usi.push({ tipo: 'eccezione', data });
  }
  return usi;
}
