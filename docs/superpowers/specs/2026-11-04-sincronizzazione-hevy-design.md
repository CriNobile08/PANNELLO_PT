# PANNELLO_PT — Sottoprogetto 2c-1: Importazione da Hevy

- **Data:** 2026-11-04
- **Stato:** bozza da rivedere
- **Dipende da:** [Sottoprogetto 2a — Sincronizzazione Google Health](2026-11-04-sincronizzazione-google-health-design.md)
- **Seguito:** 2c-2 (selettore dal catalogo Hevy nell'editor delle schede, invio delle schede a Hevy come routine, confronto previsto/fatto) — specifica propria.

## 1. Scopo

Portare nel pannello, in automatico, gli allenamenti registrati dal cliente nell'app **Hevy** (esercizi, serie, ripetizioni, pesi), unirli alle sessioni dell'orologio e tenere una copia del catalogo degli esercizi Hevy per il 2c-2.

**Criterio di successo:**
1. Un allenamento registrato su Hevy compare entro la sincronizzazione successiva in `sessioni/hevy_{id}` con esercizi e serie.
2. Se nello stesso intervallo l'orologio ha registrato una sessione, il pannello mostra **una sola** sessione unita: nome da Hevy, FC, zone e calorie dall'orologio, fonti `googleHealth` e `hevy`.
3. Una modifica fatta su Hevy si riflette nel pannello; un allenamento cancellato su Hevy sparisce dal pannello ma resta nel database.
4. `hevy/catalogo` contiene il catalogo completo degli esercizi, aggiornato una volta al giorno.
5. Se una fonte fallisce, l'altra viene comunque salvata.
6. La chiave Hevy non esce dalla variabile d'ambiente.

## 2. Esito dello spike (2026-11-04)

Codice usa e getta, non conservato.

- **Credenziali:** variabile d'ambiente `HEVY_API_KEY` dell'ambiente cloud. Header `api-key`. L'API è riservata agli abbonati Hevy Pro.
- **Account:** quello del cliente, che inizia ora a usarlo: `workout_count: 0`. Nessun import iniziale dello storico.
- `GET https://api.hevyapp.com/v1/user/info` → 200, campi `id, username, name, url, weight_unit, distance_unit, is_pro`.
- `GET /v1/workouts?page&pageSize` → 200, chiavi `page, page_count, workouts`.
- `GET /v1/workouts/events?page&pageSize&since` → 200. **Con risposta vuota le chiavi erano `page, page_count, workouts`** (la documentazione parla di `events`): forma reale degli eventi `updated`/`deleted` da verificare col primo allenamento.
- `GET /v1/exercise_templates?page&pageSize` → `pageSize` massimo **100** (200 → 400). **451 esercizi** in 5 pagine, nessuno personalizzato. Campi: `id, title, type, primary_muscle_group, secondary_muscle_groups, equipment, is_custom, thumbnail_url`. In forma compatta (senza miniature) ≈ **50 KB**.
- Struttura vista su una routine (in attesa di allenamenti veri): esercizio `index, title, notes, exercise_template_id, superset_id, sets, rest_seconds`; serie `index, type, weight_kg, reps, distance_meters, duration_seconds, custom_metric`. Pesi già in kg, distanze in metri.
- 20 gruppi muscolari primari (`quadriceps` 54, `chest` 49, `abdominals` 46, `full_body` 46, `shoulders` 43, …). Nomi degli esercizi solo in inglese. Miniature su `pump-app.s3.eu-west-2.amazonaws.com` (bloccate dal CSP degli artefatti: non usate).

## 3. Ambito

**Incluso**
- Client e normalizzazione Hevy; fonte Hevy nello stesso `npm run sync` del 2a.
- Sessioni `sessioni/hevy_{id}` con esercizi e serie; cancellazione logica.
- Copia giornaliera del catalogo in `hevy/catalogo`.
- Esito per fonte in `out/sync.json` e `sync/stato`; card di stato con avvisi per fonte.
- Esclusione delle sessioni eliminate prima di `unisciSessioni`.

**Escluso**
- Selettore dal catalogo nell'editor delle schede, invio delle routine a Hevy, confronto previsto/fatto (2c-2).
- Scheda attività con la sezione "Esercizi Hevy" (sottoprogetto successivo, che userà i campi di §5.1).
- Avvio della sincronizzazione quando si segna "fatto" un allenamento: valutato e scartato per ora (si può aggiungere senza cambi strutturali, perché il cliente è proprietario dell'artefatto).
- Miniature degli esercizi, traduzione dei nomi degli esercizi, esercizi personalizzati.

## 4. Architettura

```
attività programmata (7×/giorno) / "Aggiorna ora"
        ▼
npm run sync → eseguiSync({ fonti: [googleHealth, hevy] })
   ├─ googleHealth  (logica del 2a invariata)
   └─ hevy
        1. GET /v1/workouts/events?since=adesso−3 giorni   (tutte le pagine)
        2. updated → set   sessioni/hevy_{id}   (documento completo)
           deleted → update sessioni/hevy_{id}  { eliminata: true, … }
        3. solo se l'ora di Roma è < 9:00: GET /v1/exercise_templates (tutte le pagine) → set hevy/catalogo
        ▼
out/sync.json { esito, fonti: { googleHealth, hevy }, operazioni }
        ▼ Claude: ArtifactData batch (a blocchi di 50) + sync/stato per ultimo
pagina: sessioni senza eliminata → unisciSessioni → UI
```

### 4.1 Componenti

| Unità | Responsabilità | Dipende da |
|---|---|---|
| `src/sync/hevy/client.js` | Header `api-key` da `HEVY_API_KEY`; `elencaEventi(since)` ed `elencaTemplate()` seguendo `page_count`; 3 ritentativi su rete/429/5xx (2 s, 4 s, 8 s); 401/403 → `ErroreSync('autorizzazione')` senza ritentativi; chiave sostituita da `***` in ogni messaggio. `fetch` ed `env` iniettati. | rete |
| `src/sync/hevy/normalizza.js` | Pura: `sessioneDaWorkout(w, { adesso })`, `operazioniDaEventi(eventi, { adesso })` (un'operazione per id, la più recente), `catalogoCompatto(templates, { adesso })`. | `logic/date.js` |
| `src/sync/fonti/googleHealth.js` | Il corpo attuale di `eseguiSync` del 2a, spostato senza cambi di logica; restituisce il risultato di fonte (§4.2). | moduli Google Health |
| `src/sync/fonti/hevy.js` | Chiama client e normalizzazione; decide se leggere il catalogo; restituisce il risultato di fonte. | moduli Hevy |
| `src/sync/esegui.js` | Orchestratore: esegue le fonti in sequenza, cattura l'errore di ciascuna, compone il file (§4.3). Lancia solo se **tutte** falliscono. | fonti |
| `scripts/sync.js` | Invariato nella forma; il log riassume per fonte; con tutte le fonti in errore stampa una riga `ERRORE:` per fonte ed esce con 1. | `esegui.js` |
| `src/logic/sessioni.js` | Nuova funzione pura `sessioniValide(docs)` che esclude `eliminata: true`; `unisciSessioni` invariata. | — |
| UI | Usa `sessioniValide` prima di `unisciSessioni` ovunque (Oggi, Giornata, Dati del cliente); card di stato per fonte. | logica pura |

### 4.2 Risultato di una fonte

```js
{ esito: "ok" | "parziale" | "errore",
  messaggio: "",                       // vuoto se ok
  conteggi: { … },                     // per fonte, §5.3
  tipiMancanti: [],                    // solo googleHealth
  operazioni: [ … ] }                  // [] se errore
```

### 4.3 Formato di `out/sync.json`

```js
{ generatoIl: "<ISO>",
  finestra: { dal: "YYYY-MM-DD", al: "YYYY-MM-DD" },   // della fonte googleHealth
  esito: "ok" | "parziale",            // "parziale" se almeno una fonte non è "ok"
  fonti: { googleHealth: { esito, messaggio, tipiMancanti, conteggi },
           hevy:         { esito, messaggio, conteggi } },
  operazioni: [ …googleHealth, …hevy ] }
```
Il file si scrive se almeno una fonte ha esito diverso da `errore`. Se tutte falliscono: nessun file, una riga per fonte su stderr `ERRORE: <fonte>: <codice>: <messaggio>`, codice d'uscita 1.

### 4.4 Finestra degli eventi

Lo script non legge il database, quindi non conserva un `since`. A ogni esecuzione usa `since = adesso − 72 ore` (ISO UTC). Gli eventi Hevy dipendono dal momento della **modifica**, non dalla data dell'allenamento: un allenamento vecchio corretto oggi rientra. Con 7 esecuzioni al giorno, 72 ore coprono molte esecuzioni saltate. Rieseguire non crea doppioni (scritture `set`/`update` per id).

### 4.5 Catalogo una volta al giorno

Lo script legge il catalogo solo se l'ora di Roma di `adesso` è **prima delle 9:00** (in pratica l'esecuzione delle 6:52, più eventuali "Aggiorna ora" premuti prima delle 9). Se quella lettura fallisce, il catalogo resta quello del giorno prima; nessun altro tentativo nella giornata.

### 4.6 Modifiche alle istruzioni dell'attività programmata (§4.3 del 2a)

- Passo 2: le `operazioni` si scrivono in **batch da al massimo 50**, nell'ordine del file; `sync/stato` si scrive per ultimo, con i campi `ultimaEsecuzione`, `esito`, `fonti` del file (senza `operazioni`).
- Passo 3 (comando fallito): `sync/stato` con `esito: "errore"` e, in `fonti`, il messaggio di ciascuna riga `ERRORE:`.
- Passo 4: non stampare mai i valori di `GH_*` né di `HEVY_API_KEY`, né il contenuto dei dati.
- Il documento `hevy/catalogo` (~50 KB) si scrive come le altre operazioni, passando `data` da file.

## 5. Modello dei dati

Convenzioni del sottoprogetto 1 e del 2a: date `YYYY-MM-DD` nel fuso Europe/Rome, timestamp ISO 8601, nomi in italiano, durate in minuti interi, distanze in metri, pesi in kg.

### 5.1 `sessioni/hevy_{idWorkout}`

Campi comuni del §5.2 del 2a più i campi propri di Hevy.
```js
{ fonte: "hevy", idFonte: "<id workout>", data: "2026-11-05",
  inizio: "<ISO start_time>", fine: "<ISO end_time>",
  tipo: "palestra", tipoOriginale: null, nome: "<title>",
  durataAttivaMin: 64,
  fcMedia: null, zoneMin: null, calorie: null, passi: null,
  distanzaM: null, dislivelloM: null, gps: false,
  idRoutine: "<routine_id>" | null,
  descrizione: "",
  esercizi: [
    { ordine: 0, nome: "Bench Press (Barbell)", idTemplate: "<exercise_template_id>",
      idSuperserie: null | 1, note: "",
      serie: [ { ordine: 0,
                 tipo: "riscaldamento" | "normale" | "cedimento" | "drop",
                 kg: 60 | null, ripetizioni: 8 | null,
                 durataSec: null | 45, distanzaM: null | 400, rpe: null | 8 } ] } ],
  serieTotali: 18,
  volumeKg: 8420,
  eliminata: false,
  aggiornatoIl: "<ISO updated_at di Hevy>" }
```
- `data`: giorno di Roma di `inizio`.
- `durataAttivaMin = round((fine − inizio) / 60 000)`.
- `tipo` è sempre `palestra`. Nell'unione Hevy ha la precedenza su `tipo` e `nome` (§6.1 del 2a), quindi una sessione dell'orologio sovrapposta diventa "palestra" con il nome Hevy; FC, zone e calorie restano dell'orologio.
- Tipo di serie: `warmup` → `riscaldamento`, `normal` → `normale`, `failure` → `cedimento`, `dropset` → `drop`; valore sconosciuto o assente → `normale`.
- `ordine` = `index` di Hevy; esercizi e serie ordinati per `ordine`.
- `serieTotali`: numero di serie con `tipo ≠ riscaldamento`.
- `volumeKg`: somma di `kg × ripetizioni` sulle serie con `tipo ≠ riscaldamento` e con entrambi i valori non nulli; arrotondato all'intero.
- Numeri come stringa convertiti in numero; valori assenti → `null`; stringhe assenti (`notes`, `description`) → `""`.
- `rpe` è letto se presente nella serie; altrimenti `null`. `custom_metric` è ignorato.

### 5.2 Cancellazione logica

Un evento `deleted` produce:
```js
{ op: "update", collection: "sessioni", doc_id: "hevy_<id>",
  data: { fonte: "hevy", idFonte: "<id>", eliminata: true, aggiornatoIl: "<ISO deleted_at, o adesso>" } }
```
Se il documento non esiste, la regola del 2a ("update su documento assente → set con gli stessi dati") crea un documento ridotto con `eliminata: true`; la pagina lo esclude comunque. Nessuna cancellazione vera: regole del database invariate (§5.7 del 2a).

**Più eventi per lo stesso allenamento nella finestra:** vale solo quello con istante più recente (`updated_at` del workout per `updated`, `deleted_at` per `deleted`; a parità vale l'ordine della risposta, l'ultimo vince). "Modificato poi cancellato" → solo la cancellazione.

**Forma degli eventi accettata** (finché non verificata, §11): la risposta può avere l'elenco in `events` o in `workouts`. Ogni elemento è `{ type: "updated", workout: {…} }` oppure `{ type: "deleted", id, deleted_at }`. Un elemento di forma diversa è scartato e conteggiato in `conteggi.scartate`.

### 5.3 Conteggi della fonte Hevy
```js
{ sessioni: 2, eliminate: 0, scartate: 0, catalogo: 451 | null }   // catalogo null se non letto in questa esecuzione
```

### 5.4 `hevy/catalogo`
```js
{ aggiornatoIl: "<ISO>",
  esercizi: [ { id, nome, gruppo: "chest", secondari: ["triceps"],
                attrezzo: "barbell", tipo: "weight_reps", personalizzato: false } ] }
```
Ordinato per `nome`. Le chiavi dei gruppi restano quelle di Hevy; la traduzione italiana (tabella fissa di 20 voci) sta nella pagina e serve al 2c-2. Scritto solo se la lettura di **tutte** le pagine riesce.

### 5.5 `sync/stato` (sostituisce §5.5 del 2a)
```js
{ ultimaEsecuzione: "<ISO>",
  esito: "ok" | "parziale" | "errore",       // errore solo se tutte le fonti falliscono
  fonti: {
    googleHealth: { esito, messaggio, tipiMancanti: [], conteggi: { giorni, sessioni } },
    hevy:         { esito, messaggio, conteggi: { sessioni, eliminate, scartate, catalogo } } } }
```
**Compatibilità:** finché non arriva la prima esecuzione nuova può esistere il formato del 2a (`messaggio`, `tipiMancanti`, `conteggi` al primo livello, senza `fonti`). La pagina lo legge come `fonti: { googleHealth: { esito, messaggio, tipiMancanti, conteggi } }`.

## 6. Regole di calcolo

- **Esclusione:** `sessioniValide(docs) = docs.filter(d => d.eliminata !== true)`. Va applicata **prima** di `unisciSessioni`, così un allenamento cancellato su Hevy lascia sola la sessione dell'orologio.
- **Unione:** `unisciSessioni` e le priorità restano quelle del §6.1 del 2a. I campi propri di Hevy (`esercizi`, `serieTotali`, `volumeKg`, `idRoutine`) non vengono copiati sulla sessione unita: si leggono dalla parte con `fonte: "hevy"` in `parti`.
- **Avviso "Allenamento rilevato"** (§6.4 del 2a): una sessione Hevy conta come sessione rilevata, come quelle dell'orologio.

## 7. Schermate

Modifiche minime; la presentazione degli esercizi arriva con la scheda attività.

- **Card di stato (Oggi):** "Aggiornato alle HH:MM" da `ultimaEsecuzione`. Per ogni fonte con esito `errore`: "<Fonte>: ultimo aggiornamento non riuscito alle HH:MM: <messaggio>". Per ogni fonte `parziale`: "<Fonte>: alcuni dati non aggiornati". Nomi visibili: "Orologio" per `googleHealth`, "Hevy" per `hevy`.
- **Attività recenti / colonna Fatto:** invariate; la sessione unita mostra le fonti, e con Hevy il nome dato nell'app.

## 8. Errori e casi limite

| Situazione | Comportamento |
|---|---|
| `HEVY_API_KEY` mancante | `hevy: { esito: "errore", messaggio: "Chiave Hevy mancante" }`; Google Health procede. |
| 401/403 (chiave revocata o abbonamento Pro scaduto) | Nessun ritentativo; messaggio "Chiave Hevy non valida o abbonamento Pro scaduto". |
| Rete assente, 429, 5xx | 3 ritentativi (2 s, 4 s, 8 s), poi "Hevy non raggiungibile". La prossima esecuzione recupera (finestra di 72 ore). |
| Eventi letti, catalogo fallito | `hevy.esito: "parziale"`, messaggio "Catalogo esercizi non aggiornato"; sessioni scritte, catalogo invariato. |
| Allenamento senza `start_time`/`end_time` o con durata ≤ 0 | Scartato, conteggiato in `scartate`. |
| Allenamento a cavallo della mezzanotte | `data` = giorno di Roma dell'inizio. |
| Una sola fonte fallisce | File scritto con le operazioni dell'altra; card con avviso per la fonte fallita. |
| Tutte le fonti falliscono | Nessun file; righe `ERRORE:` per fonte; `sync/stato` con `esito: "errore"`. |
| Più di 50 scritture | L'attività le divide in batch da 50 (§4.6). |
| Documento ridotto `eliminata: true` | Escluso dalla pagina. |
| Allenamento Hevy senza sessione dell'orologio | Sessione unita con sola fonte Hevy: `fcMedia`, `zoneMin`, `calorie` nulli. |

## 9. Sicurezza

- La chiave sta solo in `HEVY_API_KEY`: mai stampata, scritta su file, salvata nel database o inclusa nel repository o nei messaggi d'errore (sostituita da `***`).
- Il test del 2a che verifica l'assenza dei valori `GH_*` in `out/sync.json` si estende a `HEVY_API_KEY`.
- Il catalogo è un dato pubblico di Hevy; gli allenamenti sono dati del cliente, con le stesse regole di lettura del 2a.

## 10. Test

`node --test`, come nei sottoprogetti precedenti.

- **`hevy/normalizza`** (risposte finte dalla documentazione e dai campi dello spike):
  - i 4 tipi di serie e un tipo sconosciuto;
  - `volumeKg` e `serieTotali` senza riscaldamento; serie con `kg` o `ripetizioni` nulli;
  - esercizi a sole ripetizioni e a durata/distanza;
  - allenamento a cavallo della mezzanotte e nel giorno del cambio dell'ora legale;
  - allenamento senza `end_time` (scartato);
  - più eventi per lo stesso id: vale il più recente, compreso "modificato poi cancellato";
  - elemento evento di forma sconosciuta (scartato);
  - `catalogoCompatto`: ordinamento, template senza miniatura o senza secondari.
- **`hevy/client`** (`fetch` finto): header `api-key`; pagine successive fino a `page_count`; ritentativi su 429/5xx; 401 senza ritentativi; risposta eventi con chiave `events` oppure `workouts`; chiave assente dai messaggi d'errore.
- **`esegui`**: entrambe le fonti ok; solo Hevy in errore; solo Google in errore; tutte in errore (lancia); catalogo letto alle 6:52 e non alle 12:52 di Roma; forma per fonte del risultato; `esito` complessivo.
- **`sync.js` da capo a fondo**: nessun valore `GH_*` né `HEVY_API_KEY` nel file; codice d'uscita 1 e nessun file se tutte falliscono; 0 con una fonte fallita.
- **`sessioni`**: `sessioniValide` esclude `eliminata: true`; un allenamento Hevy sovrapposto a un "WEIGHTS" dell'orologio dà una sola sessione con nome Hevy, FC dell'orologio e fonti `["googleHealth", "hevy"]`; con la parte Hevy eliminata resta la sola sessione dell'orologio.
- **E2E**: card di stato con formato nuovo (una fonte in errore) e con il vecchio formato del 2a.
- **Prova reale (una volta, dopo il primo allenamento del cliente):** `npm run sync` con la chiave vera; controllo della forma degli eventi (§11.1) e scrittura nel database.

## 11. Verifiche all'inizio dell'implementazione

1. Forma reale di `/v1/workouts/events` con almeno un evento `updated` e, se possibile, uno `deleted` (chiave dell'elenco, campi dell'evento). Fino ad allora vale la forma tollerante di §5.2.
2. Presenza e nome dei campi `routine_id` e `rpe` in un allenamento vero.
3. La sessione dell'attività programmata vede `HEVY_API_KEY` (come per `GH_*`).

## 12. Punti aperti

- Avvio della sincronizzazione al "fatto" di un allenamento di palestra (scartato per ora).
- Miniature degli esercizi caricate come asset dell'artefatto (2c-2, se servono).
