# PANNELLO_PT — Sincronizzazione Google Health: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importare in automatico nel pannello i dati Fitbit del cliente dalla Google Health API (sonno, pisolini, FC a riposo, HRV, passi, sessioni) e mostrarli negli anelli, nelle card, nel dettaglio giornata e nella vista trainer.

**Architecture:** Uno script Node senza dipendenze (`scripts/sync.js`) legge l'API con le credenziali delle variabili d'ambiente e produce `out/sync.json` con le sole operazioni sul database. Un'attività programmata di Claude esegue lo script e scrive le operazioni con `ArtifactData batch`. La pagina legge le nuove raccolte in tempo reale; unione delle sessioni e indici sono funzioni pure in `src/logic/`.

**Tech Stack:** Node 22 (`fetch` nativo), `node:test`, Preact 11.1.1 + htm 3.1.1, esbuild 0.28.2, Playwright preinstallato (solo E2E). Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-11-04-sincronizzazione-google-health-design.md` (i riferimenti "§n" puntano a questa). Convenzioni e struttura del sottoprogetto 1: `docs/superpowers/specs/2026-11-04-pannello-pt-base-design.md` e `docs/superpowers/plans/2026-11-04-pannello-pt-base.md`.

## Global Constraints

- Valgono tutti i Global Constraints del piano del sottoprogetto 1 (date `YYYY-MM-DD` Europe/Rome, ISO 8601, interfaccia in italiano, "Nessun dato" dove manca un dato, mai numeri di esempio, scritture solo su azione dell'utente, colori).
- Credenziali solo da `process.env.GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `GH_REFRESH_TOKEN`. Mai stampate, mai scritte su file, mai nel database o nel repository. L'access token vive solo in memoria.
- Endpoint: token `https://oauth2.googleapis.com/token`; API `https://health.googleapis.com/v4/users/me/dataTypes/{tipo}/dataPoints` (`GET`, filtro AIP-160, `pageToken`) e `…/dataPoints:dailyRollUp` (`POST`, body `{ range: { start: { date }, end: { date } } }`, fine esclusa).
- Finestra di sincronizzazione: ultimi 3 giorni di Roma, oggi incluso (`dal = oggi − 2`, `al = oggi`).
- Tentativi: fino a 3 su rete assente, 429 e 5xx, attese 2 s, 4 s, 8 s; `invalid_grant` mai ritentato.
- Riga d'errore dello script su stderr: `ERRORE: <codice>: <messaggio>` con `codice` ∈ `autorizzazione`, `rete`, `configurazione`.
- Messaggi fissi della UI: "In calibrazione", "Aggiorna ora", "Aggiornamento in corso…", "Aggiornato alle HH:MM", "Ultimo aggiornamento non riuscito alle HH:MM: <messaggio>", "Alcuni dati non aggiornati", "Allenamento rilevato: segnalo come fatto?", "Attività recenti", "Obiettivo sonno", "Autorizzazione Google scaduta: va rinnovato il token", "Google Health non raggiungibile".
- Capability della pagina: `{ db: { rules: [{ path: "", read: "view", write: "interact" }] }, user: { scopes: ["profile"] }, mcp: { servers: [{ server: "Claude Code Remote", tools: ["fire_trigger"] }] } }`.
- Attività programmata: `CRON_TZ=Europe/Rome 52 6,9,12,15,18,21,23 * * *`, una sessione nuova per esecuzione.
- `out/` in `.gitignore`.

## Review Focus

1. **Cambio dell'ora legale** (notte del 25/10/2026, `endUtcOffset` diverso da `startUtcOffset`): il sonno va nel giorno di Roma della fine, calcolato con il fuso e non con l'offset UTC. → Task 1, test `sonno a cavallo del cambio d'ora`.
2. **Pisolino prima di mezzanotte UTC ma dopo mezzanotte di Roma** (fine 23:30Z = 00:30 Roma): appartiene al giorno di Roma successivo. → Task 1, test `pisolino dopo mezzanotte di Roma`.
3. **Sessione senza metriche** (`metricsSummary` vuoto, niente FC né calorie): la UI mostra "—" e mai `NaN`, `null` o "undefined bpm". → Task 8, E2E `sessione senza metriche`.
4. **Media a 30 giorni pari a 0 o con valori non numerici** (dato corrotto nel db): niente divisione per zero; quel Δ si scarta, e senza Δ validi l'anello mostra "In calibrazione". → Task 6, test `media zero`.
5. **`impostazioni/sync` mancante o senza `idAttivita`**: il pulsante "Aggiorna ora" non compare, nessun errore in console. → Task 8, E2E `aggiorna ora senza attività`.

---

## Struttura dei file

```
src/sync/googleHealth/normalizza.js   pura: risposte API → giorni salute e sessioni (+ tabella tipi)
src/sync/googleHealth/client.js       token, list paginato, dailyRollUp, tentativi; fetch iniettato
src/sync/esegui.js                    orchestrazione testabile: finestra, chiamate, operazioni, esito
scripts/sync.js                       avvio CLI: env → esegui → out/sync.json, codice d'uscita
src/logic/sessioni.js                 unisciSessioni
src/logic/indici.js                   percentuale sonno, medie 30 giorni, indice di recupero
src/data/store.js                     + raccolte salute, sessioni, impostazioni, sync; + salvaObiettivi
src/main.js                           + capability mcp, aggiornaOra nel contesto
src/ui/cliente/oggi.js                anelli, card dati, stato sync, Attività recenti, Aggiorna ora
src/ui/cliente/sessioni.js            nuovo: RigaSessione, DettaglioSessione (riusati da oggi/giornata/trainer)
src/ui/cliente/giornata.js            colonna Fatto, avviso Allenamento rilevato
src/ui/trainer/dati.js                nuovo: Dati del cliente + Obiettivo sonno
src/ui/trainer/settimana.js           "Come sta" con sonno e recupero
src/ui/app.js                         sezione dati-cliente attiva
test/fixtures/googleHealth.js         risposte API finte (forme dello spike)
test/*.test.js, test/e2e/*.test.js    come sotto
```

---

### Task 0: Verifiche preliminari (§11, nessun codice)

- [ ] **Step 1: Attività di prova.** Con `create_trigger` (`create_new_session_on_fire: true`, `run_once_at` fra 2 minuti) crea un'attività il cui prompt chiede di: riportare se esistono le variabili `GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `GH_REFRESH_TOKEN` (solo sì/no, mai i valori); caricare `ArtifactData` con ToolSearch e fare `list` della raccolta `diario` dell'artefatto `https://claude.ai/artifact/MdFb5BEz89JBCQ2VRTqEGv` riportando solo il numero di documenti. Chiedi prima il consenso dell'utente.
- [ ] **Step 2: Leggi l'esito** con `list_events` sulla sessione creata. Atteso: tre "sì" e un conteggio. Se una delle due cose manca, annotalo nella risposta all'utente e nel Task 10 usa il ripiego di §4.3 (sessione persistente).
- [ ] **Step 3: Elimina l'attività di prova** con `delete_trigger`.
- [ ] **Step 4: Chiedi all'utente** lo stato "In production"/"Testing" dell'app OAuth e se `developers.google.com` è ora raggiungibile (`curl -s -o /dev/null -w "%{http_code}" https://developers.google.com/`); se sì, verifica le date della Fitbit Web API e riportale.

---

### Task 1: Normalizzazione dei dati giornalieri

**Files:**
- Create: `src/sync/googleHealth/normalizza.js`, `test/fixtures/googleHealth.js`
- Test: `test/normalizza.test.js`

**Interfaces:**
- Consumes: `dataDaIso(iso)`, `aggiungiGiorni(data, n)` da `src/logic/date.js`.
- Produces:
  - `giorniSalute({ sonno, fcRiposo, hrv, passi }, { dal, al, adesso }) → { [data]: DocSalute }` — un elemento per ogni data da `dal` ad `al`, anche se vuota. Argomenti: array di data point grezzi (`sonno`, `fcRiposo`, `hrv`) e array `rollupDataPoints` (`passi`); un argomento `undefined` significa "tipo fallito" e il campo corrispondente (`sonno`+`pisolini`, `fcRiposo`, `hrv`, `passi`) viene **omesso** dal documento.
  - `DocSalute` = schema §5.1 con `fonte: "googleHealth"` e `aggiornatoIl: adesso.toISOString()`.
  - `minutiDaDurata("3720s") → 62` (arrotonda ai minuti; `null` se manca).
  - Fixture: `puntoSonno({ inizio, fine, principale = true, fasi, tipo = "STAGES", minutiAddormentato })`, `puntoFc(data, bpm)`, `puntoHrv(data, rmssd)`, `rollupPassi(data, n)`, `puntoEsercizio({...})` che producono oggetti con le chiavi esatte viste nello spike (`sleep.interval.endTime`, `sleep.metadata.mainSleep`, `sleep.summary.minutesAsleep` come stringa, `stagesSummary[{type, minutes}]`, `dailyRestingHeartRate.date {year,month,day}`, `beatsPerMinute` stringa, `steps.countSum` stringa, `civilStartTime.date`).

Regole (§5.1): sonno principale = `metadata.mainSleep === true`; pisolino = tutti gli altri. Giorno = `dataDaIso(interval.endTime)`. Fasi: `DEEP→profondo, REM→rem, LIGHT→leggero, AWAKE→sveglio`; `type === "CLASSIC"` → `fasi: null`. Più sonni principali nello stesso giorno → quello con più `minutiAddormentato`. Stringhe numeriche → `Number`. Punti fuori da `[dal, al]` scartati.

- [ ] **Step 1: Scrivi i test**

```js
test('sonno principale nel giorno del risveglio', () => {
  const g = giorniSalute({ sonno: [puntoSonno({ inizio: '2026-11-03T22:40:00Z', fine: '2026-11-04T05:50:00Z', minutiAddormentato: 412, fasi: { DEEP: 71, REM: 88, LIGHT: 253, AWAKE: 38 } })], fcRiposo: [], hrv: [], passi: [] }, { dal: '2026-11-02', al: '2026-11-04', adesso: new Date('2026-11-04T09:52:00Z') });
  assert.deepEqual(Object.keys(g), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(g['2026-11-04'].sonno.minutiAddormentato, 412);
  assert.deepEqual(g['2026-11-04'].sonno.fasi, { profondo: 71, rem: 88, leggero: 253, sveglio: 38 });
  assert.equal(g['2026-11-03'].sonno, null);
  assert.deepEqual(g['2026-11-03'].pisolini, []);
});
test('sonno a cavallo del cambio d\'ora');          // fine 2026-10-25T05:30:00Z → '2026-10-25'
test('pisolino dopo mezzanotte di Roma');           // principale:false, fine 2026-11-03T23:30:00Z → pisolini di '2026-11-04'
test('sonno CLASSIC senza fasi');                   // fasi === null
test('due sonni principali: vince il più lungo');
test('fcRiposo, hrv e passi convertiti in numero'); // fcRiposo 54, hrv {rmssd:41.2, rmssdProfondo:47, fcNonRem:52}, passi 8423
test('tipo fallito: campo omesso');                 // hrv: undefined → !('hrv' in g[d]) per ogni d; gli altri campi presenti
test('punti fuori finestra scartati');
test('minutiDaDurata');                             // '3720s'→62, '89.6s'→1, undefined→null
```

- [ ] **Step 2:** `node --test test/normalizza.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** Implementa `giorniSalute` e `minutiDaDurata` in `src/sync/googleHealth/normalizza.js` e le fixture.
- [ ] **Step 4:** `node --test test/normalizza.test.js` → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(sync): normalizzazione dei dati giornalieri Google Health`

---

### Task 2: Normalizzazione delle sessioni

**Files:**
- Modify: `src/sync/googleHealth/normalizza.js`
- Test: `test/normalizza.test.js`

**Interfaces:**
- Produces:
  - `TIPI_ESERCIZIO: { [exerciseType]: 'palestra'|'corsa'|'trekking'|'camminata'|'bici' }`; tutto il resto → `'altro'`.
  - `sessioniDa(punti, { dal, al, adesso }) → Array<{ id: string, doc: DocSessione }>` con `id = "googleHealth_" + ultimoSegmento(name)` e `DocSessione` schema §5.2.

Tabella (copiare esattamente):
- `palestra`: WEIGHTS, WEIGHTLIFTING, FREE_WEIGHTS, WEIGHT_MACHINES, STRENGTH_TRAINING, FUNCTIONAL_STRENGTH_TRAINING, POWERLIFTING, BODY_WEIGHT, CALISTHENICS, CIRCUIT_TRAINING, CORE_TRAINING, CROSSFIT, CROSS_TRAINING, HIIT, INTERVAL_WORKOUT, TABATA_WORKOUT, BOOTCAMP, RESISTANCE_BANDS, TRX, WORKOUT
- `corsa`: RUNNING, TRAIL_RUN, TREADMILL, INCLINE_RUN
- `trekking`: HIKING, BACKPACKING, RUCKING, SNOWSHOEING
- `camminata`: WALKING, POWER_WALKING, NORDIC_WALKING, TREADMILL_WALK, INCLINE_WALK, STROLLER_WALK, WALK_WITH_WEIGHTS
- `bici`: BIKING, OUTDOOR_BIKE, MOUNTAIN_BIKE, STATIONARY_BIKE, SPINNING, ELECTRIC_BIKE, ASSAULT_BIKE, HAND_CYCLING

Conversioni: `durataAttivaMin = minutiDaDurata(activeDuration)`, se manca dalla differenza fine−inizio; `fcMedia = Number(averageHeartRateBeatsPerMinute)`; `zoneMin = { leggera, moderata, intensa, picco }` da `heartRateZoneDurations.{light,moderate,vigorous,peak}Time` (`null` se assente); `calorie = round(caloriesKcal)`; `distanzaM = round(distanceMillimeters/1000)`; `dislivelloM = round(elevationGainMillimeters/1000)`; `passi = Number(steps)`; `gps = exerciseMetadata.hasGps === true`; `data = dataDaIso(interval.startTime)`; campi assenti → `null`.

- [ ] **Step 1: Scrivi i test** — `tipi convertiti` (`'WEIGHTS'→'palestra'`, `'TRAIL_RUN'→'corsa'`, `'YOGA'→'altro'`, `'NUOVO_TIPO'→'altro'`), `sessione completa` (assert su tutti i campi di §5.2 con unità convertite), `sessione senza metriche` (tutti `null`, `gps: false`), `id dal name`, `data di Roma dell'inizio`.
- [ ] **Step 2:** `node --test test/normalizza.test.js` → FAIL.
- [ ] **Step 3:** Implementa `TIPI_ESERCIZIO` e `sessioniDa`.
- [ ] **Step 4:** `node --test test/normalizza.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(sync): normalizzazione delle sessioni di allenamento`

---

### Task 3: Client della Google Health API

**Files:**
- Create: `src/sync/googleHealth/client.js`
- Test: `test/client.test.js`

**Interfaces:**
- Produces:
  - `class ErroreSync extends Error { codice: 'autorizzazione'|'rete'|'configurazione' }` (esportata).
  - `creaClient({ env, fetch, attendi = (ms) => new Promise(r => setTimeout(r, ms)) }) → { elenca(tipo, filtro, pageSize?) → Promise<dataPoint[]>, rollupGiornaliero(tipo, dal, alEscluso) → Promise<rollupDataPoint[]> }`.
  - Il token si ottiene alla prima chiamata e si riusa. Variabili mancanti → `ErroreSync('configurazione')` senza chiamate di rete. Risposta token `400` con `error: "invalid_grant"` → `ErroreSync('autorizzazione')` subito. 401 dall'API → `autorizzazione`. Rete/429/5xx → ritenta con `attendi(2000|4000|8000)`, poi `ErroreSync('rete')`. Altri 4xx → `Error` normale con stato e `error.status` della risposta (mai il token nel messaggio).
  - `elenca` segue `nextPageToken` finché c'è; `pageSize` 25 per `sleep` ed `exercise`, altrimenti omesso.

- [ ] **Step 1: Scrivi i test** con un `fetch` finto che registra le chiamate: `scambio del token una sola volta` (2 chiamate API, 1 al token; body con `grant_type=refresh_token`), `pagine successive` (2 pagine → punti concatenati, secondo URL con `pageToken`), `ritenta su 503 poi riesce` (attese `[2000]`), `rete assente tre volte` (attese `[2000,4000,8000]`, `codice === 'rete'`), `invalid_grant senza tentativi`, `variabili mancanti`, `il messaggio d'errore non contiene i segreti` (per ogni errore: `!msg.includes(env.GH_CLIENT_SECRET) && !msg.includes(env.GH_REFRESH_TOKEN) && !msg.includes(accessToken)`), `dailyRollUp invia range civile` (body `{ range: { start: { date: {year:2026,month:11,day:2} }, end: { date: {year:2026,month:11,day:5} } } }`).
- [ ] **Step 2:** `node --test test/client.test.js` → FAIL.
- [ ] **Step 3:** Implementa `creaClient` ed `ErroreSync`.
- [ ] **Step 4:** `node --test test/client.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(sync): client Google Health con tentativi e paginazione`

---

### Task 4: Orchestrazione e script `npm run sync`

**Files:**
- Create: `src/sync/esegui.js`, `scripts/sync.js`
- Modify: `package.json` (script `"sync": "node scripts/sync.js"`), `.gitignore` (+ `out/`)
- Test: `test/sync.test.js`

**Interfaces:**
- Consumes: `creaClient`, `ErroreSync` (Task 3); `giorniSalute`, `sessioniDa` (Task 1–2); `oggiRoma`, `aggiungiGiorni`.
- Produces:
  - `eseguiSync({ client, adesso }) → Promise<RisultatoSync>` con `RisultatoSync` = formato di §4.2: `{ generatoIl, finestra: {dal, al}, esito, tipiMancanti, conteggi: {giorni, sessioni}, operazioni: [{ op, collection, doc_id, data }] }`.
  - Chiamate (filtri esatti, `al1 = aggiungiGiorni(al, 1)`):
    - `sleep`: `sleep.interval.civil_end_time >= "${dal}" AND sleep.interval.civil_end_time < "${al1}"`
    - `daily-resting-heart-rate`: `daily_resting_heart_rate.date >= "${dal}" AND daily_resting_heart_rate.date < "${al1}"`
    - `daily-heart-rate-variability`: idem con `daily_heart_rate_variability.date`
    - `exercise`: `exercise.interval.civil_start_time >= "${dal}" AND exercise.interval.civil_start_time < "${al1}"`
    - `steps`: `rollupGiornaliero('steps', dal, al1)`
  - Un tipo che lancia un errore non `ErroreSync` → finisce in `tipiMancanti` (nome del tipo API) ed `esito: 'parziale'`; operazioni `salute` diventano `op: 'update'`. Se fallisce `exercise` non si emettono sessioni. Un `ErroreSync` si propaga.
  - `scripts/sync.js`: crea il client da `process.env` e `globalThis.fetch`, chiama `eseguiSync`, scrive `out/sync.json` (crea la cartella), stampa solo `sync: <esito>, <giorni> giorni, <sessioni> sessioni`. Su `ErroreSync` stampa su stderr `ERRORE: <codice>: <messaggio>` ed esce con 1, senza file (cancella un `out/sync.json` preesistente). Esporta `main({ env, fetch, adesso, cartella })` per i test; esegue `main` solo se avviato da CLI (stesso controllo di `scripts/build.js`).

- [ ] **Step 1: Scrivi i test** con un `fetch` finto che risponde con le fixture: `finestra di tre giorni` (`dal '2026-11-02'`, `al '2026-11-04'` con `adesso = 2026-11-04T08:52:00Z`), `filtri esatti` (URL decodificati uguali alle stringhe sopra), `operazioni set` (3 `salute` + N `sessioni`, `esito 'ok'`), `HRV fallita → parziale` (`tipiMancanti: ['daily-heart-rate-variability']`, `salute` con `op 'update'` e senza `hrv`), `idempotenza` (due esecuzioni con gli stessi dati e lo stesso `adesso` → `operazioni` identiche), `main scrive out/sync.json senza segreti` (cartella temporanea; il file non contiene `GH_CLIENT_SECRET`, `GH_REFRESH_TOKEN` né l'access token finto), `main su invalid_grant` (codice 1, nessun file, stderr che inizia con `ERRORE: autorizzazione:`).
- [ ] **Step 2:** `node --test test/sync.test.js` → FAIL.
- [ ] **Step 3:** Implementa `eseguiSync`, `scripts/sync.js`, script npm, `.gitignore`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Prova reale.** `npm run sync` con le variabili vere. Atteso: `sync: ok, 3 giorni, N sessioni`. Controlla con `node -e` solo chiavi e conteggi di `out/sync.json` (mai stampare il file), poi `grep -c "$GH_REFRESH_TOKEN" out/sync.json` → `0`.
- [ ] **Step 6: Commit** `feat(sync): script npm run sync che produce out/sync.json`

---

### Task 5: Unione delle sessioni

**Files:**
- Create: `src/logic/sessioni.js`
- Test: `test/sessioni.test.js`

**Interfaces:**
- Produces: `unisciSessioni(sessioni: Array<DocSessione & { id }>) → Array<SessioneUnita>` con `SessioneUnita = { id, data, inizio, fine, fonti: string[], parti: Array<DocSessione & {id}>, tipo, nome, durataAttivaMin, fcMedia, zoneMin, calorie, passi, distanzaM, dislivelloM }`. `id` = id della prima parte in ordine di `inizio`. Ordinamento per `inizio` decrescente.
- `PRIORITA` (esportata, §6.1): `{ tipo: ['hevy','strava','komoot','googleHealth'], nome: idem, fcMedia: ['googleHealth','strava','hevy','komoot'], zoneMin: idem, calorie: idem, distanzaM: ['strava','komoot','googleHealth','hevy'], dislivelloM: idem }`; `durataAttivaMin` e `passi` seguono la priorità di `fcMedia`.

Algoritmo: gruppi con union-find; collega `a`,`b` se `a.fonte !== b.fonte` e `sovrapposizione(a,b) >= 0.5 * min(durata(a), durata(b))` (durate in ms da `inizio`/`fine`; durata 0 non si collega). Un gruppo non può contenere due parti della stessa fonte: se un collegamento le unirebbe, quel collegamento si salta (si valutano le coppie in ordine di sovrapposizione decrescente).

- [ ] **Step 1: Scrivi i test** — `una sola fonte resta com'è` (fonti `['googleHealth']`, campi copiati), `sovrapposizione esattamente 50% unisce`, `49% non unisce`, `stessa fonte non si unisce mai`, `tre fonti transitive`, `priorità dei campi` (fcMedia da googleHealth, nome da hevy), `mezzanotte` (inizio 23:30 Roma → `data` del giorno d'inizio), `ordinamento decrescente`.
- [ ] **Step 2:** `node --test test/sessioni.test.js` → FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(logic): unione delle sessioni di più fonti`

---

### Task 6: Indici di sonno e recupero

**Files:**
- Create: `src/logic/indici.js`
- Test: `test/indici.test.js`

**Interfaces:**
- Consumes: `aggiungiGiorni`.
- Produces:
  - `OBIETTIVO_SONNO_PREDEFINITO = 480`
  - `percentualeSonno(docSalute, obiettivoMin = 480) → number|null` — §6.2; `null` senza `sonno`.
  - `minutiPisolini(docSalute) → number` (somma, 0 se nessuno).
  - `medie30(salute: {[data]: DocSalute}, data) → { fc: number|null, nFc, hrv: number|null, nHrv }` sui giorni `data−30 … data−1`; considera solo valori numerici finiti > 0.
  - `recupero(salute, data) → { stato: 'nessun-dato'|'calibrazione'|'ok', fc: number|null, freccia: 'su'|'giu'|'uguale'|null, indice: number|null }` — §6.3: `nessun-dato` se manca `fcRiposo` oggi; `calibrazione` se `nFc < 7`; Δhrv solo con HRV oggi e `nHrv >= 7`; freccia `uguale` se |fc−media| < 1.

- [ ] **Step 1: Scrivi i test** — `percentuale` (412/480 → 86; 600/480 → 100; obiettivo assente → 480), `pisolini sommati`, `calibrazione con 6 valori, ok con 7`, `indice in linea = 50` (fc 54 su media 54, hrv 40 su media 40), `miglioramento 10% = 75` (fc 48,6 su 54 e hrv 44 su 40), `limiti 0 e 100`, `HRV mancante usa solo fc`, `media zero` (tutti i giorni con `fcRiposo: 0` → `calibrazione`, nessun `NaN`), `oggi escluso dalla media`, `freccia`.
- [ ] **Step 2:** `node --test test/indici.test.js` → FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(logic): percentuale del sonno e indice di recupero`

---

### Task 7: Store, avvio e finto claude

**Files:**
- Modify: `src/data/store.js`, `src/main.js`, `src/ui/contesto.js` (commento del valore), `test/support/fake-claude.js`, `test/support/apri.js`
- Test: `test/store.test.js`, `test/fake-claude.test.js`

**Interfaces:**
- Produces:
  - `dati` (snapshot dello store) aggiunge: `salute: {[data]: DocSalute}`, `sessioni: Array<DocSessione & {id}>`, `impostazioni: {[id]: doc}`, `sync: {[id]: doc}`. `COLLEZIONI` diventa `['schede','settimane','eccezioni','alimentazione','diario','salute','sessioni','impostazioni','sync']` (9 sottoscrizioni; aggiornare il commento "esattamente 5").
  - `store.salvaObiettivi({ sonnoMinuti })` → `set` di `impostazioni/obiettivi` con `{ sonnoMinuti, aggiornatoIl, autore }`; rifiuta `{ codice: 'non_valido' }` se non è un intero tra 180 e 720.
  - `DIARIO_VUOTO` aggiunge `sessioniCollegate: []`, `rilevamentoIgnorato: false`.
  - Contesto: `aggiornaOra: (() => Promise<void>) | null` — non `null` solo se `isOwner`, `claude.use('mcp')` non è `null` e `dati.impostazioni.sync?.idAttivita` è una stringa non vuota. Chiama `mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id }, { cache: false })` (firma del contratto 0.2.96: `callTool(server, tool, input, options?)`; il rifiuto ha forma `McpError` con `code`).
  - Finto claude: opzione `mcp` (`true` → `use('mcp')` restituisce un oggetto con `callTool` che registra le chiamate in `window.claude.chiamateMcp()`; default `null`). `apriPannello` inoltra `mcp`.

- [ ] **Step 1: Scrivi i test** — store: `emette salute, sessioni, impostazioni, sync` (seme con un doc per raccolta → presenti in `dati`), `nove sottoscrizioni` (`iscrizioniAttive() === 9`), `salvaObiettivi valido e non valido`, `diario nuovo ha i campi nuovi`; fake: `mcp registra le chiamate`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementa store, fake, `apri.js` e in `main.js` la risoluzione di `mcp` (in parallelo a `db` e `user`, con `prova(..., null)`) e la costruzione di `aggiornaOra` passata ad `App` e quindi al contesto.
- [ ] **Step 4:** `npm test` → PASS; `npm run build && npm run test:e2e` → PASS (nessuna regressione).
- [ ] **Step 5: Commit** `feat(store): raccolte di salute, sessioni e stato della sincronizzazione`

---

### Task 8: Home "Oggi"

**Files:**
- Create: `src/ui/cliente/sessioni.js`
- Modify: `src/ui/cliente/oggi.js`, `src/ui/cliente/giornata.js` (`TIPI` + `camminata: 'Camminata', bici: 'Bici'`), `src/ui/stile.css`
- Test: `test/e2e/salute.test.js`

**Interfaces:**
- Consumes: `percentualeSonno`, `minutiPisolini`, `recupero`, `unisciSessioni`, `oraRoma`; contesto `dati`, `aggiornaOra`, `isOwner`.
- Produces: `RigaSessione({ sessione: SessioneUnita })` (tipo, ora d'inizio, durata, FC media, fonti) e `DettaglioSessione({ sessione })` (durata, FC media, minuti per zona, calorie; distanza e dislivello solo per `corsa` e `trekking`). Valori `null` → "—". Durate come `1 h 02` / `48 min`.

Comportamento (§7.1): anello Sonno `valore = percentuale`, `massimo = 100`, testo `6 h 52`, sottotesto `su 8 h`; sotto gli anelli riga fasi `Profondo 71′ · REM 88′ · Leggero 253′` e, se > 0, `+ pisolino 24 min`. Anello Cuore: testo `54` + freccia (`↑`/`↓`/`=`), sottotesto `bpm`, `valore = indice`, `massimo = 100`; stato `calibrazione` → testo `54`, sottotesto "In calibrazione", anello vuoto. Card dati: Passi, HRV (`41 ms`), Sonno profondo, REM; in fondo stato sync (`oraRoma(ultimaEsecuzione)`) con i messaggi dei Global Constraints e il pulsante "Aggiorna ora" se `aggiornaOra` (disattivato 2 minuti dopo la pressione, testo "Aggiornamento in corso…"). Sezione "Attività recenti": sessioni unite con `data` negli ultimi 7 giorni (oggi incluso), massimo 10; nascosta se vuota.

- [ ] **Step 1: Scrivi i test E2E** (seme con 10 giorni di `salute`, 2 `sessioni`, `sync/stato`, `impostazioni/obiettivi`): `anelli con dati` ("6 h 52", "54", "bpm"), `in calibrazione` (solo 3 giorni di storico), `nessun dato` (seme vuoto → testi del sottoprogetto 1 invariati), `pisolino`, `stato sync ok ed errore` ("Aggiornato alle 10:52"; con `esito:'errore'` "Ultimo aggiornamento non riuscito alle 10:52: Autorizzazione Google scaduta: va rinnovato il token"), `attività recenti`, `sessione senza metriche` (nessun testo "NaN", "null", "undefined" nella pagina), `aggiorna ora` (`mcp: true`, proprietario, `impostazioni/sync` presente → click → una chiamata `fire_trigger` con il `trigger_id` del seme, pulsante disattivato con "Aggiornamento in corso…"), `aggiorna ora senza attività` (nessun pulsante), `aggiorna ora non proprietario` (nessun pulsante). Aggiorna il conteggio di "Nessun dato" atteso in `test/e2e/oggi.test.js` solo se cambia la struttura delle card.
- [ ] **Step 2:** `npm run build && node --test test/e2e/salute.test.js` → FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm run build && npm run test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(ui): anelli Sonno e Cuore, card dati, attività recenti, Aggiorna ora`

---

### Task 9: Dettaglio giornata: colonna Fatto e "Allenamento rilevato"

**Files:**
- Modify: `src/ui/cliente/giornata.js`, `src/ui/stile.css`
- Test: `test/e2e/salute.test.js`

**Interfaces:**
- Consumes: `unisciSessioni`, `DettaglioSessione` (Task 8), `useDiario(data).modifica`.
- Produces: `avvisoRilevamento({ haScheda, voce, sessioniGiorno }) → boolean` (esportata, pura, §6.4).

Comportamento: in `BloccoPrincipale`, se ci sono sessioni unite con `data` = giorno, colonna "Fatto" accanto a "Programmato" con un `DettaglioSessione` per sessione. Avviso sopra il blocco quando `avvisoRilevamento` è vero, pulsanti "Sì" (→ `modifica({ principaleFatto: true, sessioniCollegate: ids delle parti })`) e "No" (→ `modifica({ rilevamentoIgnorato: true })`). "Segna come fatta" resta.

- [ ] **Step 1: Scrivi i test** — unitario `avvisoRilevamento` (4 condizioni di §6.4, una falsa alla volta → `false`); E2E `colonna Fatto`, `avviso Sì` (diario con `principaleFatto: true` e `sessioniCollegate: ['googleHealth_s1']`, anello Allenamento aggiornato), `avviso No` (`rilevamentoIgnorato: true`, avviso sparito dopo ricarica), `nessun avviso nei giorni di riposo`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test && npm run build && npm run test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(ui): colonna Fatto e avviso Allenamento rilevato`

---

### Task 10: Vista trainer: Dati del cliente e "Come sta"

**Files:**
- Create: `src/ui/trainer/dati.js`
- Modify: `src/ui/app.js` (`SEZIONI['dati-cliente'] = SezioneDatiCliente`, voce non più `disattivata`), `src/ui/trainer/settimana.js` (riquadro "Come sta"), `src/ui/stile.css`
- Test: `test/e2e/dati-cliente.test.js`

**Interfaces:**
- Consumes: `percentualeSonno`, `minutiPisolini`, `recupero`, `unisciSessioni`, `lunediDi`, `giorniDellaSettimana`, `SelettoreData` (`passo = 7`), `store.salvaObiettivi`.
- Produces: `SezioneDatiCliente()`.

Comportamento (§7.2): tabella lun–dom con righe Sonno (`6 h 52 · 86%`), Pisolini, FC a riposo, HRV, Recupero (indice o "In calibrazione"), Passi, Sessioni (numero, con tipo); sul telefono una card per giorno. Campo "Obiettivo sonno" (ore e minuti, `numeroDaInput`) con "Salva" → `salvaObiettivi`; errori con `segnalaRifiuto`. "Come sta": aggiunge `Sonno ultima notte: 6 h 52` e `Recupero oggi: 72` (o "In calibrazione"/"Nessun dato").

- [ ] **Step 1: Scrivi i test E2E** — `voce di menu attiva` (niente "In arrivo" su Dati del cliente; "Report settimanali" ancora "In arrivo"), `tabella settimana corrente`, `settimana precedente`, `salva obiettivo` (7 h 30 → `impostazioni/obiettivi.sonnoMinuti === 450`, l'anello Sonno della vista cliente si aggiorna), `obiettivo non valido` (2 h → messaggio d'errore, nessuna scrittura), `come sta con dati`, `sola lettura` (`puoScrivere: false` → Salva disattivato).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test && npm run build && npm run test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(ui): dati del cliente e obiettivo del sonno per il trainer`

---

### Task 11: Messa in funzione

- [ ] **Step 1:** `npm test && npm run build && npm run test:e2e` → tutto PASS; screenshot 390/1440 px con `scripts/screenshot.js` (aggiungere al seme dati di salute finti) e controllo visivo.
- [ ] **Step 2: Pubblica** `dist/pannello.html` sull'artefatto `https://claude.ai/artifact/MdFb5BEz89JBCQ2VRTqEGv` (leggerlo prima con `Artifact read`) con le capability dei Global Constraints.
- [ ] **Step 3: Crea l'attività programmata** con `create_trigger`: nome "Sincronizzazione Google Health", `cron_expression` dei Global Constraints, `create_new_session_on_fire: true` (o il ripiego del Task 0), `initiation: human_request`, prompt = istruzioni di §4.3 punti 1–4 con l'URL dell'artefatto e l'URL del repository. Per ogni operazione `update`, se il documento non esiste ancora, scriverlo con `set` e gli stessi dati. Chiedi conferma all'utente prima.
- [ ] **Step 4:** Scrivi `impostazioni/sync` = `{ idAttivita: "<trig_…>" }` con `ArtifactData set`.
- [ ] **Step 5: Primo giro reale:** `fire_trigger`, poi `ArtifactData get sync/stato` → `esito: "ok"`; `ArtifactData list salute` → 3 documenti. Riporta all'utente solo esiti e conteggi.
- [ ] **Step 6:** Aggiorna la tabella di §2 della specifica del sottoprogetto 1 (riga 2: "in corso — Google Health fatto") e la specifica 2a (`Stato: implementata`). Commit `docs: sottoprogetto 2a in funzione` e push.
