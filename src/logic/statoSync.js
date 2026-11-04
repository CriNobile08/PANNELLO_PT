// Stato della sincronizzazione per fonte (spec 2c-1 §5.5), compatibile con il
// formato del 2a senza `fonti`.
const NOMI = { googleHealth: 'Orologio', hevy: 'Hevy' };

/** @returns {Array<{ nome: string, esito: string, messaggio: string }>} */
export function fontiStato(stato) {
  if (!stato) return [];
  const fonti = stato.fonti ?? { googleHealth: { esito: stato.esito, messaggio: stato.messaggio } };
  return Object.entries(fonti).map(([chiave, f]) => ({
    nome: NOMI[chiave] ?? chiave,
    esito: f?.esito ?? 'ok',
    messaggio: f?.messaggio ?? '',
  }));
}
