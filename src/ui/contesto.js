import { createContext } from 'preact';

/**
 * Valore fornito da App a tutte le schermate:
 * {
 *   dati: { schede, revisioni, settimane, eccezioni, alimentazione, diario }  // ultimo snapshot dello store
 *   store,                      // creaStore(...): salvaScheda, salvaSettimana, aggiornaDiario, …
 *   oggi: 'YYYY-MM-DD',         // oggiRoma(), ricalcolato a ogni render
 *   utenteId: string|null,      // await user.id()
 *   vista: 'cliente'|'trainer', setVista(vista),   // passa dalla guardia modifiche
 *   puoScrivere: boolean,       // false → pulsanti di salvataggio disabled
 *   segnalaRifiuto(e) → string, // da chiamare nel catch di ogni scrittura: se è un rifiuto
 *                               // di permessi passa in sola lettura; restituisce messaggioErrore(e)
 *   nomi(ids) → { [id]: nome }, // sincrono; i nomi mancanti si caricano e la pagina si ridisegna
 *   sezione: string, parametri: object,
 *   vai(sezione, parametri = {}),                   // passa dalla guardia modifiche
 *   setSporco(bool),            // true alla prima modifica, false dopo il salvataggio o l'annullamento
 * }
 */
export const Contesto = createContext(null);
