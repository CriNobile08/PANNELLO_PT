# PANNELLO_PT — Importazione da Hevy (2c-1): piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere Hevy come seconda fonte di `npm run sync`: allenamenti in `sessioni/hevy_{id}` con esercizi e serie, cancellazione logica, catalogo giornaliero in `hevy/catalogo`, esito per fonte, e pagina che esclude le sessioni eliminate prima di `unisciSessioni`.

**Architecture:** Il corpo attuale di `eseguiSync` (Google Health) diventa la fonte `src/sync/fonti/googleHealth.js`; si aggiunge `src/sync/fonti/hevy.js` (client + normalizzazione pura). `src/sync/esegui.js` diventa un orchestratore che esegue le fonti in sequenza, isola i fallimenti e compone `out/sync.json` con `fonti: { googleHealth, hevy }`. La pagina filtra `eliminata` con `sessioniValide` e mostra lo stato per fonte.

**Tech Stack:** Node 22 (`fetch` nativo), `node:test`, Preact 11.1.1 + htm 3.1.1, esbuild 0.28.2, Playwright preinstallato (solo E2E). Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-11-04-sincronizzazione-hevy-design.md` (i "§n" puntano a questa). Spec e piano del 2a: `docs/superpowers/specs/2026-11-04-sincronizzazione-google-health-design.md`, `docs/superpowers/plans/2026-11-04-sincronizzazione-google-health.md`.

## Global Constraints

- Valgono i Global Constraints dei piani del sottoprogetto 1 e del 2a (date Europe/Rome, ISO 8601, italiano, "Nessun dato", nessuna dipendenza nuova).
- Chiave solo da `process.env.HEVY_API_KEY`, inviata nell'header `api-key`. Mai stampata, scritta su file, nel database, nel repository o nei messaggi d'errore (sostituita da `***`).
- Base API: `https://api.hevyapp.com/v1`. Endpoint: `GET /workouts/events?page&pageSize=10&since=<ISO>`, `GET /exercise_templates?page&pageSize=100`. Si seguono le pagine fino a `page_count`.
- `since = adesso − 72 ore`, in ISO UTC (`new Date(adesso - 72*3600e3).toISOString()`).
- Catalogo letto solo se `oraRoma(adesso.toISOString()) < '09:00'`.
- Tentativi: fino a 3 su rete assente, 429 e 5xx, attese 2 s, 4 s, 8 s; 401/403 mai ritentati.
- Codici `ErroreSync`: `configurazione`, `autorizzazione`, `rete`.
- Messaggi fissi Hevy: `configurazione` → "Chiave Hevy mancante"; `autorizzazione` → "Chiave Hevy non valida o abbonamento Pro scaduto"; `rete` → "Hevy non raggiungibile"; catalogo fallito → "Catalogo esercizi non aggiornato". Messaggi Google Health invariati dal 2a.
- Riga d'errore su stderr, una per fonte fallita, solo quando falliscono tutte: `ERRORE: <fonte>: <codice>: <messaggio>`.
- Nomi delle fonti nella card di stato: `googleHealth` → "Orologio", `hevy` → "Hevy".
- Tipi di serie: `warmup`→`riscaldamento`, `normal`→`normale`, `failure`→`cedimento`, `dropset`→`drop`, altro→`normale`.

## Review Focus

1. **Evento "modificato poi cancellato" nella stessa finestra**: deve restare solo la cancellazione, altrimenti l'allenamento ricompare. → Task 2, test `modificato poi cancellato`.
2. **Hevy in errore e Google ok (o viceversa)**: il file va scritto con le operazioni dell'altra fonte; prima del 2c-1 lo script usciva con 1. → Task 3, test `solo hevy in errore` e `solo googleHealth in errore`.
3. **`sync/stato` del 2a ancora nel database** (senza `fonti`): la card non deve rompersi né mostrare "undefined". → Task 4, E2E `stato vecchio formato`.
4. **Allenamento Hevy cancellato sovrapposto a una sessione dell'orologio**: resta la sola sessione dell'orologio, non sparisce tutto. → Task 4, test `parte hevy eliminata`.
5. **Serie a sole ripetizioni o a durata** (`weight_kg: null`): `volumeKg` non diventa `NaN`. → Task 2, test `volume con valori nulli`.

---

### Task 1: Client Hevy

**Files:**
- Create: `src/sync/errore.js` (sposta qui `ErroreSync`)
- Modify: `src/sync/googleHealth/client.js` (importa e riesporta `ErroreSync` da `../errore.js`: i test esistenti non cambiano)
- Create: `src/sync/hevy/client.js`
- Test: `test/hevyClient.test.js`

**Interfaces:**
- Produces: `class ErroreSync extends Error { codice }` in `src/sync/errore.js`.
- Produces: `creaClientHevy({ env, fetch, attendi? }) → { elencaEventi(since: string): Promise<object[]>, elencaTemplate(): Promise<object[]> }`. `elencaEventi` restituisce gli elementi grezzi presi da `dati.events ?? dati.workouts ?? []` di ogni pagina; `elencaTemplate` concatena `dati.exercise_templates`.

- [ ] **Step 1: Scrivi i test** con un `fetch` finto (stile di `test/sync.test.js`):
  - `header api-key`: ogni chiamata ha `headers['api-key'] === 'chiave-segreta'`.
  - `eventi su più pagine`: `page_count: 2` → due chiamate con `page=1` e `page=2`, `pageSize=10`, `since` esatto; risultato concatenato.
  - `chiave events o workouts`: una pagina con `events: [a]` e una con `workouts: [b]` → `[a, b]`.
  - `template a pagine da 100`: `pageSize=100` nell'URL.
  - `429 poi ok`: 2 chiamate, `attendi` chiamata con `2000`.
  - `5xx sempre` → `ErroreSync` con `codice === 'rete'` dopo 4 chiamate, attese `[2000, 4000, 8000]`.
  - `401 senza tentativi` e `403 senza tentativi` → `codice === 'autorizzazione'`, 1 chiamata.
  - `chiave mancante` → `codice === 'configurazione'`, nessuna chiamata.
  - `chiave mai nei messaggi`: risposta 400 con corpo `{ error: 'chiave-segreta non valida' }` → il messaggio dell'errore non contiene `chiave-segreta`.
- [ ] **Step 2: Esegui** `node --test test/hevyClient.test.js` → FAIL (modulo assente).
- [ ] **Step 3: Implementa** `src/sync/errore.js` e `src/sync/hevy/client.js` riusando lo schema di `conTentativi`/`pulisci` del client Google (copiato, non condiviso: i due client restano indipendenti). Un 4xx diverso da 401/403 lancia un `Error` con lo stato.
- [ ] **Step 4: Esegui** `npm test` → PASS (anche i test del 2a).
- [ ] **Step 5: Commit** `feat(sync): client dell'API Hevy`.

### Task 2: Normalizzazione Hevy

**Files:**
- Create: `src/sync/hevy/normalizza.js`
- Create: `test/fixtures/hevy.js` (costruttori `workout({ id, inizio, fine, aggiornato, esercizi })`, `esercizio({ ... })`, `serie({ ... })`, `evento.aggiornato(w)`, `evento.cancellato(id, quando)`, `template({ ... })`, con i campi dello spike §2)
- Test: `test/hevyNormalizza.test.js`

**Interfaces:**
- Consumes: `dataDaIso` da `src/logic/date.js`.
- Produces:
  - `sessioneDaWorkout(w) → object | null`: documento di §5.1 (senza `id`), `null` se manca `start_time`/`end_time` o durata ≤ 0.
  - `operazioniDaEventi(eventi) → { operazioni: Op[], conteggi: { sessioni, eliminate, scartate } }` con `Op = { op, collection: 'sessioni', doc_id: 'hevy_<id>', data }`.
  - `catalogoCompatto(templates, { adesso }) → { aggiornatoIl, esercizi: [...] }` (§5.4).

- [ ] **Step 1: Scrivi i test**:
  - `documento completo`: un workout con 2 esercizi → tutti i campi di §5.1, inclusi `fonte: 'hevy'`, `tipo: 'palestra'`, `tipoOriginale: null`, `fcMedia: null`, `gps: false`, `eliminata: false`, `aggiornatoIl` = `updated_at`, `idRoutine` da `routine_id` (e `null` se assente).
  - `tipi di serie`: `warmup`, `normal`, `failure`, `dropset`, `'boh'` → `riscaldamento`, `normale`, `cedimento`, `drop`, `normale`.
  - `volume e serie totali`: serie `warmup 40×10`, `normal 60×8`, `normal 60×8`, `failure 60×6` → `serieTotali: 3`, `volumeKg: 1320`.
  - `volume con valori nulli`: serie `reps_only` (`weight_kg: null, reps: 15`) e `duration` (`duration_seconds: 45`) → `volumeKg: 0`, `kg: null`, `durataSec: 45`, nessun `NaN`.
  - `ordine`: esercizi e serie in disordine nell'input → ordinati per `index`.
  - `mezzanotte`: `start_time` 22:30Z del 4/11 → `data: '2026-11-04'`; 23:30Z del 4/11 → `'2026-11-05'`.
  - `cambio d'ora`: `start_time` `2026-10-25T00:30:00Z` → `data: '2026-10-25'`, `durataAttivaMin` dalla differenza reale degli istanti.
  - `senza fine` → `sessioneDaWorkout` restituisce `null`; in `operazioniDaEventi` → `scartate: 1`.
  - `cancellato`: evento `deleted` → `{ op: 'update', doc_id: 'hevy_X', data: { fonte: 'hevy', idFonte: 'X', eliminata: true, aggiornatoIl: <deleted_at> } }`.
  - `modificato poi cancellato`: `updated` (10:00) e `deleted` (11:00) per lo stesso id → una sola operazione, quella di cancellazione; `conteggi: { sessioni: 0, eliminate: 1, scartate: 0 }`.
  - `due modifiche`: vince `updated_at` più recente anche se arriva prima nella risposta.
  - `evento sconosciuto`: `{ type: 'boh' }` → `scartate: 1`, nessuna operazione.
  - `catalogo`: tre template in disordine → ordinati per `nome`, campi `id, nome, gruppo, secondari, attrezzo, tipo, personalizzato`; template senza `secondary_muscle_groups` → `secondari: []`; nessun campo `thumbnail_url`.
- [ ] **Step 2: Esegui** `node --test test/hevyNormalizza.test.js` → FAIL.
- [ ] **Step 3: Implementa** le tre funzioni. Istante di un evento: `workout.updated_at` per `updated`, `deleted_at` per `deleted`; a parità vince l'ultimo nell'ordine d'ingresso. Numeri come stringa convertiti con `Number`, non finiti → `null`.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(sync): normalizzazione degli allenamenti e del catalogo Hevy`.

### Task 3: Fonti indipendenti e orchestratore

**Files:**
- Create: `src/sync/fonti/googleHealth.js` (corpo attuale di `eseguiSync`, senza cambi di logica)
- Create: `src/sync/fonti/hevy.js`
- Modify: `src/sync/esegui.js` (diventa l'orchestratore)
- Modify: `scripts/sync.js`
- Modify: `test/sync.test.js` (i test Google esistenti chiamano `fonteGoogleHealth`; i test di `main` adattati alla nuova forma)
- Test: `test/syncFonti.test.js`

**Interfaces:**
- Consumes: `creaClient` (2a), `creaClientHevy`, `operazioniDaEventi`, `catalogoCompatto`, `ErroreSync`, `oraRoma`.
- Produces:
  - Risultato di fonte (§4.2): `{ esito: 'ok'|'parziale', messaggio, conteggi, operazioni, tipiMancanti?, finestra? }`.
  - `fonteGoogleHealth({ client, adesso }) → Promise<RisultatoFonte>`: come l'attuale `eseguiSync`, con `messaggio: ''`, `conteggi: { giorni, sessioni }`, `tipiMancanti`, `finestra`. Lancia `ErroreSync` come oggi.
  - `fonteHevy({ client, adesso }) → Promise<RisultatoFonte>`: eventi → operazioni; se `oraRoma(adesso.toISOString()) < '09:00'` legge il catalogo e aggiunge `{ op: 'set', collection: 'hevy', doc_id: 'catalogo', data }` in coda; `conteggi: { sessioni, eliminate, scartate, catalogo: n | null }`. Catalogo fallito → `esito: 'parziale'`, `messaggio: 'Catalogo esercizi non aggiornato'`. Errore sugli eventi → lancia.
  - `MESSAGGI = { googleHealth: { autorizzazione, rete, configurazione }, hevy: { … } }` esportato da `esegui.js` (i testi Google sono quelli oggi in `scripts/sync.js`).
  - `eseguiSync({ fonti: { [nome]: () => Promise<RisultatoFonte> }, adesso }) → Promise<{ generatoIl, finestra, esito, fonti, operazioni }>`. Non lancia. Per una fonte che lancia: `{ esito: 'errore', codice, messaggio: MESSAGGI[nome][codice] ?? MESSAGGI[nome].rete, operazioni: [] }` (codice `rete` se l'errore non è `ErroreSync`). `esito` complessivo: `errore` se tutte in errore, `ok` se tutte `ok`, altrimenti `parziale`. `fonti[nome]` = risultato senza `operazioni` e senza `finestra`. `finestra` = quella di `googleHealth` o `null`. `operazioni` concatenate nell'ordine delle fonti.
  - `main(...)` di `scripts/sync.js`: crea i due client da `env`/`fetch`/`attendi`, chiama `eseguiSync({ fonti: { googleHealth, hevy } })`. Con `esito: 'errore'`: rimuove il file, scrive una riga `ERRORE: <fonte>: <codice>: <messaggio>` per fonte, ritorna 1. Altrimenti scrive il file, logga una riga e ritorna 0. Riga di log: `` `sync: ${esito} · googleHealth ${e} · hevy ${e}` `` dove `e` è l'esito della fonte.

- [ ] **Step 1: Scrivi i test** in `test/syncFonti.test.js` (fonti finte come funzioni, più un giro con `fetch` finto che serve entrambe le API):
  - `entrambe ok`: `esito: 'ok'`, `fonti.googleHealth.conteggi`, `fonti.hevy.conteggi`, operazioni Google poi Hevy, nessuna chiave `operazioni` dentro `fonti.*`.
  - `solo hevy in errore`: fonte Hevy lancia `ErroreSync('autorizzazione')` → `esito: 'parziale'`, `fonti.hevy = { esito: 'errore', codice: 'autorizzazione', messaggio: 'Chiave Hevy non valida o abbonamento Pro scaduto', … }`, operazioni solo Google.
  - `solo googleHealth in errore`: `finestra: null`, operazioni solo Hevy.
  - `tutte in errore`: `esito: 'errore'`, `operazioni: []`, non lancia.
  - `errore generico → rete`: la fonte lancia `new Error('x')` → `codice: 'rete'`, messaggio "Hevy non raggiungibile".
  - `catalogo alle 6:52 e non alle 12:52`: `adesso` `2026-11-04T05:52:00Z` → c'è l'operazione `hevy/catalogo` e `conteggi.catalogo: 451` (fixture con 451 template su 5 pagine); `2026-11-04T11:52:00Z` → nessuna chiamata a `/exercise_templates`, `conteggi.catalogo: null`.
  - `catalogo fallito`: `/exercise_templates` 500 → `fonti.hevy.esito: 'parziale'`, messaggio "Catalogo esercizi non aggiornato", operazioni sessioni presenti.
  - `since esatto`: con `adesso` `2026-11-04T08:52:00Z` l'URL eventi ha `since=2026-11-01T08:52:00.000Z`.
  - In `test/sync.test.js`: `main scrive out/sync.json senza segreti` esteso a `HEVY_API_KEY`; `main con una fonte fallita` → codice 0 e file presente; `main con tutte fallite` → codice 1, nessun file, righe `['ERRORE: googleHealth: autorizzazione: Autorizzazione Google scaduta: va rinnovato il token', 'ERRORE: hevy: configurazione: Chiave Hevy mancante']`.
- [ ] **Step 2: Esegui** `npm test` → i nuovi test FAIL.
- [ ] **Step 3: Implementa** lo spostamento in `fonti/googleHealth.js`, poi `fonti/hevy.js`, `esegui.js`, `scripts/sync.js`. Adatta i test del 2a in `test/sync.test.js` solo dove cambia la forma (chiamata a `fonteGoogleHealth`, `conteggi` e messaggi di `main`); le asserzioni sui dati restano identiche.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(sync): fonte Hevy e fonti indipendenti in npm run sync`.

### Task 4: Pagina — sessioni eliminate e stato per fonte

**Files:**
- Modify: `src/logic/sessioni.js` (aggiunge `sessioniValide`)
- Create: `src/logic/statoSync.js` (`fontiStato`)
- Modify: `src/ui/cliente/oggi.js:28-37` (`StatoSync`) e `:63`, `src/ui/cliente/giornata.js:228`, `src/ui/trainer/dati.js:110` (filtro prima di `unisciSessioni`)
- Test: `test/sessioni.test.js`, `test/statoSync.test.js`, `test/e2e/salute.test.js`

**Interfaces:**
- Produces: `sessioniValide(docs: object[]) → object[]` (esclude `eliminata === true`); `fontiStato(stato) → Array<{ nome: 'Orologio'|'Hevy'|string, esito, messaggio }>` in `src/logic/statoSync.js` (pura, testata senza browser). Con `stato.fonti` assente restituisce `[{ nome: 'Orologio', esito: stato.esito, messaggio: stato.messaggio }]`.

- [ ] **Step 1: Scrivi i test**:
  - `test/sessioni.test.js`: `sessioniValide esclude eliminata`; `hevy sovrapposta a WEIGHTS`: una sessione Google 07:30–08:32 e una Hevy 07:35–08:30 nome "Spinta A" → una sessione unita con `nome: 'Spinta A'`, `fcMedia` della Google, `fonti: ['googleHealth', 'hevy']`; `parte hevy eliminata`: la stessa coppia con la Hevy `eliminata: true` → una sessione con `fonti: ['googleHealth']`.
  - `test/statoSync.test.js`: formato nuovo con Hevy in errore → `[{ nome: 'Orologio', esito: 'ok', … }, { nome: 'Hevy', esito: 'errore', messaggio: 'Hevy non raggiungibile' }]`; formato vecchio → un solo elemento "Orologio".
  - `test/e2e/salute.test.js`: `stato per fonte` — `sync/stato` con `fonti.hevy.esito: 'errore'` → testo "Aggiornato alle 10:52" e "Hevy: ultimo aggiornamento non riuscito alle 10:52: Hevy non raggiungibile"; con `fonti.hevy.esito: 'parziale'` → "Hevy: alcuni dati non aggiornati"; `stato vecchio formato` — l'attuale `STATO_OK` e la variante `errore` mostrano i testi di oggi, mai "undefined"; `sessione hevy eliminata non compare` in Attività recenti.
- [ ] **Step 2: Esegui** `npm test` e `npm run test:e2e` → i nuovi test FAIL.
- [ ] **Step 3: Implementa.** `StatoSync`: riga principale "Aggiornato alle HH:MM" se `esito ≠ 'errore'`, altrimenti il testo d'errore del 2a con il messaggio della prima fonte in errore; sotto, una riga per ogni fonte `errore` ("<Nome>: ultimo aggiornamento non riuscito alle HH:MM: <messaggio>", solo se `esito` complessivo non è `errore`) e per ogni fonte `parziale` ("<Nome>: alcuni dati non aggiornati"). Con il formato vecchio i testi restano identici a oggi.
- [ ] **Step 4: Esegui** `npm test`, `npm run test:e2e` e `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(ui): sessioni Hevy eliminate escluse e stato della sincronizzazione per fonte`.

### Task 5: Attività programmata e prova reale

Nessun codice. Richiede la conferma dell'utente prima di modificare l'attività.

- [ ] **Step 1: Verifica** in una sessione cloud di prova che `HEVY_API_KEY` sia visibile (solo il nome, `env | grep -c '^HEVY_API_KEY='` → `1`) e che `npm run sync` termini con 0 e una riga `sync: … · hevy ok`.
- [ ] **Step 2: Aggiorna le istruzioni** dell'attività programmata esistente (id in `impostazioni/sync`, da `list_triggers`) con `update_trigger`, applicando §4.6: batch da 50 nell'ordine del file, `sync/stato` per ultimo con `ultimaEsecuzione`, `esito`, `fonti`; in caso di comando fallito `sync/stato` con `esito: "errore"` e i messaggi delle righe `ERRORE:` in `fonti`; mai stampare `GH_*` né `HEVY_API_KEY`. Branch da clonare: quello che contiene questo codice. Mostra il testo all'utente e chiedi conferma prima di salvarlo.
- [ ] **Step 3: Avvia** l'attività una volta (`fire_trigger`) e controlla con `ArtifactData list` di `sync`: `sync/stato` ha `fonti.hevy.esito` ≠ `errore`.
- [ ] **Step 4: Dopo il primo allenamento vero del cliente** (§11): esegui `npm run sync`, guarda solo i nomi dei campi dell'evento (mai i valori) e conferma o correggi la forma di §5.2 e la presenza di `routine_id` e `rpe`. Se cambia qualcosa: aggiorna fixture, test e spec nello stesso commit `fix(sync): forma reale degli eventi Hevy`.
