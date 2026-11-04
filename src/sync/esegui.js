// Orchestratore della sincronizzazione (spec 2c-1 §4): esegue le fonti in
// sequenza, isola i fallimenti e compone il contenuto di out/sync.json.
// Non lancia mai: se tutte le fonti falliscono restituisce esito "errore".
import { ErroreSync } from './errore.js';

export const MESSAGGI = {
  googleHealth: {
    autorizzazione: 'Autorizzazione Google scaduta: va rinnovato il token',
    rete: 'Google Health non raggiungibile',
    configurazione: 'Credenziali Google Health mancanti',
  },
  hevy: {
    configurazione: 'Chiave Hevy mancante',
    autorizzazione: 'Chiave Hevy non valida o abbonamento Pro scaduto',
    rete: 'Hevy non raggiungibile',
  },
};

/**
 * @param {{ fonti: Record<string, () => Promise<object>>, adesso: Date }} p
 */
export async function eseguiSync({ fonti, adesso }) {
  const risultati = {};
  const operazioni = [];
  let finestra = null;
  for (const [nome, esegui] of Object.entries(fonti)) {
    try {
      const { operazioni: ops, finestra: f, ...resto } = await esegui();
      risultati[nome] = resto;
      operazioni.push(...ops);
      if (nome === 'googleHealth') finestra = f ?? null;
    } catch (e) {
      const codice = e instanceof ErroreSync ? e.codice : 'rete';
      const messaggi = MESSAGGI[nome] ?? {};
      risultati[nome] = { esito: 'errore', codice, messaggio: messaggi[codice] ?? messaggi.rete ?? 'Fonte non raggiungibile' };
    }
  }
  const esiti = Object.values(risultati).map((r) => r.esito);
  const esito = esiti.every((e) => e === 'errore') ? 'errore' : esiti.every((e) => e === 'ok') ? 'ok' : 'parziale';
  return { generatoIl: adesso.toISOString(), finestra, esito, fonti: risultati, operazioni };
}
