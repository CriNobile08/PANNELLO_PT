# Prova finale con il trainer

## Come invitare il trainer

1. Apri il pannello pubblicato e usa il menu **Condividi**.
2. Scegli **invito via email** e inserisci l'indirizzo del trainer.
3. Assegna il ruolo **Editor**.
4. **Non attivare il link pubblico**: il pannello non deve essere condiviso anche tramite link.

Perché (§4.2 della specifica): il trainer è fuori dall'organizzazione del cliente, quindi può scrivere solo se invitato per email come Editor. Gli inviti con ruolo Collaboratore, Commentatore o Lettore possono soltanto leggere, e quindi non permetterebbero al trainer di salvare nulla. Un link pubblico, in più, renderebbe il pannello accessibile a chiunque lo riceva.

## Checklist (§9, punti 1–8)

- [ ] 1. Il trainer crea due schede e una settimana tipo.
  - **Precondizione:** nel modulo della settimana tipo imposta **"Valida dal"** al **lunedì di questa settimana** (o prima). L'editor propone il lunedì prossimo: lasciandolo così, la settimana in corso resterebbe senza programma e i passi 2–5 non avrebbero giorni da usare. Una data passata è ammessa solo per la **prima** versione; le versioni successive partono da oggi in poi.
- [ ] 2. Il cliente sposta un giorno "solo questa settimana".
- [ ] 3. Il cliente spunta il riscaldamento, salva voto e nota.
- [ ] 4. Il trainer vede eccezione, spunte e nota.
- [ ] 5. Il trainer modifica una scheda: il giorno passato mostra ancora la versione vecchia.
  - **Precondizioni:** la scheda è assegnata a un giorno **prima di oggi** (nella settimana tipo o con un'eccezione), ed è stata salvata almeno una volta **in un giorno precedente** a quello della modifica (ad esempio: crea le schede un giorno, fai il passo 5 il giorno dopo).
  - Perché: ogni salvataggio crea una revisione valida dalla data del salvataggio (§5.2); per il giorno D vale la revisione più recente con data ≤ D (§6). Una modifica fatta oggi vale quindi **da oggi**: anche se la scheda era già stata salvata oggi, oggi mostra l'ultima revisione. Un giorno passato mostra la revisione valida quel giorno; se la scheda è nata dopo quel giorno, mostra la revisione più vecchia disponibile (la prima salvata). Con schede create e modificate lo stesso giorno il confronto funziona ancora, ma solo tra un giorno passato e oggi: la condizione sopra rende la prova non ambigua.
- [ ] 6. Il trainer crea il piano alimentare con due opzioni per la colazione; il cliente lo vede.
- [ ] 7. Il trainer apre il pannello dal suo account: parte in vista trainer e può salvare.
- [ ] 8. Il cliente passa alla vista trainer e modifica una scheda: la modifica risulta fatta dal cliente. Ricaricando la pagina, resta in vista trainer.
