# PANNELLO_PT — Scheda attività: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scheda di dettaglio per ogni sessione unita (riepilogo, zone FC, grafico FC, tracciato SVG da GPX caricato a mano, split per km, esercizi Hevy), con FC dettagliata da Google Health e fusione dei doppioni della stessa fonte.

**Architecture:** La sincronizzazione aggiunge `fcSerie` (media ogni 10 s) alle sessioni Google Health. Due moduli puri (`src/logic/fc.js`, `src/logic/gpx.js`) fanno i calcoli; `unisciSessioni` fonde i doppioni della stessa fonte. La pagina guadagna la sezione `sessione`, la raccolta `tracciati` e la capability `assets` per il GPX originale; il GPX si legge e si analizza nel browser.

**Tech Stack:** Node 22, `node:test`, Preact 11.1.1 + htm 3.1.1, esbuild 0.28.2, Playwright preinstallato (E2E). Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-11-04-scheda-attivita-design.md` (i "§n" puntano a questa). Spec collegate: 2a e 2c-1 in `docs/superpowers/specs/`.

## Global Constraints

- Valgono i Global Constraints dei piani precedenti (date Europe/Rome, ISO 8601, italiano, "—" per valore mancante, "Nessun dato" per sezione vuota, scritture solo su azione dell'utente, nessuna dipendenza).
- FC: `fcSerie = { passoSec: 10, inizio, bpm }`, media arrotondata per blocco, `null` se vuoto (§5.1).
- GPX: emisenoverso con raggio 6.371.000 m; quota smussata a 5 punti e soglia 1 m; tempo in movimento con velocità ≥ 0,5 m/s; ultimo split se ≥ 10 m; ≤ 300 punti di percorso e di quota; cornice SVG 1000×1000 con margine 40; file massimo 15 MB; sovrapposizione minima 0,5 (§6.2).
- Doppioni stessa fonte: sovrapposizione ≥ 0,8 della più corta (§6.1).
- Colori: FC `#2BC4A6`, allenamento `#5B9BFF`.
- Testi fissi: "Carica tracciato GPX", "Sostituisci", "Rimuovi", "File GPX non valido: servono punti con data e ora", "File troppo grande (massimo 15 MB)", "Il tracciato non coincide con questa sessione (orari diversi). Collegarlo comunque?", "Caricamento non riuscito. Riprova.", "FC dettagliata non aggiornata", "unite N registrazioni", "‹ Indietro".
- Capability della pagina alla pubblicazione: `{ db: { rules: [{ path: "", read: "view", write: "interact" }] }, user: { scopes: ["profile"] }, mcp: { servers: [{ server: "Claude Code Remote", tools: ["fire_trigger"] }] }, assets: {} }`.

## Review Focus

1. **GPX con fuso orario o senza `Z`** (`<time>2026-11-04T07:35:00+01:00</time>`): `Date.parse` lo legge correttamente; la sovrapposizione con la sessione non deve sbagliare di un'ora. → Task 2, test `tempi con offset`.
2. **GPX con punti duplicati o distanza zero tra punti consecutivi**: nessuna divisione per zero, nessun `NaN` in ritmo e split. → Task 2, test `punti fermi`.
3. **Sessione aperta dalla vista trainer senza asset** (`claude.use('assets')` → `null`): niente pulsanti, il resto della scheda funziona. → Task 6, E2E `sola lettura`.
4. **`fcSerie` assente nei documenti già salvati** (sincronizzati prima di questa modifica): grafico "Nessun dato", FC massima "—", FC per km "—". → Task 5, E2E `sessione senza fcSerie`.
5. **Sostituzione del GPX**: il vecchio asset va cancellato solo dopo la scrittura riuscita del nuovo documento; se la scrittura fallisce resta il tracciato precedente. → Task 6, test `sostituzione fallita`.

---

### Task 1: Logica FC

**Files:**
- Create: `src/logic/fc.js`
- Test: `test/fc.test.js`

**Interfaces:**
- Produces:
  - `serieFc(campioni: Array<{ t: string, bpm: number|string }>, inizio: string, fine: string, passoSec = 10) → { passoSec, inizio, bpm: Array<number|null> }`
  - `statisticheFc(fcSerie | null) → { media: number, massima: number } | null`
  - `fcPerKm(fcSerie | null, inizioGpx: string, istantiKm: number[], durataSec: number) → Array<number|null>` (un valore per split: intervalli `[0, istantiKm[0])`, `[istantiKm[0], istantiKm[1])`, …, l'ultimo fino a `durataSec`)

- [ ] **Step 1: Scrivi i test** — `blocchi da 10 s` (campioni a 0, 3, 6, 12 s da `inizio`, `fine` = +25 s → `bpm` lunghezza 3, `[media(0,3,6), valore a 12, null]`); `campioni fuori intervallo scartati`; `stringhe e valori non positivi` (`"120"` → 120, `0` e `-5` scartati); `arrotondamento` (100 e 101 → 101); `statisticheFc` (media e massima sui non nulli; tutti `null` → `null`; `null` in ingresso → `null`); `fcPerKm` (GPX che inizia 60 s dopo `fcSerie.inizio`, `istantiKm = [100]`, `durataSec = 150` → due valori corretti; senza `fcSerie` → `[null, null]`).
- [ ] **Step 2: Esegui** `node --test test/fc.test.js` → FAIL (modulo assente).
- [ ] **Step 3: Implementa** `src/logic/fc.js`.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(logica): serie FC, statistiche e FC per km`.

### Task 2: Logica GPX

**Files:**
- Create: `src/logic/gpx.js`
- Create: `test/fixtures/gpx.js` (costruttore `gpx({ punti: [{ lat, lon, ele?, time? }], segmenti? })` che restituisce il testo XML)
- Test: `test/gpx.test.js`

**Interfaces:**
- Produces:
  - `leggiGpx(testo: string, DOMParserImpl = globalThis.DOMParser) → Array<Array<{ lat, lon, ele: number|null, t: number }>>` (segmenti; lancia `{ codice: 'non_valido' }` se meno di 2 punti con `time` valido)
  - `analizzaGpx(segmenti) → { inizio, fine, distanzaM, dislivelloM|null, durataSec, inMovimentoSec, split: [...], percorso, segniKm, quote|null, istantiKm }` — tutti i campi di `tracciati/{idParte}` del §5.2 tranne `idParte, fonte, nomeFile, idAsset, caricatoIl, autore`.
  - `sovrapposizione(a: { inizio, fine }, b: { inizio, fine }) → number` (0..1, rispetto alla più corta)
- Node non ha `DOMParser`: `leggiGpx` lo riceve come parametro. Nei test si passa un parser minimo esportato da `test/fixtures/gpx.js`, che legge con espressioni regolari solo il formato generato dalla fixture. La pagina usa il `DOMParser` del browser; l'E2E del Task 6 copre quel percorso.

- [ ] **Step 1: Scrivi i test** — `distanza nota` (punti lungo l'equatore ogni 0,001° di longitudine per 10 km → `distanzaM` entro ±0,5% di 10.007 m circa calcolati con la stessa formula; il test confronta con un valore calcolato a mano nel test, non con il codice); `split con ultimo parziale` (8,43 km → 9 split, l'ultimo `distanzaM` 430 ± 5); `split interpolato` (tempo del km 1 per interpolazione tra i due punti a cavallo); `ultimo split sotto 10 m omesso`; `dislivello con rumore` (salita di 50 m con oscillazioni ±0,5 m → 50 ± 3); `senza quota` (`dislivelloM` e `quote` `null`, split con `dislivelloM: null`); `più segmenti` (la distanza tra fine del primo e inizio del secondo non si somma); `pause` (5 minuti fermi → `durataSec` li include, `inMovimentoSec` no); `punti fermi` (punti duplicati: nessun `NaN` in nessun campo); `tempi con offset` (`+01:00` e `Z` danno lo stesso `inizio` ISO); `sfoltimento` (2.000 punti → `percorso.length ≤ 300`, primo e ultimo uguali alla proiezione dei punti estremi; `quote.length ≤ 300`); `proiezione nella cornice` (tutti i punti in [40, 960]); `segniKm` (uno per km intero); `file non valido` (1 punto con ora, oppure punti senza `time` → `codice: 'non_valido'`); `sovrapposizione` (0,5 esatto, 0, uguale = 1).
- [ ] **Step 2: Esegui** `node --test test/gpx.test.js` → FAIL.
- [ ] **Step 3: Implementa** `src/logic/gpx.js` secondo §6.2. Douglas-Peucker iterativo sulle coordinate proiettate: tolleranza iniziale 0,5 unità, raddoppiata finché i punti sono ≤ 300.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(logica): lettura e analisi dei tracciati GPX`.

### Task 3: Fusione dei doppioni della stessa fonte

**Files:**
- Modify: `src/logic/sessioni.js` (`unisciSessioni`)
- Test: `test/sessioni.test.js`

**Interfaces:**
- Produces: la sessione unita ha in più `registrazioniUnite: number` (numero di parti della fonte più rappresentata fuse tra loro; 1 se nessuna fusione).

- [ ] **Step 1: Scrivi i test** — `stessa fonte all'80% si fonde` (googleHealth 0–65 min `WEIGHTS` e 1–66 min `STRENGTH_TRAINING` → 1 sessione, `registrazioniUnite: 2`, `parti.length 2`, campi dalla più lunga); `stessa fonte al 79% no` (2 sessioni); `completamento dei campi` (la più lunga ha `calorie: null`, l'altra 400 → 400); `poi unione con altra fonte` (i due doppioni Google e una Hevy sovrapposta → 1 sessione, fonti `['googleHealth','hevy']`, `registrazioniUnite: 2`); `transitiva` (tre registrazioni della stessa fonte a catena ≥ 80% → 1); i test esistenti restano verdi.
- [ ] **Step 2: Esegui** `node --test test/sessioni.test.js` → FAIL.
- [ ] **Step 3: Implementa**: primo passaggio union-find sulle coppie della stessa fonte con soglia 0,8 → per ogni gruppo una parte "rappresentante" (la più lunga, a parità la prima per `inizio`, campi nulli completati dalle altre in ordine di durata) che porta con sé `_parti` originali; il secondo passaggio esistente lavora sui rappresentanti; `parti` della sessione unita = tutte le parti originali.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(logica): fusione delle registrazioni doppie della stessa fonte`.

### Task 4: FC nella sincronizzazione Google Health

**Files:**
- Modify: `src/sync/fonti/googleHealth.js`
- Test: `test/sync.test.js` (fetch finto: risposte per `heart-rate`)

**Interfaces:**
- Consumes: `serieFc` (Task 1); `client.elenca(tipo, filtro, pageSize)` del 2a.
- Produces: ogni operazione `sessioni/googleHealth_*` ha `data.fcSerie`; `conteggi.fcSessioni`; fonte `parziale` con `messaggio: 'FC dettagliata non aggiornata'` se almeno una lettura FC fallisce.

- [ ] **Step 1: Scrivi i test** — `fcSerie nella sessione` (fetch finto con 3 campioni nella sessione `es1` → `fcSerie.bpm` atteso, `passoSec: 10`, `inizio` = inizio sessione); `filtro FC esatto` (`heart_rate.sample_time.physical_time >= "<inizio>" AND heart_rate.sample_time.physical_time < "<fine>"`, `pageSize=1000`); `FC fallita` (heart-rate 500 → `esito: 'parziale'`, `messaggio: 'FC dettagliata non aggiornata'`, sessione presente con `fcSerie: null`, `conteggi.fcSessioni: 0`); `nessuna sessione = nessuna chiamata heart-rate`; test esistenti verdi (aggiungere a `creaFinto` il caso `heart-rate` che restituisce `{ dataPoints: [] }` di default).
- [ ] **Step 2: Esegui** `npm test` → nuovi test FAIL.
- [ ] **Step 3: Implementa** in `fonteGoogleHealth`: dopo `sessioniDa`, per ogni sessione con `fine`, lettura sequenziale di `heart-rate`; campioni mappati in `{ t: p.heartRate.sampleTime.physicalTime, bpm: p.heartRate.beatsPerMinute }`. Un errore `ErroreSync` di `autorizzazione` si propaga; gli altri errori danno `fcSerie: null` e il messaggio. Se un altro tipo è già mancante, `esito` resta `parziale` e il messaggio è quello FC solo se non ce n'è già uno.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(sync): serie FC delle sessioni Google Health`.

### Task 5: Scheda attività (sola lettura)

**Files:**
- Create: `src/ui/cliente/scheda-attivita.js` (sezione `SezioneSessione` e componenti: `Riepilogo`, `ZoneFc`, `GraficoFc`, `Tracciato`, `SplitKm`, `EserciziHevy`)
- Modify: `src/ui/app.js` (`SEZIONI.sessione`; la voce di navigazione attiva resta quella di provenienza: `'oggi'` per cliente, `'dati-cliente'` per trainer)
- Modify: `src/data/store.js` (`COLLEZIONI` + `tracciati`, `parziale.tracciati = perData`)
- Modify: `src/ui/cliente/oggi.js` (righe di Attività recenti con `onClick` → `vai('sessione', { id, da: 'oggi' })`), `src/ui/cliente/giornata.js` (`ColonnaFatto`: ogni `DettaglioSessione` con pulsante "Apri scheda"), `src/ui/trainer/dati.js` (cella Sessioni con pulsante per la prima sessione del giorno, `da: 'dati-cliente'`)
- Modify: `src/ui/stile.css`
- Test: `test/e2e/scheda-attivita.test.js`

**Interfaces:**
- Consumes: `unisciSessioni`, `sessioniValide` (2c-1, Task 3), `statisticheFc`, `fcPerKm` (Task 1), `dati.tracciati`.
- Produces: `vai('sessione', { id: string, da: string })`; `trovaTracciato(sessione, tracciati) → doc | null` esportata da `src/ui/cliente/scheda-attivita.js` (primo `tracciati[idParte]` tra gli id di `sessione.parti`).

- [ ] **Step 1: Scrivi gli E2E** (seme con sessioni, `fcSerie`, tracciato già salvato e parte Hevy):
  - `apertura da Attività recenti` → intestazione con tipo, "mar 4 nov · 07:30" e fonti; "‹ Indietro" torna a Oggi.
  - `palestra con Hevy` → ordine Riepilogo, Esercizi Hevy, Grafico FC, Zone; "1 · 60 kg × 8 · RPE 8"; serie totali e volume.
  - `corsa con tracciato` → ordine Riepilogo, Tracciato, Split, Grafico, Zone; tabella con 8 righe; ultimo split "0,43 km"; km più veloce evidenziato; FC del km mostrata.
  - `sessione senza fcSerie` → grafico "Nessun dato", FC massima "—".
  - `doppioni` → "unite 2 registrazioni".
  - `id inesistente` → "Nessun dato" e "‹ Indietro".
  - `da Dati del cliente` (vista trainer) → apre la scheda.
  - in ogni test: il testo della pagina non contiene `NaN`, `undefined`, `null`.
- [ ] **Step 2: Esegui** `npm run build && node --test --test-concurrency=1 test/e2e/scheda-attivita.test.js` → FAIL.
- [ ] **Step 3: Implementa** la sezione secondo §8 (grafici SVG con `viewBox` e larghezza 100%; tooltip FC con `pointermove` sul tracciato SVG e testo "12′30″ · 148 bpm"; ritmo `m′ss″/km`; distanza con virgola decimale). Distanza e dislivello del riepilogo dal tracciato se presente.
- [ ] **Step 4: Esegui** `npm test && npm run build && npm run test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(ui): scheda attività con riepilogo, FC, tracciato, split ed esercizi Hevy`.

### Task 6: Caricamento del GPX (asset e tracciati)

**Files:**
- Modify: `src/main.js` (`claude.use('assets')` → `asset = { carica(file) → Promise<{ id }>, elimina(id) → Promise<void> } | null` nel contesto)
- Modify: `src/data/store.js` (`salvaTracciato({ idParte, doc })`, `rimuoviTracciato(idParte)`)
- Modify: `src/ui/cliente/scheda-attivita.js` (pulsanti e flusso del §8)
- Modify: `test/support/fake-claude.js` (opzione `assets: true` → `upload` restituisce `{ id: 'a1', url: '/_blob/a1' }` con contatore, `delete` registra la chiamata; `chiamateAsset()`; opzione `assetFallisce`)
- Test: `test/store.test.js`, `test/e2e/scheda-attivita.test.js`, `test/fixtures/esempio.gpx` (corsa sintetica di 8,43 km con `ele` e `time`)

**Interfaces:**
- Consumes: `leggiGpx`, `analizzaGpx`, `sovrapposizione` (Task 2); `trovaTracciato` (Task 5).
- Produces: `store.salvaTracciato({ idParte, doc }) → Promise<void>` (scrive `tracciati/{idParte}` con `caricatoIl` e `autore`); `store.rimuoviTracciato(idParte) → Promise<void>`.

- [ ] **Step 1: Scrivi i test**:
  - `store.test.js`: `salvaTracciato` scrive il documento con `autore` e `caricatoIl`; `rimuoviTracciato` lo cancella; senza utente → `{ codice: 'senza_utente' }`.
  - E2E `carica GPX` (`setInputFiles` con `esempio.gpx`, sessione sovrapposta) → compaiono tracciato e 9 split; il db contiene `tracciati/<idParte>` con `idAsset: 'a1'` e `fonte: 'gpx'`.
  - E2E `sovrapposizione bassa` → dialogo con il testo fisso; "Annulla" non salva né carica asset; "Collega" salva.
  - E2E `file non valido` → messaggio fisso, nessun asset caricato.
  - E2E `file troppo grande` (file di 16 MB generato nel test) → "File troppo grande (massimo 15 MB)", nessun asset caricato.
  - E2E `sostituzione` → nuovo asset `a2`, poi `delete('a1')`, documento aggiornato.
  - E2E `sostituzione fallita` (scrittura db rifiutata dal finto) → `delete('a2')`, il documento resta con `a1`, messaggio "Caricamento non riuscito. Riprova.".
  - E2E `rimozione` → conferma, documento cancellato, `delete('a1')`.
  - E2E `sola lettura` (`puoScrivere: false` oppure `assets` assente) → nessun pulsante di caricamento.
- [ ] **Step 2: Esegui** `npm test` e l'E2E → FAIL.
- [ ] **Step 3: Implementa**. Ordine: lettura file (limite 15 MB) → `leggiGpx` con `DOMParser` → `analizzaGpx` → controllo sovrapposizione (dialogo) → `asset.carica` → `store.salvaTracciato` → (sostituzione) `asset.elimina(vecchio)`. Se `salvaTracciato` fallisce: `asset.elimina(nuovo)` e messaggio.
- [ ] **Step 4: Esegui** `npm test && npm run build && npm run test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(ui): caricamento, sostituzione e rimozione del tracciato GPX`.

### Task 7: Pubblicazione e verifica reale

Nessun codice. Richiede la conferma dell'utente prima di pubblicare.

- [ ] **Step 1:** `npm run build`; leggere la versione pubblicata con `Artifact read` (per intero) e confrontarla con la build del branch precedente.
- [ ] **Step 2:** con conferma dell'utente, pubblicare `dist/pannello.html` sull'artefatto `https://claude.ai/artifact/MdFb5BEz89JBCQ2VRTqEGv` con le capability dei Global Constraints (dichiarazione completa: `db`, `user`, `mcp`, `assets`).
- [ ] **Step 3:** avviare l'attività programmata una volta (`fire_trigger`) e controllare con `ArtifactData get sync/stato` che `fonti.googleHealth.conteggi.fcSessioni` sia > 0.
- [ ] **Step 4:** chiedere all'utente di caricare un GPX vero dalla scheda di una corsa; controllare con `ArtifactData list tracciati` (solo conteggi e nomi dei campi) e rispondere alle verifiche del §12.
