// Fonte Hevy: eventi degli ultimi 3 giorni (72 ore) e, prima delle 9 di Roma,
// il catalogo degli esercizi. Lancia ErroreSync se non può leggere gli eventi.
import { operazioniDaEventi, catalogoCompatto } from '../hevy/normalizza.js';
import { oraRoma } from '../../logic/date.js';

const FINESTRA_MS = 72 * 3600 * 1000;
const ORA_CATALOGO = '09:00';

export async function fonteHevy({ client, adesso }) {
  const since = new Date(adesso.getTime() - FINESTRA_MS).toISOString();
  const eventi = await client.elencaEventi(since);
  const { operazioni, conteggi } = operazioniDaEventi(eventi, { adesso });

  let esito = 'ok';
  let messaggio = '';
  let catalogo = null;
  if (oraRoma(adesso.toISOString()) < ORA_CATALOGO) {
    try {
      const doc = catalogoCompatto(await client.elencaTemplate(), { adesso });
      operazioni.push({ op: 'set', collection: 'hevy', doc_id: 'catalogo', data: doc });
      catalogo = doc.esercizi.length;
    } catch {
      esito = 'parziale';
      messaggio = 'Catalogo esercizi non aggiornato';
    }
  }
  return { esito, messaggio, conteggi: { ...conteggi, catalogo }, operazioni };
}
