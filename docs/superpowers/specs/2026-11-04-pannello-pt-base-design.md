# PANNELLO_PT — Sottoprogetto 1: Base del pannello

- **Data:** 2026-11-04
- **Stato:** bozza da rivedere
- **Bozze grafiche:** https://claude.ai/artifact/EFSFxB3ErViT54WLNpiMWX (Home · Oggi, Trainer · Settimana tipo, Dettaglio giornata, Trainer · Editor piano alimentare)

## 1. Scopo

PANNELLO_PT è un pannello condiviso tra **il cliente** (il proprietario del progetto) e **il suo personal trainer**.

- Il trainer prepara le **schede di allenamento** (riscaldamento, parte principale, stretching), le organizza in una **settimana tipo** che si ripete e scrive il **piano alimentare**.
- Il cliente vede cosa c'è da fare oggi, spunta riscaldamento e stretching e lascia note e sensazioni. Gli allenamenti in palestra li registra in **Hevy**.
- In futuro i dati arriveranno in automatico da Google Health (Fitbit), Strava, Komoot e Hevy, e Claude li analizzerà.

**Obiettivo del sottoprogetto 1:** avere subito un pannello usabile da entrambi per programmazione, diario e piano alimentare, senza integrazioni esterne. È la base su cui si agganciano i sottoprogetti 2 e 3.

**Criterio di successo:**
1. Il trainer costruisce schede, settimana tipo e piano alimentare dal PC.
2. Il cliente, dal telefono, vede la giornata, spunta i blocchi e lascia una nota.
3. Il trainer vede subito quanto il cliente ha fatto e scritto.
4. Nessuno dei due può cancellare per errore il lavoro dell'altro o lo storico.

## 2. Contesto: i sottoprogetti

| # | Sottoprogetto | Contenuto | Stato |
|---|---|---|---|
| 0 | Spike verifiche (codice usa e getta) | Accesso a Google Health, Strava, Komoot e Hevy (incluse la creazione delle routine e degli esercizi personalizzati); dove conservare i token OAuth che si rinnovano; tile di mappa dentro un artefatto; invito del trainer all'artefatto | da fare |
| **1** | **Base del pannello** | **Questo documento** | in specifica |
| 2 | Sincronizzazione | Attività programmata di Claude che importa i dati dalle 4 fonti, invia le schede a Hevy come routine e salva i percorsi per le mappe | dopo lo spike |
| 3 | Analisi | Riepilogo giornaliero e dopo ogni allenamento; report settimanale per il trainer | dopo il 2 |

Ogni sottoprogetto ha la sua specifica, il suo piano e la sua implementazione.

## 3. Ambito

**Incluso**
- Selettore "Cliente / Trainer" disponibile a tutti, con permessi legati alla vista.
- Libreria delle schede di allenamento, con versioni e archiviazione.
- Settimana tipo con versioni per data ed eccezioni "solo questa settimana".
- Piano alimentare con versioni per data: pasti, opzioni alternative per pasto, alimenti con grammatura.
- Vista cliente: Home "Oggi", dettaglio giornata, sezione Alimentazione.
- Vista trainer: Settimana tipo, Schede, Piano alimentare, riepilogo del diario del cliente.
- Diario del cliente: spunte di riscaldamento e stretching, completamento manuale della parte principale, voto 1–5, nota.
- Tema scuro nello stile delle bozze.

**Escluso** (sottoprogetti successivi o non richiesto)
- Qualsiasi integrazione esterna: Google Health, Strava, Komoot, Hevy. Gli anelli Sonno e Cuore e le card dati mostrano "Nessun dato".
- Mappe dei percorsi, riepiloghi e report di Claude.
- Calcolo di calorie e macro, lista della spesa, sostituzione del singolo alimento ("A oppure B").
- Più clienti per trainer, tema chiaro, chat con i dati.

## 4. Architettura

- **Un solo artefatto claude.ai**, pubblicato dal cliente, che ne è quindi il **proprietario**. Il trainer viene invitato **via email come Editor**, e l'artefatto **non** va condiviso anche tramite link (vedi §4.2). Il trainer deve avere un account Claude (confermato).
- I dati stanno nel **database dell'artefatto** (capability `db`), con aggiornamento in tempo reale tramite `onSnapshot`. La capability `user` (scope `profile`) serve a riconoscere chi guarda la pagina e a mostrare i nomi degli autori delle modifiche.
- Capability dichiarate: `{ db: { rules: [...] }, user: { scopes: ["profile"] } }`. Nient'altro.
- **Pagina unica responsive.** Sotto i 900 px usa il layout telefono con barra di navigazione in basso; sopra usa il layout PC con menu laterale. Entrambe le viste funzionano con entrambi i layout.
- **Codice nel repository** (`crinobile08/pannello_pt`): logica pura separata dalla UI e uno script di build che produce un unico file HTML da pubblicare (vedi §10).

### 4.1 Ruoli

Il ruolo **non** viene dedotto in automatico dai permessi dell'artefatto. In prove precedenti le persone invitate non riuscivano ad accedere alla parte trainer quando l'accesso dipendeva dal loro livello di condivisione.

**Selettore "Cliente / Trainer" per tutti.** Nell'intestazione chiunque apra il pannello ha il selettore e passa liberamente da una vista all'altra:
- **Vista cliente:** Oggi, dettaglio giornata, diario, piano alimentare in lettura.
- **Vista trainer:** settimana tipo, schede, editor del piano alimentare, riepilogo del diario.

Regole:
- **Vista iniziale:** se `user.isOwner()` restituisce vero → Cliente; in tutti gli altri casi → Trainer. Dopo il primo cambio, la vista scelta viene ricordata per dispositivo, nella memoria del browser (se non è disponibile, si riparte dalla vista iniziale).
- Le modifiche registrano sempre come `autore` la persona reale (`user.id()`), non la vista scelta. Così "modificato da" resta affidabile.
- **Permesso di scrittura controllato all'avvio** con `user.can("data.write")`. Se restituisce `false`, compare un avviso fisso "Puoi solo leggere: chiedi al proprietario di invitarti come Editor" e i pulsanti di salvataggio sono disattivati. Se restituisce `null` (la piattaforma non lo dice), i controlli restano attivi; al primo salvataggio rifiutato con `invalid_argument` la pagina passa in sola lettura con lo stesso avviso.

### 4.2 Permessi

I permessi dipendono dalla **vista**, non dalla persona:

| Dato | Vista cliente | Vista trainer |
|---|---|---|
| Schede di allenamento | modifica | crea / modifica / archivia |
| Settimana tipo e eccezioni | modifica | modifica |
| Piano alimentare | legge | crea / modifica |
| Diario | scrive | legge |

Regole del database: chiunque abbia accesso almeno da **collaboratore** (`interact`) può scrivere tutto; i lettori leggono e basta.
```js
rules: [
  { path: "", read: "view", write: "interact" }
]
```

**Conseguenze accettate:**
- I vincoli della tabella sono applicati **solo dall'interfaccia**. Chiunque abbia accesso in scrittura può, passando di vista, modificare anche il diario o il piano alimentare. È coerente con il selettore libero e va bene tra persone che si fidano.
- **Condivisione.** Il trainer è esterno all'organizzazione del cliente, e per gli esterni valgono regole precise (documentazione del database degli artefatti):
  - invitati via email come *Collaboratore*, *Commentatore* o *Lettore* → **solo lettura**;
  - invitati via email come **Editor** → **possono scrivere**, ma solo finché l'artefatto **non** è condiviso anche tramite link.
  
  Quindi: invito **via email come Editor**, nessun link pubblico. È molto probabilmente il motivo per cui nelle prove precedenti gli invitati non riuscivano a usare la parte trainer. Come Editor il trainer potrebbe anche ripubblicare il codice della pagina; è accettato perché è una persona fidata.

## 5. Modello dei dati

Convenzioni:
- Le date sono stringhe `YYYY-MM-DD` nel fuso **Europe/Rome**.
- I timestamp sono ISO 8601.
- `autore` è l'id opaco restituito da `user.id()`. I nomi non vengono mai salvati: si risolvono a ogni visualizzazione con `user.profiles()`.

### 5.1 `schede/{schedaId}`
```js
{ nome: "Spinta A", tipo: "palestra" | "corsa" | "trekking" | "altro",
  archiviata: false, revisioneCorrente: "<revId>",
  creataDa: "<userId>", creataIl: "<ISO>" }
```

### 5.2 `schede/{schedaId}/revisioni/{revId}`
Ogni salvataggio di una scheda crea una nuova revisione. Le revisioni non si modificano.
```js
{ validaDal: "YYYY-MM-DD",          // data (Roma) del salvataggio
  autore: "<userId>", salvataIl: "<ISO>",
  nota: "Carichi come settimana scorsa…",   // nota del trainer per la giornata
  durataStimataMin: 65,
  riscaldamento: [Esercizio],
  principale:    [EsercizioPrincipale],    // tipo "palestra"/"altro"
  obiettivo:     { descrizione: "8 km ritmo lento", distanzaKm: 8, dislivelloM: null }, // tipo "corsa"/"trekking"
  stretching:    [Esercizio] }

Esercizio = { nome, durataSec: null|int, serie: null|int, ripetizioni: null|int, perLato: bool, nota: "" }
EsercizioPrincipale = { nome, serie: int, ripetizioni: int, caricoKg: null|number,
                        recuperoSec: null|int, nota: "", hevyTemplateId: null }
```
`hevyTemplateId` resta sempre `null` nel sottoprogetto 1. Lo valorizza il sottoprogetto 2 (selettore esercizi: id del catalogo `hevy/catalogo`, `null` per un esercizio libero).
Dal selettore esercizi, `Esercizio` ha anche `idCatalogo: null|string` (id del catalogo locale di riscaldamento/stretching, `src/data/catalogo-riscaldamento.json`); le revisioni precedenti senza il campo valgono come `null`.

### 5.3 `settimane/{versioneId}`
```js
{ numero: 3, validaDal: "YYYY-MM-DD",
  giorni: { lun: schedaId|null, mar: …, mer: …, gio: …, ven: …, sab: …, dom: … }, // null = riposo
  autore: "<userId>", creataIl: "<ISO>" }
```

### 5.4 `eccezioni/{YYYY-MM-DD}`
```js
{ schedaId: "<id>" | null,   // null = riposo
  origine: "YYYY-MM-DD" | null,  // giorno da cui è stata spostata, se è uno spostamento
  autore: "<userId>", creataIl: "<ISO>" }
```
"Sposta venerdì a giovedì, solo questa settimana" crea **due** eccezioni: giovedì → scheda, con `origine` = venerdì; venerdì → riposo.

Per annullare un'eccezione si cancella il suo documento, e il giorno torna alla settimana tipo.

### 5.5 `alimentazione/{versioneId}`
```js
{ numero: 2, validaDal: "YYYY-MM-DD", indicazioni: "Almeno 2,5 L di acqua…",
  pasti: [ { nome: "Colazione",
             opzioni: [ { nome: "Opzione 1", nota: "",
                          alimenti: [ { nome: "Fiocchi d'avena", grammi: 60 } ] } ] } ],
  autore: "<userId>", creataIl: "<ISO>" }
```
L'ordine dei pasti è l'ordine dell'array.

### 5.6 `diario/{YYYY-MM-DD}`
Si scrive dalla vista cliente.
```js
{ riscaldamentoFatti: [0, 1, 2],  // indici degli esercizi spuntati
  stretchingFatti: [],
  principaleFatto: false,         // manuale nel sottoprogetto 1; poi da Hevy
  sensazione: null | 1..5,
  nota: "",
  aggiornatoIl: "<ISO>" }
```
Un blocco conta come completato quando sono spuntati tutti i suoi esercizi; per la parte principale, quando `principaleFatto` è vero. L'anello "Allenamento" mostra quanti blocchi su 3 sono completati.

## 6. Regole di calcolo (logica pura, testata)

- **Settimana:** da lunedì a domenica, fuso Europe/Rome. "Oggi" è la data di Roma al momento della visualizzazione.
- **Cosa c'è in un giorno D:**
  1. Se esiste `eccezioni/D`, vale quella.
  2. Altrimenti si prende la versione di `settimane` con il `validaDal` più recente ≤ D e si legge il giorno della settimana di D.
  3. Se non c'è nessuna versione, è riposo.
- **Versione della scheda per il giorno D:** la revisione con il `validaDal` più recente ≤ D. Se ce ne sono più di una nello stesso giorno, vale quella con il `salvataIl` più recente. Così i giorni passati mostrano la scheda com'era allora.
- **Piano alimentare per il giorno D:** la versione con il `validaDal` più recente ≤ D.
- **Versioni future:** una versione con `validaDal` > oggi compare come "In programma dal …" e non vale per oggi.
- **Archiviazione:** una scheda assegnata in una versione in vigore o futura, o in un'eccezione futura, non si può archiviare. La pagina indica dove è usata. Le schede archiviate spariscono dalla libreria ma restano nello storico. Le schede non si cancellano mai.

## 7. Schermate

Riferimento visivo: le bozze nell'artefatto indicato in testa. I valori nelle bozze sono di esempio.

**Stile:** tema scuro con sfondo `#000000`, card `#16171A`, card interne `#0E0F11`, testo secondario `#A0A3AB`. Colori per categoria: sonno `#E08A4F`, cuore/recupero `#2BC4A6`, allenamento `#5B9BFF`. Font *Barlow Condensed* per i numeri e *Inter* per il testo (Google Fonts). Card arrotondate (raggio 18–20 px), target di tocco ≥ 44 px.

### 7.1 Vista cliente
- **Oggi** (Home):
  - selettore della data;
  - tre anelli: Sonno · Cuore a riposo · Allenamento. Nel sottoprogetto 1 i primi due mostrano "Nessun dato";
  - card dell'allenamento di oggi con i 3 blocchi e il pulsante "+" per aggiungere una nota;
  - card dati ("Nessun dato" nel sottoprogetto 1);
  - Alimentazione di oggi.

  Il riquadro "La tua giornata in breve" e "Attività recenti" non compaiono finché non ci sono i sottoprogetti 2 e 3.
- **Dettaglio giornata:**
  - intestazione con barra a 3 segmenti;
  - nota del trainer;
  - riscaldamento con spunte;
  - parte principale con le colonne *Programmato* e *Fatto*. Nel sottoprogetto 1 la colonna *Fatto* è nascosta e c'è il pulsante "Segna come fatta";
  - stretching con spunte;
  - "Come ti sei sentito?" con voto 1–5, nota e "Salva".
- **Allenamento:**
  - la settimana corrente, con un giorno per riga sul telefono;
  - modifica della settimana tipo, con due pulsanti: "Solo questa settimana" (crea le eccezioni) e "Da una data in poi" (crea una nuova versione);
  - modifica delle schede.
- **Alimentazione:** il piano del giorno, con ogni pasto, le opzioni selezionabili e le grammature, più le indicazioni generali. Solo lettura.

### 7.2 Vista trainer
- **Settimana tipo:**
  - versione in vigore, con autore, data e cronologia;
  - i pulsanti "Modifica solo questa settimana" e "Nuova versione da una data…";
  - navigazione tra le settimane;
  - 7 card dei giorni con scheda, tipo e blocchi; per i giorni passati, lo stato del diario;
  - evidenziazione di oggi e delle eccezioni, con autore e data;
  - "+ Assegna scheda" sui giorni di riposo;
  - libreria delle schede;
  - riquadro "Come sta [Nome]". Nel sottoprogetto 1 mostra solo l'ultima nota e la sensazione dal diario.
- **Schede di allenamento:** libreria con ricerca, "+ Nuova scheda", editor dei 3 blocchi (per corsa e trekking: obiettivo al posto degli esercizi principali), cronologia delle revisioni, archiviazione.
- **Piano alimentare:**
  - indicazioni generali;
  - pasti con schede Opzione 1/2/+; per ogni alimento nome e grammi;
  - "+ Aggiungi alimento", "+ Aggiungi pasto";
  - "Salva come nuova versione da…" e cronologia.
- **Dati del cliente / Report settimanali:** voci di menu visibili ma disabilitate con l'etichetta "In arrivo" fino ai sottoprogetti 2 e 3.

## 8. Errori e casi limite

| Situazione | Comportamento |
|---|---|
| `claude.use("db")` restituisce `null` o i dati non arrivano entro 10 s | Messaggio "Impossibile caricare i dati" e pulsante "Riprova". Nessun ricaricamento automatico. |
| Scrittura rifiutata | Messaggio chiaro; il contenuto resta nel campo. |
| Uscita con modifiche non salvate | Conferma prima di lasciare la schermata. |
| Scheda salvata da un altro utente durante la modifica (`revisioneCorrente` diversa da quella caricata) | Dialogo: "La scheda è stata modificata da [nome] alle [ora]: vedi le sue modifiche / sovrascrivi". |
| Settimana tipo e piano alimentare modificati in due | Non c'è conflitto: ogni salvataggio crea una nuova versione. |
| Nessuna settimana tipo | Trainer: "Crea la prima settimana tipo". Cliente: "Il trainer non ha ancora preparato il programma". |
| Nessun piano alimentare | Trainer: "Crea il piano alimentare". Cliente: "Nessun piano alimentare". |
| Dati esterni assenti | "Nessun dato", mai numeri di esempio. |
| Campi non validi (grammi ≤ 0 o non numerici, serie o ripetizioni non intere o ≤ 0, nomi vuoti) | Campo evidenziato e salvataggio bloccato. |
| Scheda da archiviare ancora in uso | Archiviazione bloccata, con l'elenco di dove è usata. |
| Cambio dell'ora legale, cambio d'anno | Gestiti dalla logica delle date (Europe/Rome), coperti da test. |

## 9. Test

- **Test automatici** con `node --test` sulla logica pura (`src/logic/`):
  - risoluzione del giorno: eccezione, versione in vigore, versione futura, nessuna versione, spostamento in due eccezioni;
  - revisione della scheda per una data, anche con più revisioni nello stesso giorno;
  - versione del piano alimentare per una data;
  - confini della settimana, cambio d'anno, cambio dell'ora legale;
  - validazione dei campi;
  - regola di archiviazione;
  - conteggio dei blocchi completati.
- **Verifica dei permessi dopo la pubblicazione:** lettura e scrittura con `ArtifactData` a livelli diversi. Un livello `interact` o superiore deve poter scrivere ovunque; un livello `view` non deve poter scrivere da nessuna parte.
- **Verifica visiva:** screenshot a 390 px e a 1440 px dell'HTML generato, prima di consegnare il link.
- **Prova finale con il trainer** (checklist):
  1. Il trainer crea due schede e una settimana tipo.
  2. Il cliente sposta un giorno "solo questa settimana".
  3. Il cliente spunta il riscaldamento, salva voto e nota.
  4. Il trainer vede eccezione, spunte e nota.
  5. Il trainer modifica una scheda: il giorno passato mostra ancora la versione vecchia.
  6. Il trainer crea il piano alimentare con due opzioni per la colazione; il cliente lo vede.
  7. Il trainer apre il pannello dal suo account: parte in vista trainer e può salvare.
  8. Il cliente passa alla vista trainer e modifica una scheda: la modifica risulta fatta dal cliente. Ricaricando la pagina, resta in vista trainer.

## 10. Struttura del repository

```
src/logic/      date.js, risoluzione.js, versioni.js, validazione.js, completamento.js  (puri, senza DOM)
src/ui/         schermate e componenti
src/main.js     avvio: capability, ruolo, sottoscrizioni db, routing
src/template.html
test/           *.test.js  (node --test)
scripts/build.js  → dist/pannello.html (un unico file con JS e CSS inline)
```

- **UI:** Preact + htm, inclusi nel bundle (nessun CDN in esecuzione).
- **Build:** esbuild, come dipendenza di sviluppo.
- **Pubblicazione:** `dist/pannello.html` viene pubblicato come artefatto con lo strumento Artifact.

## 11. Punti aperti (non bloccanti per il sottoprogetto 1)

- **Riempimento dell'anello "Cuore a riposo":** da definire nella specifica del sottoprogetto 2, quando sapremo quali dati sono disponibili.
- **Scrittura da parte del trainer invitato:** da confermare con un artefatto di prova (sottoprogetto 0) prima della consegna. Va verificato che il trainer, invitato via email come Editor e senza link pubblico, possa aprire il pannello e salvare. Se non funziona, il ripiego è che il trainer usi il pannello insieme al cliente, dal dispositivo del cliente. Le credenziali dell'account del cliente non si condividono.
