# PANNELLO_PT — Sottoprogetto 2a: Sincronizzazione Google Health

- **Data:** 2026-11-04
- **Stato:** bozza da rivedere
- **Dipende da:** [Sottoprogetto 1 — Base del pannello](2026-11-04-pannello-pt-base-design.md)
- **Artefatto:** https://claude.ai/artifact/MdFb5BEz89JBCQ2VRTqEGv

## 1. Scopo

Portare nel pannello, in automatico, i dati dell'orologio Fitbit del cliente letti dalla **Google Health API**: sonno (con i pisolini), frequenza cardiaca a riposo, HRV, passi e sessioni di allenamento.

Questo documento copre solo **Google Health**. Strava, Komoot e Hevy (resto del sottoprogetto 2) avranno ciascuno la propria specifica, ma il modello delle sessioni (§5.2) e la loro unione (§6.1) sono già pensati per accoglierli.

**Criterio di successo:**
1. Gli anelli Sonno e Cuore a riposo della Home mostrano i dati della notte senza nessun intervento manuale.
2. Le sessioni registrate dall'orologio compaiono nel dettaglio della giornata e in "Attività recenti".
3. Il trainer vede la sezione "Dati del cliente" con gli ultimi 7 giorni.
4. Nessuna credenziale esce dalle variabili d'ambiente dell'ambiente cloud.

## 2. Esito dello spike (sottoprogetto 0, parte Google Health)

Verificato il 2026-11-04 con codice usa e getta, non conservato:

- **Credenziali:** variabili d'ambiente `GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `GH_REFRESH_TOKEN` dell'ambiente cloud.
- **Token:** lo scambio su `https://oauth2.googleapis.com/token` restituisce un access token valido ~1 ora. **Il refresh token non ruota** (la risposta non ne contiene uno nuovo), quindi resta nella variabile d'ambiente e non serve conservarne uno aggiornato. La risposta non contiene `refresh_token_expires_in`: indizio, non prova, che l'app OAuth sia "In production".
- **Scope concessi:** `googlehealth.activity_and_fitness.readonly`, `googlehealth.sleep.readonly`, `googlehealth.health_metrics_and_measurements.readonly`.
- **API:** Google Health API v4 (`https://health.googleapis.com/v4/`, documento discovery revisione 20261102).
  - `GET users/me/dataTypes/{tipo}/dataPoints` con `filter` (sintassi AIP-160), paginato con `pageToken`. Per `sleep` ed `exercise` la pagina massima è 25.
  - `POST users/me/dataTypes/{tipo}/dataPoints:dailyRollUp` con `range` di date civili (massimo 90 giorni) per i totali giornalieri.
- **Letture di prova riuscite (ultimi 7–8 giorni):** `daily-resting-heart-rate`, `daily-heart-rate-variability`, `sleep` (con fasi, riepilogo e flag `mainSleep`), `steps` via `dailyRollUp` (`countSum`). Il tipo `exercise` è descritto nel discovery (durata attiva, FC media, minuti in zona, calorie, passi, distanza, dislivello, GPS).
- **Da verificare:** le date di lancio della Google Health API e di spegnimento della Fitbit Web API legacy, sulla documentazione ufficiale (`developers.google.com`, bloccato dalla rete dell'ambiente al momento dello spike).

## 3. Ambito

**Incluso**
- Script di sincronizzazione nel repository e attività programmata che lo esegue 7 volte al giorno.
- Pulsante "Aggiorna ora" per il proprietario.
- Dati giornalieri: sonno principale, pisolini, FC a riposo, HRV, passi.
- Sessioni di allenamento dell'orologio.
- Anelli Sonno e Cuore a riposo, card dati, "Attività recenti", colonna *Fatto* e avviso "Allenamento rilevato".
- Vista trainer "Dati del cliente" e obiettivo del sonno.

**Escluso**
- Strava, Komoot, Hevy (specifiche successive).
- Dati intraday (FC minuto per minuto, passi orari), fasi del sonno minuto per minuto, SpO₂, temperatura, frequenza respiratoria, VO₂max, peso.
- Esportazione TCX e percorsi GPS delle sessioni Fitbit.
- Riepiloghi e report di Claude (sottoprogetto 3).

## 4. Architettura

```
attività programmata (7×/giorno)          pulsante "Aggiorna ora" (solo proprietario)
        │                                         │ fire_trigger via connettore Claude Code Remote
        └──────────────┬──────────────────────────┘
                       ▼
      sessione cloud nuova, stesso ambiente (variabili GH_*)
        1. npm run sync  → scripts/sync.js → out/sync.json  (solo dati, mai chiavi)
        2. Claude: ArtifactData batch con le operazioni del file
        3. Claude: ArtifactData set di sync/stato
                       ▼
           database dell'artefatto  ──onSnapshot──▶  pagina (unione sessioni, indici)
```

### 4.1 Componenti

| Unità | Responsabilità | Dipende da |
|---|---|---|
| `src/sync/googleHealth/client.js` | Scambia il refresh token con un access token; chiama `list` e `dailyRollUp` seguendo le pagine; ritenta gli errori temporanei. `fetch` e variabili d'ambiente sono iniettati, così i test usano un `fetch` finto. | rete |
| `src/sync/googleHealth/normalizza.js` | Pura: trasforma le risposte dell'API nei documenti di §5. Contiene la tabella di conversione dei tipi di esercizio. | — |
| `scripts/sync.js` | Avvio: calcola la finestra (ultimi 3 giorni, data di Roma), chiama client e normalizzazione, scrive `out/sync.json`. Esce con codice ≠ 0 se non può scrivere dati. | i due moduli sopra |
| `src/logic/sessioni.js` | Pura: `unisciSessioni(sessioni)` (§6.1). La usa la pagina; la riuserà il sottoprogetto 3. | — |
| `src/logic/indici.js` | Pura: percentuale del sonno rispetto all'obiettivo, medie a 30 giorni, indice di recupero (§6.2–6.3). | — |
| UI (`src/ui/`) | Anelli, card dati, Attività recenti, colonna *Fatto*, avviso, Dati del cliente, Aggiorna ora. | logica pura, db, mcp |

**Dove si uniscono le sessioni.** Lo script parte ogni volta in una sessione nuova e non legge il database, quindi non vedrebbe le sessioni importate da altre fonti. Per questo il database tiene le sessioni **per fonte** e l'unione si calcola nella pagina con una funzione pura.

**Dove si calcolano gli indici.** Nella pagina, così un cambio dell'obiettivo del sonno si vede subito, senza aspettare la sincronizzazione.

### 4.2 Formato di `out/sync.json`

```js
{ generatoIl: "<ISO>",
  finestra: { dal: "YYYY-MM-DD", al: "YYYY-MM-DD" },   // inclusi
  esito: "ok" | "parziale",
  tipiMancanti: [],                                    // es. ["daily-heart-rate-variability"]
  conteggi: { giorni: 3, sessioni: 2 },
  operazioni: [ { op: "set", collection: "salute", doc_id: "2026-11-04", data: { … } },
                { op: "set", collection: "sessioni", doc_id: "googleHealth_…", data: { … } } ] }
```
`op` è `set` (sostituzione completa del documento) oppure `update` (solo nel caso parziale di §5.1). Rieseguire la sincronizzazione non crea doppioni.

Se lo script fallisce del tutto (autorizzazione rifiutata o Google non raggiungibile dopo i tentativi) non produce il file e stampa su stderr una riga `ERRORE: <codice>: <messaggio>` senza dati sensibili.

### 4.3 Attività programmata

- Una sessione nuova a ogni esecuzione, nello stesso ambiente cloud (così vede le variabili `GH_*`).
- Orari, fuso Europe/Rome: **6:52, 9:52, 12:52, 15:52, 18:52, 21:52, 23:52**. Espressione: `CRON_TZ=Europe/Rome 52 6,9,12,15,18,21,23 * * *`.
- Istruzioni dell'attività (testo autonomo):
  1. Se il repository non è già presente, clonalo (branch `main`); poi `npm ci` e `npm run sync`.
  2. Se il comando riesce: scrivi tutte le `operazioni` di `out/sync.json` nel database dell'artefatto con un'unica `ArtifactData` `batch`, rispettando `op` di ciascuna; poi scrivi `sync/stato` con esito, conteggi e `tipiMancanti` del file.
  3. Se il comando fallisce: non scrivere dati; scrivi solo `sync/stato` con `esito: "errore"` e il messaggio della riga `ERRORE:`.
  4. Non stampare mai i valori delle variabili `GH_*` né il contenuto dei dati di salute nei messaggi.
- **Ripiego** se una sessione nuova non vede le variabili o non ha `ArtifactData`: attività programmata legata a una sessione persistente dedicata.

### 4.4 Pulsante "Aggiorna ora"

- La pagina dichiara `mcp: { servers: [{ server: "Claude Code Remote", tools: ["fire_trigger"] }] }` oltre a `db` e `user` già presenti.
- Il pulsante compare solo se `user.isOwner()` è vero e il connettore è disponibile (`claude.use("mcp")` non `null`).
- L'id dell'attività (`trig_…`) sta nel documento `impostazioni/sync` (`{ idAttivita }`), scritto da Claude dopo averla creata; non è un segreto ma non va nel codice.
- Alla pressione: chiamata `fire_trigger({ trigger_id })`; il pulsante resta disattivato 2 minuti con la scritta "Aggiornamento in corso…". I dati compaiono quando la sessione scrive il database (aggiornamento in tempo reale con `onSnapshot`).

## 5. Modello dei dati

Convenzioni del sottoprogetto 1: date `YYYY-MM-DD` nel fuso Europe/Rome, timestamp ISO 8601, nomi in italiano. Durate in minuti interi, distanze e dislivelli in metri.

### 5.1 `salute/{YYYY-MM-DD}`
Scritto dalla sincronizzazione.
```js
{ fonte: "googleHealth",
  sonno: { inizio: "<ISO>", fine: "<ISO>",
           minutiAddormentato: 412, minutiSveglio: 38, minutiPerAddormentarsi: 9,
           fasi: { profondo: 71, rem: 88, leggero: 253, sveglio: 38 } | null } | null,
  pisolini: [ { inizio: "<ISO>", fine: "<ISO>", minutiAddormentato: 24 } ],   // [] se nessuno
  fcRiposo: 54 | null,
  hrv: { rmssd: 41.2, rmssdProfondo: 47.0 | null, fcNonRem: 52 | null } | null,
  passi: 8423 | null,
  aggiornatoIl: "<ISO>" }
```
- **Giorno di appartenenza:** il sonno principale (`metadata.mainSleep: true`) appartiene al giorno di Roma in cui **finisce**. I pisolini appartengono al giorno di Roma in cui finiscono.
- Se in un giorno risultano più sonni principali, vale quello con più `minutiAddormentato`.
- `fasi` è `null` per i sonni di tipo `CLASSIC` (senza fasi dettagliate).
- I numeri che l'API restituisce come stringa (es. `beatsPerMinute`, `minutesAsleep`, `countSum`) vengono convertiti in numero.
- **Sostituzione o aggiornamento:** con `esito: "ok"` lo script ha letto tutti i tipi per l'intera finestra, quindi ogni documento `salute/` è completo e l'operazione è `set`. Con `esito: "parziale"` i campi dei tipi falliti vengono **omessi** e l'operazione è `update`, così un errore temporaneo non sovrascrive con `null` un valore già salvato.

### 5.2 `sessioni/{fonte}_{idFonte}`
Una raccolta unica per tutte le fonti.
```js
{ fonte: "googleHealth", idFonte: "…", data: "2026-11-04",
  inizio: "<ISO>", fine: "<ISO>",
  tipo: "palestra" | "corsa" | "trekking" | "camminata" | "bici" | "altro",
  tipoOriginale: "WEIGHTS", nome: "Pesi",
  durataAttivaMin: 62, fcMedia: 118 | null,
  zoneMin: { <zona>: minuti, … } | null,
  calorie: 410 | null, passi: null, distanzaM: null, dislivelloM: null, gps: false,
  aggiornatoIl: "<ISO>" }
```
- `idFonte` è l'ultimo segmento del campo `name` del data point.
- `data` è il giorno di Roma dell'inizio.
- `tipo` deriva da `tipoOriginale` con la tabella di `normalizza.js`; i valori sconosciuti diventano `altro`. La tabella completa si ricava dall'enum di `exerciseType` nel discovery durante l'implementazione.
- Le fonti future aggiungeranno campi propri (es. `esercizi` per Hevy, `percorso` per Strava/Komoot) senza cambiare quelli comuni.

### 5.3 `impostazioni/obiettivi`
```js
{ sonnoMinuti: 480, aggiornatoIl: "<ISO>", autore: "<userId>" }
```
Modificato dalla vista trainer. Se manca, vale 480.

### 5.4 `impostazioni/sync`
```js
{ idAttivita: "trig_…" }
```
Scritto da Claude quando crea l'attività programmata.

### 5.5 `sync/stato`
```js
{ ultimaEsecuzione: "<ISO>", esito: "ok" | "parziale" | "errore",
  messaggio: "", tipiMancanti: [], conteggi: { giorni: 3, sessioni: 2 } }
```

### 5.6 `diario/{YYYY-MM-DD}` (esistente, campi nuovi)
```js
{ …campi del sottoprogetto 1…,
  sessioniCollegate: ["googleHealth_…"],   // impostato confermando "Allenamento rilevato"
  rilevamentoIgnorato: false }             // true dopo aver risposto "No"
```

### 5.7 Regole del database
Invariate: `[{ path: "", read: "view", write: "interact" }]`. La sincronizzazione scrive come proprietario. Nessuna cancellazione: lo storico si conserva tutto.

## 6. Regole di calcolo (logica pura, testata)

### 6.1 Unione delle sessioni (`unisciSessioni`)
- Due sessioni di **fonti diverse** fanno parte della stessa sessione unita se la loro sovrapposizione è **≥ 50% della durata della più corta**. L'appartenenza è transitiva (si uniscono i gruppi collegati).
- Due sessioni della **stessa fonte** non si uniscono mai, nemmeno se si sovrappongono.
- La sessione unita ha: `inizio` = minimo, `fine` = massimo, `data` = giorno di Roma dell'`inizio`, `fonti` = elenco ordinato delle fonti, `parti` = le sessioni originali.
- Per ogni campo comune vale la prima fonte che lo ha non nullo, nell'ordine di priorità: per `tipo`, `nome`: Hevy, Strava, Komoot, Google Health; per `fcMedia`, `zoneMin`, `calorie`: Google Health, Strava, Hevy, Komoot; per `distanzaM`, `dislivelloM`: Strava, Komoot, Google Health, Hevy. Con la sola fonte Google Health vale sempre Google Health.
- Il risultato è ordinato per `inizio` decrescente.

### 6.2 Anello Sonno
- `percentuale = min(100, round(100 · sonno.minutiAddormentato / obiettivo.sonnoMinuti))`.
- I pisolini **non** contano: compaiono sotto l'anello come "+ pisolino N min" (somma dei pisolini del giorno).
- Senza `sonno`: "Nessun dato".

### 6.3 Anello Cuore a riposo e indice di recupero
- Al centro: `fcRiposo` del giorno, con freccia ↑/↓/= rispetto a `mediaFc` (= se la differenza è < 1 bpm).
- Medie sui **30 giorni precedenti**, oggi escluso, ignorando i `null`: `mediaFc`, `mediaHrv` (su `hrv.rmssd`).
- Servono almeno **7 valori** di FC a riposo nei 30 giorni; altrimenti l'anello mostra "In calibrazione".
- `Δfc = (mediaFc − fcOggi) / mediaFc`
- `Δhrv = (hrvOggi − mediaHrv) / mediaHrv`, solo se l'HRV di oggi esiste e ci sono almeno 7 valori di HRV nei 30 giorni.
- `indice = limita(0, 100, round(50 + 250 · media(Δ disponibili)))`. In linea con la media → 50; miglioramento del 10% → 75; peggioramento del 20% → 0.
- Senza `fcRiposo` oggi: "Nessun dato".

### 6.4 Avviso "Allenamento rilevato"
Compare nel dettaglio di un giorno D se **tutte** le condizioni sono vere: in D c'è una scheda in programma (regole §6 del sottoprogetto 1); `principaleFatto` è falso; `rilevamentoIgnorato` non è vero; esiste almeno una sessione unita con `data` = D.
- *Sì* → `principaleFatto: true`, `sessioniCollegate` = id delle parti delle sessioni unite di D.
- *No* → `rilevamentoIgnorato: true`.

## 7. Schermate

Stile invariato (§7 del sottoprogetto 1): sonno `#E08A4F`, cuore/recupero `#2BC4A6`, allenamento `#5B9BFF`.

### 7.1 Vista cliente
- **Oggi:**
  - anello Sonno (§6.2) con, sotto, le fasi profondo/REM/leggero e l'eventuale "+ pisolino";
  - anello Cuore a riposo (§6.3);
  - anello Allenamento invariato;
  - card dati: passi, HRV (RMSSD), minuti di sonno profondo e REM; in fondo "Aggiornato alle HH:MM" da `sync/stato` e, solo per il proprietario, **Aggiorna ora**; se l'ultimo esito è `errore` compare "Ultimo aggiornamento non riuscito alle HH:MM: <messaggio>", se è `parziale` "Alcuni dati non aggiornati";
  - **Attività recenti** (ora visibile): sessioni unite degli ultimi 7 giorni con tipo, durata, FC media e fonti.
- **Dettaglio giornata:**
  - colonna **Fatto** visibile quando in quel giorno esiste almeno una sessione unita: durata, FC media, minuti per zona, calorie; per corsa e trekking anche distanza e dislivello;
  - avviso "Allenamento rilevato: segnalo come fatto?" (§6.4);
  - il pulsante manuale "Segna come fatta" resta disponibile.

### 7.2 Vista trainer
- **Dati del cliente** (non più "In arrivo"):
  - tabella di 7 giorni (lunedì–domenica) con navigazione per settimana: sonno (ore e percentuale), pisolini, FC a riposo, HRV, indice di recupero, passi, sessioni;
  - campo **Obiettivo sonno** (ore e minuti) che salva `impostazioni/obiettivi`.
- **Come sta [Nome]:** aggiunge sonno dell'ultima notte e indice di recupero di oggi.

## 8. Errori e casi limite

| Situazione | Comportamento |
|---|---|
| Refresh token rifiutato (`invalid_grant`: revocato, o scaduto se l'app è in Testing) | Script: nessun file, `ERRORE: autorizzazione: …`. Attività: `sync/stato` con `esito: "errore"`, messaggio "Autorizzazione Google scaduta: va rinnovato il token". La pagina mostra l'avviso. |
| Rete assente o risposte 429/5xx | Fino a 3 tentativi con attesa 2 s, 4 s, 8 s. Poi come sopra con "Google Health non raggiungibile". La prossima esecuzione recupera, perché rilegge gli ultimi 3 giorni. |
| Un solo tipo di dato fallisce | Si emettono gli altri; `esito: "parziale"`, `tipiMancanti` valorizzato; regola di fusione di §5.1. |
| Giorno senza orologio | Campi `null`, `pisolini: []`; la pagina mostra "Nessun dato". |
| Sonno a cavallo della finestra | La finestra di lettura del sonno usa la fine (`sleep.interval.civil_end_time`), quindi la notte che finisce nel primo giorno della finestra è inclusa. |
| "Aggiorna ora" premuto più volte | Ogni pressione avvia una sessione; le scritture sono idempotenti; pulsante disattivato 2 minuti. |
| Connettore non disponibile, consenso negato o `fire_trigger` fallito | Il pulsante sparisce (o mostra "Non disponibile" dopo un errore); le esecuzioni programmate continuano. |
| Documenti di salute assenti (prima sincronizzazione) | La pagina funziona come nel sottoprogetto 1: "Nessun dato". |

## 9. Sicurezza

- Client ID, client secret e refresh token stanno solo nelle variabili d'ambiente `GH_*` dell'ambiente cloud. Non vengono stampati, scritti su file, salvati nel database o inclusi nel repository.
- L'access token vive solo in memoria nello script.
- `out/` è in `.gitignore`.
- Un test verifica che `out/sync.json` non contenga i valori delle variabili `GH_*` né l'access token.
- La pagina può chiamare del connettore Claude Code Remote solo `fire_trigger`.
- Nel database ci sono solo dati di salute normalizzati, leggibili soltanto da chi ha accesso all'artefatto (cliente e trainer).

## 10. Test

`node --test`, come nel sottoprogetto 1.

- **`normalizza`** (risposte API finte, ricavate dalle forme viste nello spike):
  - sonno principale e pisolini, giorno del risveglio nel fuso di Roma, cambio dell'ora legale;
  - sonno `CLASSIC` senza fasi; due sonni principali nello stesso giorno;
  - numeri come stringa; valori mancanti;
  - conversione dei tipi di esercizio, incluso un tipo sconosciuto.
- **`client`** (`fetch` finto): scambio del token; pagine successive; nuovi tentativi su 429/5xx; `invalid_grant` senza tentativi.
- **`sessioni`**: sovrapposizione esattamente al 50% e appena sotto; stessa fonte; unione transitiva di tre sessioni; sessione a cavallo della mezzanotte; priorità dei campi.
- **`indici`**: "In calibrazione" con 6 e 7 valori; HRV mancante; limiti 0 e 100; obiettivo del sonno mancante (480); percentuale oltre il 100%.
- **`sync.js` da capo a fondo** (`fetch` finto): produce `out/sync.json` con lo schema di §4.2, operazioni `set`/`update` corrette, nessun segreto; codice d'uscita ≠ 0 e nessun file su `invalid_grant`.
- **E2E** (come nel sottoprogetto 1, con il finto `claude`): anelli con dati, "In calibrazione", Attività recenti, colonna Fatto, avviso Sì/No, Dati del cliente, Aggiorna ora visibile solo al proprietario.
- **Prova reale (una volta):** `npm run sync` con le credenziali vere, poi scrittura nel database dell'artefatto e controllo con `ArtifactData list`.

## 11. Verifiche all'inizio dell'implementazione

1. Una sessione avviata dall'attività programmata vede le variabili `GH_*` e ha `ArtifactData`. Se no: ripiego di §4.3.
2. Dalla pagina pubblicata, `fire_trigger` del connettore Claude Code Remote funziona per il proprietario. Se no: il pulsante non si fa e lo si sostituisce con l'avvio manuale dall'app Claude.
3. Il cliente conferma nella console di Google Cloud che l'app OAuth è "In production".
4. Con `developers.google.com` raggiungibile: date di lancio della Google Health API e di spegnimento della Fitbit Web API legacy.

## 12. Punti aperti

- Tabella completa di conversione `exerciseType` → `tipo`: si ricava dall'enum del discovery durante l'implementazione.
- Strava, Komoot, Hevy: specifiche proprie; useranno `sessioni/` e `unisciSessioni`.
