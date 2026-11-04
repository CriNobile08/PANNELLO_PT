# PANNELLO_PT — Scheda attività

- **Data:** 2026-11-04
- **Stato:** bozza da rivedere
- **Dipende da:** [2a — Google Health](2026-11-04-sincronizzazione-google-health-design.md), [2c-1 — Hevy](2026-11-04-sincronizzazione-hevy-design.md)

## 1. Scopo

Una scheda di dettaglio per ogni sessione unita: riepilogo, zone FC, grafico FC, tracciato in SVG, split per km ed esercizi Hevy.

**Criterio di successo:**
1. Da Attività recenti, dalla colonna Fatto e da Dati del cliente si apre la scheda della sessione.
2. Ogni sessione dell'orologio mostra il grafico della FC durante l'allenamento.
3. Caricando un GPX dalla scheda di una corsa o di un trekking compaiono tracciato, profilo altimetrico e split per km con la FC media di ogni km.
4. Una sessione di palestra con Hevy mostra esercizi e serie.
5. Due registrazioni doppie dell'orologio (stessa fonte, quasi stesso intervallo) compaiono come una sola sessione.

## 2. Decisioni prese nel brainstorming

- **Fonte del GPS:** nessuna fonte automatica gratuita. Valutati e scartati per ora: Strava (API e connettore richiedono l'abbonamento dal 2026), tapiriik (non funzionante), OutRun (nessuna API), intervals.icu (non espone i dati arrivati da Strava), Endurain (richiede un server), Apple Salute (nessuna API web; servono app ponte o un'app iPhone propria). **Il tracciato si carica a mano come file GPX dalla scheda della sessione.** Il lettore GPX resta riusabile se in futuro arriverà una fonte automatica.
- **Fonte della FC:** Google Health, tipo `heart-rate`.
- **Collegamento GPX → sessione:** il file si carica dalla scheda della sessione e si collega a quella (con avviso se gli orari non coincidono).
- **Doppioni della stessa fonte:** si fondono se si sovrappongono per almeno l'80% della più corta.

## 3. Esito dello spike (2026-11-04)

Codice usa e getta, non conservato. 8 sessioni dell'orologio negli ultimi 6 giorni.

- `GET users/me/dataTypes/heart-rate/dataPoints` con filtro `heart_rate.sample_time.physical_time >= "<ISO>" AND heart_rate.sample_time.physical_time < "<ISO>"` e `pageSize` 1000 funziona con gli scope attuali.
- Ogni punto: `heartRate { sampleTime { physicalTime, civilTime, utcOffset }, beatsPerMinute }`. Intervallo mediano tra campioni: **2–3 s**. Esempi: 65 min → 1.827 campioni (≈ 590 KB di JSON grezzo); 22 min → 569.
- Le sessioni `exercise` del cliente **non hanno GPS** (`exerciseMetadata.hasGps` assente) né `splits`/`splitSummaries`.
- Trovate due sessioni Google Health sovrapposte e quasi uguali (`WEIGHTS` 65 min e `STRENGTH_TRAINING` 66 min).

## 4. Ambito

**Incluso**
- Serie FC compatta nelle sessioni Google Health (sincronizzazione).
- Fusione dei doppioni della stessa fonte in `unisciSessioni`.
- Lettura e analisi del GPX nel browser; salvataggio del tracciato e del file originale.
- Nuova sezione `sessione` della pagina e collegamenti da Attività recenti, colonna Fatto e Dati del cliente.

**Escluso**
- Caricamento automatico del GPX (Comandi Rapidi, app iPhone, Strava, Endurain, Komoot).
- Mappe con tile; esportazione del GPX dalla pagina.
- FC dai GPX (si usa sempre Google Health).

## 5. Modello dei dati

### 5.1 `sessioni/googleHealth_*` — campo nuovo
```js
fcSerie: { passoSec: 10, inizio: "<ISO = inizio della sessione>", bpm: [112, 118, null, …] } | null
```
- `bpm[i]` = media arrotondata dei campioni con `inizio + i·10 s ≤ t < inizio + (i+1)·10 s`; `null` se il blocco non ha campioni. Lunghezza = `ceil((fine − inizio) / 10 s)`.
- Campioni fuori da `[inizio, fine)` scartati; `beatsPerMinute` come stringa convertito in numero; valori non positivi scartati.
- Lettura fallita per una sessione: `fcSerie: null` e la fonte `googleHealth` diventa `parziale` con messaggio "FC dettagliata non aggiornata"; il resto del documento si salva.

### 5.2 `tracciati/{idParte}`
```js
{ idParte: "googleHealth_…",        // id della parte della sessione a cui è stato collegato
  fonte: "gpx", nomeFile: "corsa.gpx",
  inizio: "<ISO>", fine: "<ISO>",     // primo e ultimo punto con ora
  distanzaM: 7012, dislivelloM: 48 | null, durataSec: 2890, inMovimentoSec: 2805,
  split: [ { km: 1, distanzaM: 1000, durataSec: 352, dislivelloM: 6 | null }, …,
           { km: 8, distanzaM: 12, durataSec: 5, dislivelloM: 0 } ],
  percorso: [[x, y], …],              // ≤ 300 punti, coordinate SVG in una cornice 1000×1000
  segniKm: [[x, y], …],               // posizione di ogni km intero sul percorso
  quote: [[secDaInizio, metri], …] | null,   // ≤ 300 punti per il profilo
  istantiKm: [secDaInizio, …],        // tempo trascorso a ogni km intero (per la FC per km)
  idAsset: "<id asset del GPX originale>",
  caricatoIl: "<ISO>", autore: "<userId>" }
```
- La pagina trova il tracciato di una sessione unita cercando un documento con `idParte` uguale all'id di **una qualsiasi** delle sue parti: il collegamento regge anche se in seguito alla sessione si aggiungono altre fonti.
- Documento sotto i 256 KiB in ogni caso (al massimo ~300 + 300 coppie di numeri più gli split).

### 5.3 Asset
Il GPX originale è un asset dell'artefatto (`capabilities.assets: {}`). Si conserva l'`id`, mai l'URL.

### 5.4 Regole e capability
Regole del database invariate (`[{ path: "", read: "view", write: "interact" }]`). Capability della pagina: quelle attuali più `assets: {}`.

## 6. Regole di calcolo (logica pura, testata)

### 6.1 Fusione dei doppioni (`unisciSessioni`)
- Prima del raggruppamento tra fonti: due parti della **stessa fonte** con sovrapposizione ≥ 80% della durata della più corta si fondono. La fusione è transitiva.
- La parte di riferimento è la più lunga (a parità, la prima per `inizio`); i suoi campi nulli si completano con quelli dell'altra. `id` resta quello della parte di riferimento.
- Le parti originali restano tutte in `parti`. La sessione unita espone `registrazioniUnite` = numero di parti della stessa fonte fuse (≥ 2 solo se c'è stata fusione).
- Il resto del §6.1 del 2a è invariato (fonti diverse ≥ 50%, priorità dei campi).

### 6.2 GPX (`src/logic/gpx.js`)
- **Lettura:** `trk/trkseg/trkpt` di tutti i segmenti, in ordine; `lat`, `lon` obbligatori; `ele` e `time` facoltativi. Servono almeno 2 punti con `time` valido, altrimenti errore `non_valido`. Punti senza `time` scartati.
- **Distanza:** somma delle distanze tra punti consecutivi con la formula dell'emisenoverso (raggio 6.371.000 m). Tra segmenti diversi non si somma.
- **Dislivello positivo:** somma delle salite della quota smussata (media mobile su 5 punti), contando solo variazioni ≥ 1 m rispetto all'ultimo riferimento. `null` se meno del 50% dei punti ha `ele`.
- **Durata:** ultimo `time` − primo `time`. **Tempo in movimento:** somma dei tratti con velocità ≥ 0,5 m/s.
- **Split:** si accumula la distanza; a ogni multiplo di 1000 m il tempo trascorso si ottiene per interpolazione lineare tra i due punti. L'ultimo split è il residuo, se ≥ 10 m.
- **Sfoltimento:** Douglas-Peucker sulle coordinate proiettate, tolleranza crescente finché i punti sono ≤ 300; partenza e arrivo sempre inclusi.
- **Proiezione:** equirettangolare centrata sul centro del percorso (`x = lon·cos(lat0)`, `y = −lat`), scalata per stare in una cornice 1000×1000 con margine 40 e proporzioni mantenute.
- **Sovrapposizione con la sessione:** `sovrapposizione([inizio, fine] GPX, [inizio, fine] sessione) / min(durate)`; sotto 0,5 serve la conferma.

### 6.3 FC (`src/logic/fc.js`)
- `serieFc(campioni, inizio, fine, passoSec = 10)` costruisce `fcSerie` (§5.1). Usata dalla sincronizzazione.
- `statisticheFc(fcSerie)` → `{ media, massima }` sui valori non nulli; `null` se nessun valore.
- `fcPerKm(fcSerie, inizioGpx, istantiKm, durataSec)` → per ogni split la media dei valori di `fcSerie` nel suo intervallo di tempo (allineando `inizioGpx` con `fcSerie.inizio`); `null` dove non ci sono valori o manca `fcSerie`.

## 7. Sincronizzazione

`src/sync/fonti/googleHealth.js`: dopo aver letto le sessioni, per ognuna chiama `client.elenca('heart-rate', filtro, 1000)` sull'intervallo e aggiunge `fcSerie`. Letture in sequenza (al massimo una dozzina per esecuzione). Nessun valore FC nei log; i conteggi della fonte aggiungono `fcSessioni` (sessioni con `fcSerie` non nulla).

## 8. Schermata

Stile del sottoprogetto 1; FC in `#2BC4A6`, allenamento `#5B9BFF`. Grafici in SVG senza librerie, adattati alla larghezza del telefono.

**Intestazione:** "‹ Indietro" (torna alla schermata di provenienza); tipo, nome, data e ora ("mar 4 nov · 07:35"); fonti ("Google Health · Hevy · GPX"); se `registrazioniUnite ≥ 2`, "unite N registrazioni".

**Sezioni** (non compaiono se non hanno dati, salvo il tracciato vuoto per corsa e trekking):
1. **Riepilogo** — durata, FC media, FC massima (da `fcSerie`), calorie; con tracciato o distanza: distanza, ritmo medio (min/km, sul tempo in movimento), dislivello; con Hevy: serie totali e volume. Valori mancanti "—". Con tracciato, distanza e dislivello vengono dal GPX.
2. **Zone FC** — barra divisa in Leggera, Moderata, Intensa, Picco con minuti e percentuale; senza `zoneMin`, "Nessun dato".
3. **Grafico FC** — linea nel tempo, interrotta dove `bpm` è `null`; linee tratteggiate di media e massimo; asse dei minuti e dei bpm; al tocco "12′30″ · 148 bpm".
4. **Tracciato** — percorso, punto di partenza e di arrivo, numerini dei km, profilo altimetrico sotto. Senza GPX: "Carica tracciato GPX" (solo per chi può scrivere e ha gli asset). Con GPX: nome del file, "Sostituisci", "Rimuovi".
5. **Split per km** — tabella km, tempo, ritmo, dislivello, FC media; barre del ritmo con il km più veloce evidenziato; ultimo km parziale con la sua distanza ("0,43 km").
6. **Esercizi Hevy** — per esercizio le serie ("1 · 60 kg × 8 · RPE 8"); riscaldamento in grigio; etichette "cedimento" e "drop"; superserie raggruppate; in fondo serie totali e volume.

**Ordine:** corsa e trekking: 1, 4, 5, 3, 2. Palestra e altri: 1, 6, 3, 2.

**Accesso:** righe di Attività recenti (diventano pulsanti), colonna Fatto della giornata, numero di sessioni nella tabella Dati del cliente (vista trainer).

**Caricamento GPX:** input file `.gpx`; lettura con `DOMParser` come `application/xml`; calcolo (§6.2); se la sovrapposizione è < 0,5, dialogo "Il tracciato non coincide con questa sessione (orari diversi). Collegarlo comunque?"; poi upload dell'asset, scrittura di `tracciati/{idParte}`. "Sostituisci" carica il nuovo e cancella il vecchio asset dopo la scrittura riuscita; "Rimuovi" chiede conferma, cancella il documento e l'asset.

## 9. Errori e casi limite

| Situazione | Comportamento |
|---|---|
| File non GPX, illeggibile o con < 2 punti con ora | "File GPX non valido: servono punti con data e ora". Nulla viene salvato. |
| GPX senza quota (o < 50% dei punti) | `dislivelloM` e `quote` nulli; "—" e niente profilo. |
| Sovrapposizione < 50% | Dialogo di conferma; "Annulla" non salva nulla. |
| File > 15 MB | "File troppo grande (massimo 15 MB)". |
| Upload dell'asset fallito | Nulla salvato; "Caricamento non riuscito. Riprova." |
| Asset caricato ma scrittura del documento fallita | L'asset appena caricato viene cancellato; messaggio d'errore. |
| Utente senza scrittura o senza asset | Pulsanti di caricamento, sostituzione e rimozione assenti. |
| Lettura FC fallita (sincronizzazione) | `fcSerie: null`, fonte `parziale`, sessione salvata. |
| Pause nel GPX | Split sul tempo trascorso; ritmo medio sul tempo in movimento. |
| Id sessione inesistente | "Nessun dato" e pulsante "Indietro". |
| Due parti della stessa fonte sovrapposte ≥ 80% | Una sola sessione, "unite 2 registrazioni". |

## 10. Sicurezza e privacy

- Il GPX contiene posizioni precise: resta nell'artefatto privato (database e asset leggibili solo da chi ha accesso).
- Il GPX si legge come XML con `DOMParser`; nessun contenuto del file finisce nel DOM come HTML; il nome del file è mostrato come testo.
- Nessun valore FC nei log della sincronizzazione.

## 11. Test

- **`gpx`**: `trkpt` con e senza `ele`; più `trkseg`; distanza nota su un percorso artificiale (±0,5%); split con ultimo parziale; dislivello con oscillazioni piccole; pause e tempo in movimento; sfoltimento ≤ 300 punti con partenza e arrivo; proiezione dentro la cornice; file non valido; sovrapposizione.
- **`fc`**: blocchi da 10 s; blocchi vuoti `null`; campioni fuori intervallo; numeri come stringa; `statisticheFc`; `fcPerKm` con e senza `fcSerie`.
- **`sessioni`**: stessa fonte all'80% sì e al 79% no; completamento dei campi; `registrazioniUnite`; unione tra fonti invariata.
- **sincronizzazione**: `fcSerie` nei documenti Google Health; FC fallita → `parziale` con sessione salvata; conteggio `fcSessioni`.
- **E2E** (finto `claude` con asset finti): apertura da Attività recenti; riepilogo, zone, grafico; caricamento GPX → tracciato e split; avviso di sovrapposizione; sostituzione e rimozione; esercizi Hevy; sola lettura senza pulsanti; nessun "NaN", "undefined", "null" nel testo.

## 12. Verifiche all'inizio dell'implementazione

1. La capability `assets` nella pagina pubblicata: upload, lettura tramite `/_blob/<id>`, cancellazione.
2. Un GPX reale del cliente (OutRun, app Fitness esportata o altro): presenza di `time` ed `ele` in ogni punto, dimensione tipica.
