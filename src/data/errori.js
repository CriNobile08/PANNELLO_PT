export function eRifiutoPermessi(e) {
  return e?.code === 'invalid_argument';
}

export function messaggioErrore(e) {
  if (e?.codice === 'senza_utente') return 'Accedi a Claude per salvare.';
  if (eRifiutoPermessi(e)) return 'Puoi solo leggere: chiedi al proprietario di invitarti come Editor';
  if (e?.code === 'revoked') return 'Accesso al pannello revocato.';
  return 'Salvataggio non riuscito. Riprova.';
}
