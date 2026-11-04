// Errore della sincronizzazione con un codice stabile:
// `configurazione`, `autorizzazione` o `rete`.
export class ErroreSync extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreSync';
    this.codice = codice;
  }
}
