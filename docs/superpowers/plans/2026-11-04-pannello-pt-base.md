# PANNELLO_PT — Base del pannello: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire e pubblicare come artefatto claude.ai il pannello condiviso cliente/trainer: schede di allenamento con revisioni, settimana tipo con versioni ed eccezioni, piano alimentare con versioni, diario del cliente, selettore di vista Cliente/Trainer.

**Architecture:** Un'unica pagina HTML generata da esbuild a partire da moduli ES. La logica di dominio (`src/logic/`) è pura e testata con `node --test`. Il livello dati (`src/data/store.js`) incapsula la capability `db` dell'artefatto e si testa con un finto `window.claude` in memoria. La UI (Preact + htm) si testa end-to-end con Playwright sullo stesso finto `window.claude`.

**Tech Stack:** Node 22, Preact 11.1.1, htm 3.1.1, esbuild 0.28.2, `node:test`, Playwright 1.63 (preinstallato nell'ambiente, non va aggiunto alle dipendenze).

**Spec:** `docs/superpowers/specs/2026-11-04-pannello-pt-base-design.md`. Chi esegue legge sia la specifica sia questo piano. I riferimenti "§n" puntano alla specifica.

## Global Constraints

- Tutte le date di dominio sono stringhe `YYYY-MM-DD` nel fuso `Europe/Rome`; i timestamp sono ISO 8601 (`new Date().toISOString()`).
- `autore`, `creataDa`: sempre l'id restituito da `await user.id()`. I nomi delle persone non vengono mai scritti nel database; si risolvono con `user.profiles(ids)`, con ripiego `"Qualcuno"` se il nome è vuoto.
- Capability pubblicate esattamente così: `{ db: { rules: [ { path: "", read: "view", write: "interact" } ] }, user: { scopes: ["profile"] } }`.
- Nessuna rete in esecuzione, tranne il `<link>` di Google Fonts (Barlow Condensed 500/600/700, Inter 400/500/600). Preact e htm sono inclusi nel bundle.
- Colori: sfondo `#000000`, card `#16171A`, card interne `#0E0F11`, superficie attiva `#2A2B30`, testo `#FFFFFF`, testo secondario `#A0A3AB`, sonno `#E08A4F`, cuore `#2BC4A6`, allenamento `#5B9BFF`, avviso `#F2A774`. Raggio card 18–20 px. Target di tocco ≥ 44 px. Layout telefono sotto i 900 px, layout PC da 900 px in su.
- Memoria del browser solo per la vista scelta, chiave `pannello.vista`; ogni accesso dentro `try/catch`.
- Scritture: un `set`/`update` alla volta per documento, solo in risposta a un'azione dell'utente, mai da render o da callback di snapshot.
- Interfaccia in italiano. Le stringhe che la specifica fissa vanno usate alla lettera: "Impossibile caricare i dati", "Riprova", "Nessun dato", "Crea la prima settimana tipo", "Il trainer non ha ancora preparato il programma", "Crea il piano alimentare", "Nessun piano alimentare", "In arrivo", "In programma dal …", "Segna come fatta", "Come ti sei sentito?", "Solo questa settimana", "Da una data in poi", "Modifica solo questa settimana", "Nuova versione da una data…", "Salva come nuova versione da…", "+ Assegna scheda", "+ Nuova scheda", "+ Aggiungi alimento", "+ Aggiungi pasto", "Puoi solo leggere: chiedi al proprietario di invitarti come Editor".
- Mai numeri di esempio nella UI: dove manca un dato si scrive "Nessun dato".
- Comandi: `npm test` (logica e store), `npm run test:e2e` (UI, richiede `npm run build` prima), `npm run build` (produce `dist/pannello.html`).

## Review Focus

1. **Numeri scritti con la virgola** ("60,5" g, "22,5" kg): un utente italiano li scrive così; devono essere accettati come 60.5 e 22.5, non segnalati come errore. → Task 4, `numeroDaInput`.
2. **`user.id()` restituisce `null`** (sessione senza identità): nessuna scrittura deve partire con `autore: null`; il salvataggio fallisce con "Accedi a Claude per salvare." → Task 6.
3. **Giorno passato assegnato a una scheda creata dopo quel giorno** (la versione della settimana è vecchia, la prima revisione della scheda è più recente): il giorno deve mostrare la revisione più vecchia disponibile, non un vuoto. → Task 2, `revisionePerGiorno`.
4. **Spunte del diario su esercizi che non esistono più** (il trainer accorcia la scheda dopo che il cliente ha spuntato): gli indici fuori intervallo vanno ignorati; il blocco è completo solo se sono spuntati tutti gli esercizi attuali. → Task 5, `statoBlocchi`.
5. **Memoria del browser non disponibile** (finestra privata, accesso che lancia eccezione): la pagina si apre comunque, nella vista iniziale. → Task 5, `vistaIniziale`.

---

## Struttura dei file

```
package.json
scripts/build.js                 src → dist/pannello.html
scripts/screenshot.js            screenshot 390/1440 px con dati finti
src/template.html                scheletro HTML con segnaposto <!--STILE--> e <!--SCRIPT-->
src/main.js                      avvio: capability, timeout 10 s, store, render
src/logic/date.js                date Europe/Rome, settimane, formattazione
src/logic/versioni.js            versione valida per data, revisioni, numerazione
src/logic/risoluzione.js         cosa c'è in un giorno, spostamenti, usi di una scheda
src/logic/validazione.js         numeri da input, controlli di schede e piani
src/logic/completamento.js       blocchi completati
src/logic/vista.js               vista iniziale e sua memoria
src/data/store.js                letture in tempo reale e scritture sul db
src/data/errori.js               messaggi per gli errori di scrittura
src/ui/stile.css                 token e classi
src/ui/html.js                   html = htm.bind(h), re-export degli hook
src/ui/contesto.js               contesto Preact: dati, store, vista, permessi, nomi
src/ui/componenti.js             Anello, Dialogo, Campo, SelettoreData, Vuoto, Avviso
src/ui/app.js                    intestazione, selettore vista, navigazione, guardia modifiche
src/ui/trainer/schede.js         libreria, editor scheda, revisioni, archiviazione
src/ui/trainer/settimana.js      settimana tipo, eccezioni, versioni, "Come sta"
src/ui/trainer/alimentazione.js  editor del piano alimentare
src/ui/cliente/oggi.js           Home "Oggi"
src/ui/cliente/giornata.js       dettaglio giornata e diario
src/ui/cliente/allenamento.js    settimana corrente per il cliente
src/ui/cliente/alimentazione.js  piano del giorno in lettura
test/*.test.js                   unit test (node --test)
test/support/fake-claude.js      finto window.claude (script classico, assegna globalThis.creaFakeClaude)
test/support/apri.js             apre dist/pannello.html in Playwright con il finto claude
test/e2e/*.test.js               test UI
docs/prova-finale.md             checklist per cliente e trainer
```

---

### Task 1: Progetto e date

**Files:**
- Create: `package.json`, `.gitignore`, `src/logic/date.js`
- Test: `test/date.test.js`

**Interfaces:**
- Produces (`src/logic/date.js`):
  - `GIORNI = ['lun','mar','mer','gio','ven','sab','dom']`
  - `oggiRoma(adesso: Date = new Date()): string`
  - `oraRoma(iso: string): string`: `"HH:MM"` nel fuso di Roma
  - `giornoSettimana(data: string): 'lun'|'mar'|'mer'|'gio'|'ven'|'sab'|'dom'`
  - `aggiungiGiorni(data: string, n: number): string`
  - `lunediDi(data: string): string`
  - `giorniDellaSettimana(lunedi: string): string[]` (7 date)
  - `formatoData(data: string): string` (`"mer 4 nov"`), `formatoDataLunga(data: string): string` (`"mercoledì 4 novembre"`)

- [ ] **Step 1: Crea `package.json` e `.gitignore`**

`package.json`: `"type": "module"`, `"private": true`, `"engines": {"node": ">=22"}`, scripts `test` = `node --test test/*.test.js`, `test:e2e` = `node --test --test-concurrency=1 test/e2e/*.test.js`, `build` = `node scripts/build.js`. Dependencies `preact` `11.1.1` e `htm` `3.1.1`, devDependency `esbuild` `0.28.2`: versioni esatte, senza `^`. `.gitignore`: `node_modules/`, `dist/`, `screenshots/`. Poi `npm install`.

- [ ] **Step 2: Scrivi i test che falliscono** in `test/date.test.js`

```js
assert.equal(oggiRoma(new Date('2026-03-28T23:30:00Z')), '2026-03-29'); // ora solare, 00:30 a Roma
assert.equal(oggiRoma(new Date('2026-10-24T22:30:00Z')), '2026-10-25'); // ora legale, 00:30 a Roma
assert.equal(oggiRoma(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
assert.equal(oggiRoma(new Date('2026-11-04T22:59:00Z')), '2026-11-04');
assert.equal(oraRoma('2026-11-04T17:42:00Z'), '18:42');
assert.equal(oraRoma('2026-07-01T16:42:00Z'), '18:42');
assert.equal(aggiungiGiorni('2026-03-28', 1), '2026-03-29');
assert.equal(aggiungiGiorni('2026-03-29', 1), '2026-03-30');
assert.equal(aggiungiGiorni('2026-12-31', 1), '2027-01-01');
assert.equal(aggiungiGiorni('2026-11-02', -1), '2026-11-01');
assert.equal(giornoSettimana('2026-11-04'), 'mer');
assert.equal(giornoSettimana('2027-01-03'), 'dom');
assert.equal(lunediDi('2027-01-01'), '2026-12-28');
assert.equal(lunediDi('2026-11-02'), '2026-11-02');
assert.equal(lunediDi('2026-11-08'), '2026-11-02');
assert.deepEqual(giorniDellaSettimana('2026-12-28'),
  ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
assert.equal(formatoData('2026-11-04'), 'mer 4 nov');
assert.equal(formatoDataLunga('2026-11-04'), 'mercoledì 4 novembre');
```

- [ ] **Step 3: Esegui e verifica che falliscano**

Run: `npm test` · Expected: FAIL (modulo `src/logic/date.js` non trovato).

- [ ] **Step 4: Implementa `src/logic/date.js`**

`oggiRoma` e `oraRoma` usano `Intl.DateTimeFormat` con `timeZone: 'Europe/Rome'` (per `oggiRoma`, locale `en-CA`, che produce `YYYY-MM-DD`). L'aritmetica sulle date `YYYY-MM-DD` usa `Date.UTC`, così non risente dell'ora legale. I nomi di giorni e mesi italiani sono array fissi, non `Intl`.

- [ ] **Step 5: Esegui e verifica che passino**

Run: `npm test` · Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore src/logic/date.js test/date.test.js
git commit -m "feat: project setup and Europe/Rome date helpers"
```

---

### Task 2: Versioni e revisioni

**Files:**
- Create: `src/logic/versioni.js`
- Test: `test/versioni.test.js`

**Interfaces:**
- Produces:
  - `versioneValida(versioni: Array<{validaDal: string, creataIl?: string, salvataIl?: string}>, data: string): object|null`: l'elemento con il `validaDal` più alto ≤ `data`; a parità di `validaDal`, il più recente per `salvataIl ?? creataIl`.
  - `versioniFuture(versioni, oggi: string): object[]`: `validaDal > oggi`, in ordine crescente di `validaDal`.
  - `revisionePerGiorno(revisioni, data: string): object|null`: `versioneValida(revisioni, data)`; se è `null` e ci sono revisioni, restituisce quella con il `validaDal` più basso (Review Focus 3).
  - `prossimoNumero(versioni: Array<{numero: number}>): number`

- [ ] **Step 1: Scrivi i test che falliscono**

```js
const v1 = { id: 'v1', numero: 1, validaDal: '2026-10-05', creataIl: '2026-10-04T10:00:00Z' };
const v2 = { id: 'v2', numero: 2, validaDal: '2026-10-26', creataIl: '2026-10-25T10:00:00Z' };
const v3 = { id: 'v3', numero: 3, validaDal: '2026-11-16', creataIl: '2026-11-03T10:00:00Z' };
const tutte = [v3, v1, v2];
assert.equal(versioneValida(tutte, '2026-11-04'), v2);
assert.equal(versioneValida(tutte, '2026-10-26'), v2);
assert.equal(versioneValida(tutte, '2026-10-25'), v1);
assert.equal(versioneValida(tutte, '2026-10-01'), null);
assert.equal(versioneValida([], '2026-11-04'), null);
const a = { validaDal: '2026-11-04', salvataIl: '2026-11-04T08:00:00Z' };
const b = { validaDal: '2026-11-04', salvataIl: '2026-11-04T09:00:00Z' };
assert.equal(versioneValida([b, a], '2026-11-04'), b);
assert.deepEqual(versioniFuture(tutte, '2026-11-04'), [v3]);
const r = { validaDal: '2026-11-04', salvataIl: '2026-11-04T08:00:00Z' };
assert.equal(revisionePerGiorno([r], '2026-11-02'), r);   // Review Focus 3
assert.equal(revisionePerGiorno([], '2026-11-02'), null);
assert.equal(prossimoNumero([]), 1);
assert.equal(prossimoNumero([{ numero: 3 }, { numero: 1 }]), 4);
```

- [ ] **Step 2: Esegui e verifica che falliscano** · Run: `npm test` · Expected: FAIL su `versioni.test.js`.
- [ ] **Step 3: Implementa `src/logic/versioni.js`** con le firme sopra. Le date `YYYY-MM-DD` e i timestamp ISO si confrontano come stringhe.
- [ ] **Step 4: Esegui e verifica che passino** · Run: `npm test` · Expected: PASS.
- [ ] **Step 5: Commit** · `git add src/logic/versioni.js test/versioni.test.js && git commit -m "feat: date-based version resolution"`

---

### Task 3: Cosa c'è in un giorno

**Files:**
- Create: `src/logic/risoluzione.js`
- Test: `test/risoluzione.test.js`

**Interfaces:**
- Consumes: `versioneValida`, `versioniFuture` (Task 2); `giornoSettimana`, `giorniDellaSettimana` (Task 1).
- Produces:
  - `risolviGiorno(data: string, { settimane: object[], eccezioni: Record<string, object> }): { data, schedaId: string|null, fonte: 'eccezione'|'settimana'|'nessuna', eccezione: object|null, versione: object|null }`
  - `risolviSettimana(lunedi: string, dati): Array<ReturnType<risolviGiorno> & { giorno: string }>`
  - `eccezioniSpostamento(da: string, a: string, schedaId: string|null): Array<{ data: string, doc: { schedaId: string|null, origine: string|null } }>`
  - `usiScheda(schedaId: string, { settimane, eccezioni }, oggi: string): Array<{ tipo: 'settimana', versione: object } | { tipo: 'eccezione', data: string }>`: la versione in vigore oggi se usa la scheda, le versioni future che la usano, le eccezioni con `data >= oggi` che la usano.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
const giorni = (o) => ({ lun: null, mar: null, mer: null, gio: null, ven: null, sab: null, dom: null, ...o });
const v1 = { id: 'v1', numero: 1, validaDal: '2026-10-05', creataIl: '2026-10-04T10:00:00Z', giorni: giorni({ sab: 'trek' }) };
const v2 = { id: 'v2', numero: 2, validaDal: '2026-10-26', creataIl: '2026-10-25T10:00:00Z',
  giorni: giorni({ lun: 'gambe', mar: 'corsa', mer: 'spinta', ven: 'tirata' }) };
const v3 = { id: 'v3', numero: 3, validaDal: '2026-11-16', creataIl: '2026-11-03T10:00:00Z', giorni: giorni({ mer: 'gambe' }) };
const eccezioni = {
  '2026-11-05': { schedaId: 'tirata', origine: '2026-11-06' },
  '2026-11-06': { schedaId: null, origine: null },
};
const dati = { settimane: [v1, v2, v3], eccezioni };
assert.partialDeepStrictEqual(risolviGiorno('2026-11-04', dati), { schedaId: 'spinta', fonte: 'settimana', versione: v2 });
assert.partialDeepStrictEqual(risolviGiorno('2026-11-05', dati), { schedaId: 'tirata', fonte: 'eccezione' });
assert.partialDeepStrictEqual(risolviGiorno('2026-11-06', dati), { schedaId: null, fonte: 'eccezione' });
assert.partialDeepStrictEqual(risolviGiorno('2026-10-01', dati), { schedaId: null, fonte: 'nessuna' });
assert.equal(risolviGiorno('2026-11-11', dati).schedaId, 'spinta');
assert.equal(risolviGiorno('2026-11-18', dati).schedaId, 'gambe');
assert.equal(risolviSettimana('2026-11-02', dati).length, 7);
assert.equal(risolviSettimana('2026-11-02', dati)[3].giorno, 'gio');
assert.deepEqual(eccezioniSpostamento('2026-11-06', '2026-11-05', 'tirata'), [
  { data: '2026-11-05', doc: { schedaId: 'tirata', origine: '2026-11-06' } },
  { data: '2026-11-06', doc: { schedaId: null, origine: null } },
]);
assert.deepEqual(usiScheda('trek', dati, '2026-11-04'), []);   // solo una versione superata
assert.deepEqual(usiScheda('spinta', dati, '2026-11-04'), [{ tipo: 'settimana', versione: v2 }]);
assert.deepEqual(usiScheda('gambe', dati, '2026-11-04'),
  [{ tipo: 'settimana', versione: v2 }, { tipo: 'settimana', versione: v3 }]);
assert.deepEqual(usiScheda('tirata', { settimane: [], eccezioni: { '2026-11-03': { schedaId: 'tirata' }, '2026-11-04': { schedaId: 'tirata' } } }, '2026-11-04'),
  [{ tipo: 'eccezione', data: '2026-11-04' }]);
```

- [ ] **Step 2: Esegui e verifica che falliscano** · Run: `npm test` · Expected: FAIL su `risoluzione.test.js`.
- [ ] **Step 3: Implementa `src/logic/risoluzione.js`** con le firme sopra (ordine di §6: eccezione, poi versione valida, poi nessuna).
- [ ] **Step 4: Esegui e verifica che passino** · Run: `npm test` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: day resolution, moves and scheda usage"` (con `git add` dei due file).

---

### Task 4: Validazione

**Files:**
- Create: `src/logic/validazione.js`
- Test: `test/validazione.test.js`

**Interfaces:**
- Produces:
  - `MESSAGGI = { obbligatorio: 'Campo obbligatorio', intero: 'Inserisci un numero intero maggiore di 0', positivo: 'Inserisci un numero maggiore di 0', nonNegativo: 'Inserisci un numero maggiore o uguale a 0' }`
  - `numeroDaInput(testo: string|number|null): number|null`: elimina gli spazi, sostituisce `,` con `.`; restituisce `null` se il testo è vuoto o non è un numero.
  - `validaScheda(scheda: { nome, tipo }, revisione): Array<{ campo: string, messaggio: string }>`
  - `validaPiano(piano: { indicazioni, pasti }): Array<{ campo, messaggio }>`
- I campi seguono il percorso nell'oggetto: `nome`, `principale.0.serie`, `riscaldamento.1.nome`, `obiettivo.descrizione`, `pasti.0.opzioni.1.alimenti.2.grammi`.
- Regole:
  - Nome della scheda: obbligatorio.
  - `riscaldamento`/`stretching`: `nome` obbligatorio; `durataSec`, `serie`, `ripetizioni` devono essere `null` oppure interi > 0.
  - `principale` (tipo palestra/altro): `nome` obbligatorio; `serie` e `ripetizioni` interi > 0; `caricoKg` `null` oppure ≥ 0; `recuperoSec` `null` oppure intero > 0.
  - `obiettivo` (tipo corsa/trekking): `descrizione` obbligatoria; `distanzaKm` `null` oppure > 0; `dislivelloM` `null` oppure ≥ 0.
  - Piano: nome di pasto, opzione e alimento obbligatori; `grammi` > 0.
  - "Obbligatorio" significa che il testo, tolti gli spazi, non è vuoto.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
assert.equal(numeroDaInput('60,5'), 60.5);          // Review Focus 1
assert.equal(numeroDaInput(' 22,5 '), 22.5);
assert.equal(numeroDaInput('80'), 80);
assert.equal(numeroDaInput(''), null);
assert.equal(numeroDaInput('abc'), null);
const es = (o) => ({ nome: 'Panca', serie: 4, ripetizioni: 6, caricoKg: 80, recuperoSec: 150, nota: '', hevyTemplateId: null, ...o });
const rev = (o) => ({ riscaldamento: [], principale: [es()], stretching: [], obiettivo: null, nota: '', durataStimataMin: 60, ...o });
assert.deepEqual(validaScheda({ nome: 'Spinta A', tipo: 'palestra' }, rev()), []);
assert.deepEqual(validaScheda({ nome: '  ', tipo: 'palestra' }, rev()), [{ campo: 'nome', messaggio: 'Campo obbligatorio' }]);
assert.deepEqual(validaScheda({ nome: 'X', tipo: 'palestra' }, rev({ principale: [es({ serie: 2.5 })] })),
  [{ campo: 'principale.0.serie', messaggio: 'Inserisci un numero intero maggiore di 0' }]);
assert.deepEqual(validaScheda({ nome: 'X', tipo: 'palestra' }, rev({ principale: [es({ ripetizioni: 0 })] })),
  [{ campo: 'principale.0.ripetizioni', messaggio: 'Inserisci un numero intero maggiore di 0' }]);
assert.deepEqual(validaScheda({ nome: 'X', tipo: 'palestra' }, rev({ riscaldamento: [{ nome: '', durataSec: 300, serie: null, ripetizioni: null, perLato: false, nota: '' }] })),
  [{ campo: 'riscaldamento.0.nome', messaggio: 'Campo obbligatorio' }]);
assert.deepEqual(validaScheda({ nome: 'Corsa', tipo: 'corsa' }, rev({ principale: [], obiettivo: { descrizione: '', distanzaKm: 8, dislivelloM: null } })),
  [{ campo: 'obiettivo.descrizione', messaggio: 'Campo obbligatorio' }]);
const piano = { indicazioni: '', pasti: [{ nome: 'Colazione', opzioni: [{ nome: 'Opzione 1', nota: '', alimenti: [{ nome: 'Avena', grammi: 60 }] }] }] };
assert.deepEqual(validaPiano(piano), []);
piano.pasti[0].opzioni[0].alimenti[0].grammi = 0;
assert.deepEqual(validaPiano(piano), [{ campo: 'pasti.0.opzioni.0.alimenti.0.grammi', messaggio: 'Inserisci un numero maggiore di 0' }]);
```

- [ ] **Step 2: Esegui e verifica che falliscano** · Run: `npm test` · Expected: FAIL su `validazione.test.js`.
- [ ] **Step 3: Implementa `src/logic/validazione.js`** con le firme e le regole sopra.
- [ ] **Step 4: Esegui e verifica che passino** · Run: `npm test` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: field validation for schede and meal plans"`

---

### Task 5: Completamento e vista iniziale

**Files:**
- Create: `src/logic/completamento.js`, `src/logic/vista.js`
- Test: `test/completamento.test.js`, `test/vista.test.js`

**Interfaces:**
- Produces:
  - `statoBlocchi(revisione: object|null, voce: object|undefined): { riscaldamento: boolean, principale: boolean, stretching: boolean, completati: number }`
    - Un blocco di esercizi è completo quando ogni indice `0..n-1` compare nell'array `…Fatti`. Gli indici fuori intervallo si ignorano.
    - Un blocco con 0 esercizi conta come completo.
    - `principale` è vero solo se `voce?.principaleFatto === true`, per ogni tipo di scheda.
    - Se `revisione` è `null` (riposo), restituisce tutti `false` e `completati: 0`.
  - `CHIAVE_VISTA = 'pannello.vista'`
  - `vistaIniziale({ isOwner: boolean, storage: Storage|null }): 'cliente'|'trainer'`: se nella memoria c'è un valore valido usa quello; altrimenti `isOwner ? 'cliente' : 'trainer'`. Le eccezioni vengono ignorate.
  - `salvaVista(storage: Storage|null, vista: 'cliente'|'trainer'): void`: non lancia mai eccezioni.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
const E = (nome) => ({ nome, durataSec: 60, serie: null, ripetizioni: null, perLato: false, nota: '' });
const rev = { riscaldamento: [E('a'), E('b'), E('c')], principale: [], stretching: [E('x'), E('y')] };
assert.deepEqual(statoBlocchi(rev, undefined), { riscaldamento: false, principale: false, stretching: false, completati: 0 });
assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [0, 1, 2] }).completati, 1);
assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [0, 1, 5] }).riscaldamento, false);      // Review Focus 4
assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [2, 0, 1, 7] }).riscaldamento, true);
assert.equal(statoBlocchi({ ...rev, stretching: [] }, {}).stretching, true);
assert.equal(statoBlocchi(rev, { riscaldamentoFatti: [0,1,2], stretchingFatti: [0,1], principaleFatto: true }).completati, 3);
assert.equal(statoBlocchi(null, { principaleFatto: true }).completati, 0);

const mem = (iniziale) => { const m = new Map(Object.entries(iniziale)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const rotta = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
assert.equal(vistaIniziale({ isOwner: true, storage: null }), 'cliente');
assert.equal(vistaIniziale({ isOwner: false, storage: null }), 'trainer');
assert.equal(vistaIniziale({ isOwner: true, storage: rotta }), 'cliente');               // Review Focus 5
assert.equal(vistaIniziale({ isOwner: true, storage: mem({ 'pannello.vista': 'trainer' }) }), 'trainer');
assert.equal(vistaIniziale({ isOwner: false, storage: mem({ 'pannello.vista': 'boh' }) }), 'trainer');
assert.doesNotThrow(() => salvaVista(rotta, 'cliente'));
const m = mem({}); salvaVista(m, 'trainer'); assert.equal(m.getItem('pannello.vista'), 'trainer');
```

- [ ] **Step 2: Esegui e verifica che falliscano** · Run: `npm test` · Expected: FAIL sui due file nuovi.
- [ ] **Step 3: Implementa** `src/logic/completamento.js` e `src/logic/vista.js` con le firme sopra.
- [ ] **Step 4: Esegui e verifica che passino** · Run: `npm test` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: block completion and initial view logic"`

---

### Task 6: Finto `window.claude`, store ed errori

**Files:**
- Create: `test/support/fake-claude.js`, `src/data/store.js`, `src/data/errori.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces (`test/support/fake-claude.js`): uno **script classico**, senza `import`/`export`, che assegna `globalThis.creaFakeClaude`. Si carica nei test Node con `import '../test/support/fake-claude.js'` e nel browser con `page.addInitScript({ path })`.
  - `creaFakeClaude({ isOwner = true, puoScrivere = true, userId = 'u-cliente', profili = {}, seme = {} }) → { use(nome): Promise<db|user|null>, dump(): Record<string, object> }`
  - `seme` è una mappa da percorso del documento a dati: `{ 'schede/s1': {...}, 'schede/s1/revisioni/r1': {...} }`.
  - Il db implementa il sottoinsieme di `db.d.ts` usato dallo store: `doc(path)`, `collection(path)`, `ref.get/set/update/delete/onSnapshot`, `collection.doc(id?)`, `collection.add`, `collection.onSnapshot`, `docRef.collection(path)`. Gli snapshot partono in modo asincrono (`setTimeout(0)`) e alla prima sottoscrizione e dopo ogni scrittura. `id` generati con un contatore.
  - Se `puoScrivere` è falso, ogni scrittura rifiuta con `{ code: 'invalid_argument', message: 'write below minimum level' }`.
  - User: `id()` → `userId` (può essere `null`); `isOwner()`; `can('data.write')` → `puoScrivere`; `profiles(ids)` → `{ [id]: { id, name: profili[id] ?? '' } }`.
- Produces (`src/data/store.js`):
  - `creaStore({ db, autoreId: string|null, adesso = () => new Date() })` → oggetto con i metodi:
    - `osserva(onDati: (dati: Dati) => void, onErrore: (e) => void): () => void`. Emette solo dopo il primo snapshot di tutte e cinque le collezioni di primo livello (`schede`, `settimane`, `eccezioni`, `alimentazione`, `diario`). Si iscrive a `schede/{id}/revisioni` per ogni scheda presente e chiude le iscrizioni delle schede sparite.
    - `salvaScheda({ schedaId: string|null, nome, tipo, contenuto, revisioneAttesa: string|null, forza = false }): Promise<{ esito: 'ok', schedaId, revId } | { esito: 'conflitto', revisione: object }>`. `contenuto` contiene i campi di revisione di §5.2, escluse le chiavi di sistema.
    - `archiviaScheda(schedaId): Promise<{ esito: 'ok' } | { esito: 'in_uso', usi }>`
    - `salvaSettimana({ giorni, validaDal }): Promise<string>`
    - `impostaEccezione(data, schedaId: string|null): Promise<void>`
    - `spostaGiorno(da, a): Promise<void>`
    - `annullaEccezione(data): Promise<void>`
    - `salvaPiano({ indicazioni, pasti, validaDal }): Promise<string>`
    - `aggiornaDiario(data, modifiche: object): Promise<void>`
  - `Dati = { schede: Record<id, scheda & {id}>, revisioni: Record<schedaId, Array<rev & {id}>>, settimane: Array<v & {id}>, eccezioni: Record<data, e>, alimentazione: Array<p & {id}>, diario: Record<data, voce> }`
  - Ogni scrittura aggiunge `autore` (o `creataDa`) e il timestamp. `validaDal` delle revisioni è `oggiRoma(adesso())`. `numero` viene da `prossimoNumero`.
  - Se `autoreId` è `null`, ogni scrittura rifiuta con `{ codice: 'senza_utente' }` prima di toccare il db (Review Focus 2).
  - `salvaScheda` e `salvaPiano` rifiutano con `{ codice: 'non_valido', errori }` se la validazione (Task 4) trova errori.
- Produces (`src/data/errori.js`):
  - `messaggioErrore(e): string`
    - `senza_utente` → "Accedi a Claude per salvare."
    - `invalid_argument` → "Puoi solo leggere: chiedi al proprietario di invitarti come Editor"
    - `revoked` → "Accesso al pannello revocato."
    - altri → "Salvataggio non riuscito. Riprova."
  - `eRifiutoPermessi(e): boolean` (`e?.code === 'invalid_argument'`)

**Algoritmo di `salvaScheda`** (vincolato da §8, conflitti):
1. Se `schedaId` è `null`: crea un nuovo id con `collection('schede').doc()` e fai `set` del documento scheda (`nome, tipo, archiviata: false, revisioneCorrente: null, creataDa, creataIl`).
2. Altrimenti fai `get` della scheda. Se `revisioneCorrente !== revisioneAttesa` e `!forza`, restituisci `{ esito: 'conflitto', revisione }`, dove `revisione` è il documento della revisione corrente (con `autore` e `salvataIl`).
3. `add` della revisione in `schede/{id}/revisioni`.
4. `update` della scheda con `{ nome, tipo, revisioneCorrente: revId }`.

**`spostaGiorno(da, a)`:** calcola `schedaId` con `risolviGiorno(da, datiCorrenti)` e scrive le due eccezioni di `eccezioniSpostamento`, una dopo l'altra (prima `a`, poi `da`).

- [ ] **Step 1: Scrivi i test che falliscono** in `test/store.test.js`. Usa `creaFakeClaude`, `adesso = () => new Date('2026-11-04T09:00:00Z')` e questi helper del file di test:
  - `primiDati(store)`: risolve la Promise al primo `onDati`;
  - `CONTENUTO_VALIDO`: revisione palestra con un esercizio principale valido;
  - `G`: oggetto `giorni` con tutti i valori `null`;
  - `argomenti`: gli stessi argomenti del secondo `salvaScheda`;
  - `pick(o, chiavi)`;
  - `storeLettore`: uno store su un fake con `puoScrivere: false`.

  Il seme contiene la scheda `tirata` (con una revisione) e una settimana con `validaDal: '2026-10-26'` e `ven: 'tirata'`.

```js
// nuova scheda: revisione con validaDal di Roma, autore e revisioneCorrente impostati
const r = await store.salvaScheda({ schedaId: null, nome: 'Spinta A', tipo: 'palestra', contenuto: CONTENUTO_VALIDO, revisioneAttesa: null });
assert.equal(r.esito, 'ok');
const d = fake.dump();
assert.equal(d[`schede/${r.schedaId}`].revisioneCorrente, r.revId);
assert.equal(d[`schede/${r.schedaId}/revisioni/${r.revId}`].validaDal, '2026-11-04');
assert.equal(d[`schede/${r.schedaId}/revisioni/${r.revId}`].autore, 'u-cliente');
// conflitto: salvataggio con revisione attesa vecchia
const r2 = await store.salvaScheda({ schedaId: r.schedaId, nome: 'Spinta A', tipo: 'palestra', contenuto: CONTENUTO_VALIDO, revisioneAttesa: 'vecchia' });
assert.equal(r2.esito, 'conflitto');
assert.equal(r2.revisione.autore, 'u-cliente');
// forza sovrascrive
assert.equal((await store.salvaScheda({ ...argomenti, revisioneAttesa: 'vecchia', forza: true })).esito, 'ok');
// numerazione delle settimane
await store.salvaSettimana({ giorni: G, validaDal: '2026-11-09' });
await store.salvaSettimana({ giorni: G, validaDal: '2026-11-16' });
assert.deepEqual(Object.entries(fake.dump()).filter(([p]) => p.startsWith('settimane/')).map(([, v]) => v.numero).sort(), [1, 2]);
// spostamento: due eccezioni
await store.spostaGiorno('2026-11-06', '2026-11-05');   // con seme: settimana con ven = 'tirata'
assert.deepEqual(pick(fake.dump()['eccezioni/2026-11-05'], ['schedaId', 'origine']), { schedaId: 'tirata', origine: '2026-11-06' });
assert.deepEqual(pick(fake.dump()['eccezioni/2026-11-06'], ['schedaId', 'origine']), { schedaId: null, origine: null });
// archiviazione bloccata se in uso
assert.equal((await store.archiviaScheda('tirata')).esito, 'in_uso');
// diario: merge, non sostituzione
await store.aggiornaDiario('2026-11-04', { sensazione: 4 });
await store.aggiornaDiario('2026-11-04', { nota: 'ok' });
assert.partialDeepStrictEqual(fake.dump()['diario/2026-11-04'], { sensazione: 4, nota: 'ok' });
// utente senza id (Review Focus 2)
const storeAnonimo = creaStore({ db, autoreId: null, adesso });
await assert.rejects(storeAnonimo.aggiornaDiario('2026-11-04', { nota: 'x' }), { codice: 'senza_utente' });
// permessi insufficienti
await assert.rejects(storeLettore.salvaSettimana({ giorni: G, validaDal: '2026-11-09' }), { code: 'invalid_argument' });
assert.equal(messaggioErrore({ code: 'invalid_argument' }), 'Puoi solo leggere: chiedi al proprietario di invitarti come Editor');
// validazione
await assert.rejects(store.salvaPiano({ indicazioni: '', pasti: [{ nome: '', opzioni: [] }], validaDal: '2026-11-04' }), { codice: 'non_valido' });
// osserva: prima emissione con tutte le collezioni e le revisioni
const dati = await primiDati(store);
assert.ok(Array.isArray(dati.revisioni[r.schedaId]));
```

- [ ] **Step 2: Esegui e verifica che falliscano** · Run: `npm test` · Expected: FAIL su `store.test.js`.
- [ ] **Step 3: Implementa** `test/support/fake-claude.js`, `src/data/errori.js` e `src/data/store.js` con le interfacce sopra.
- [ ] **Step 4: Esegui e verifica che passino** · Run: `npm test` · Expected: PASS (tutti i file).
- [ ] **Step 5: Commit** · `git commit -m "feat: db store with revisions, versions, exceptions and diary"`

---

### Task 7: Build, avvio e guscio dell'app

**Files:**
- Create: `scripts/build.js`, `src/template.html`, `src/main.js`, `src/ui/stile.css`, `src/ui/html.js`, `src/ui/contesto.js`, `src/ui/componenti.js`, `src/ui/app.js`, `test/support/apri.js`
- Test: `test/build.test.js`, `test/e2e/guscio.test.js`

**Interfaces:**
- Consumes: `creaStore`, `messaggioErrore`, `eRifiutoPermessi` (Task 6); `vistaIniziale`, `salvaVista` (Task 5); `oggiRoma` (Task 1).
- Produces:
  - `scripts/build.js`: bundle esbuild di `src/main.js` (`bundle`, `format: 'iife'`, `minify`, `write: false`). Sostituisci `</script` con `<\/script` nel risultato. Inserisci CSS e JS in `src/template.html` al posto di `<!--STILE-->` e `<!--SCRIPT-->`. Scrivi `dist/pannello.html`.
  - `src/template.html`: `<title>Pannello PT</title>`, meta viewport, `<link>` di Google Fonts, `<div id="app"></div>`.
  - `src/ui/html.js`: `export const html = htm.bind(h)` e re-export di `useState`, `useEffect`, `useMemo`, `useContext`, `useRef` da `preact/hooks`.
  - `src/ui/contesto.js`: `Contesto` (createContext) con valore `{ dati: Dati, store, oggi: string, vista, setVista, puoScrivere: boolean, segnalaRifiuto(e), nomi: (ids: string[]) => Record<id, string>, sezione, vai(sezione, parametri?), parametri, setSporco(bool) }`.
  - `src/ui/componenti.js`:
    - `Anello({ valore: number|null, massimo: number, colore, etichetta, testo, sottotesto })`
    - `Dialogo({ titolo, children, azioni: Array<{ testo, primaria?, onClick }> })`
    - `Campo({ etichetta, errore?, children })`: imposta `aria-invalid` e mostra il messaggio sotto il campo.
    - `SelettoreData({ data, onCambia, formato })`
    - `Vuoto({ testo, azione? })`
    - `AvvisoSolaLettura()`
  - `src/ui/app.js`: `App()`.
    - Intestazione con il selettore Cliente/Trainer: due `<button aria-pressed>`; il cambio chiama `salvaVista`.
    - Navigazione: un `<nav>` con voci `<a href="#">` (quelle disattivate hanno `aria-disabled="true"` e l'etichetta "In arrivo"). Sotto i 900 px è una barra fissa in basso, da 900 px in su un menu laterale.
      - Cliente: Oggi · Allenamento · Alimentazione · Dati (disattivata, "In arrivo").
      - Trainer: Settimana tipo · Schede di allenamento · Piano alimentare · Dati del cliente · Report settimanali (gli ultimi due disattivati, "In arrivo").
    - Guardia modifiche: se una schermata ha chiamato `setSporco(true)`, ogni cambio di sezione o di vista apre il `Dialogo` "Hai modifiche non salvate. Uscire senza salvare?" con le azioni "Resta" e "Esci senza salvare".
    - Le sezioni dei Task 8–12 vengono registrate in una mappa `SEZIONI`. Finché non esistono, mostrano un segnaposto con il nome della sezione.
  - `src/main.js`:
    - Avvia un timer di 10 s.
    - Chiama `claude.use('db')` e `claude.use('user')`. Se `db` è `null`, o il primo `onDati` non arriva entro 10 s, mostra "Impossibile caricare i dati" con il pulsante "Riprova".
    - "Riprova" chiude le iscrizioni aperte e rilancia l'avvio, senza ricaricare la pagina.
    - Legge `id()`, `isOwner()` e `can('data.write')`, ognuno in `try/catch`.
    - `puoScrivere`: `false` se `can()` restituisce `false`; diventa `false` anche quando `segnalaRifiuto(e)` riceve un errore con `eRifiutoPermessi(e)` vero. Quando è `false`, `AvvisoSolaLettura` è visibile e i pulsanti di salvataggio sono `disabled`.
    - `oggi` = `oggiRoma()`, ricalcolato a ogni render.
  - `test/support/apri.js`: `apriPannello({ isOwner, puoScrivere, userId, profili, seme, adesso = '2026-11-04T09:00:00+01:00', larghezza = 390 }) → { page, chiudi() }`.
    - Playwright si carica con `createRequire(import.meta.url)('playwright')`.
    - `page.clock.setFixedTime(new Date(adesso))`.
    - Le richieste verso `fonts.googleapis.com`/`fonts.gstatic.com` vengono interrotte con `page.route`.
    - Due `addInitScript`: il file `fake-claude.js` e `window.claude = creaFakeClaude(config)`.
    - Infine apre `file://…/dist/pannello.html`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/build.test.js` (esegue `node scripts/build.js` con `execFileSync`):
```js
const out = readFileSync('dist/pannello.html', 'utf8');
assert.match(out, /<title>Pannello PT<\/title>/);
assert.doesNotMatch(out, /<script[^>]+src=/);            // niente script esterni
assert.doesNotMatch(out, /<!--SCRIPT-->|<!--STILE-->/);
assert.match(out, /fonts\.googleapis\.com/);
```
`test/e2e/guscio.test.js`:
```js
// proprietario → vista cliente; navigazione cliente
await page.getByRole('button', { name: 'Cliente', pressed: true }).waitFor();
for (const v of ['Oggi', 'Allenamento', 'Alimentazione']) await page.getByRole('link', { name: v }).waitFor();
// invitato → vista trainer
await p2.getByRole('button', { name: 'Trainer', pressed: true }).waitFor();
await p2.getByText('In arrivo').first().waitFor();
// la scelta resta dopo il ricaricamento
await page.getByRole('button', { name: 'Trainer' }).click(); await page.reload();
await page.getByRole('button', { name: 'Trainer', pressed: true }).waitFor();
// sola lettura
await p3.getByText('Puoi solo leggere: chiedi al proprietario di invitarti come Editor').waitFor(); // puoScrivere: false
// db assente → errore e Riprova
await p4.getByText('Impossibile caricare i dati').waitFor({ timeout: 15000 });           // seme speciale: use('db') → null
await p4.getByRole('button', { name: 'Riprova' }).waitFor();
// layout PC: menu laterale
assert.notEqual(await pPC.getByRole('navigation').evaluate((n) => getComputedStyle(n).position), 'fixed'); // a 1440 px il menu è laterale, non la barra fissa in basso
```
Per far restituire `null` a `use('db')`, aggiungi a `creaFakeClaude` l'opzione `senzaDb: true`.

- [ ] **Step 2: Esegui e verifica che falliscano** · Run: `npm test && npm run build; npm run test:e2e` · Expected: FAIL (build e guscio mancanti).
- [ ] **Step 3: Implementa** i file del task. Il CSS segue i token dei Global Constraints; la media query è `@media (min-width: 900px)`.
- [ ] **Step 4: Esegui e verifica che passino** · Run: `npm test && npm run build && npm run test:e2e` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: build pipeline, bootstrap and app shell with view switcher"`

---

### Task 8: Schede di allenamento (vista trainer)

**Files:**
- Create: `src/ui/trainer/schede.js`
- Modify: `src/ui/app.js` (registra la sezione `schede`)
- Test: `test/e2e/schede.test.js`

**Interfaces:**
- Consumes: `Contesto` e componenti (Task 7); `store.salvaScheda`, `store.archiviaScheda` (Task 6); `validaScheda`, `numeroDaInput` (Task 4); `oraRoma`, `formatoData` (Task 1).
- Produces (riusati dai Task 9 e 12):
  - `SezioneSchede()`: libreria ed editor.
  - `EditorScheda({ schedaId: string|null, onChiudi })`
  - `ElencoSchede({ onScegli?: (schedaId) => void })`: ricerca e schede non archiviate.

**Comportamento:**
- **Libreria:**
  - campo "Cerca una scheda" che filtra per nome, ignorando maiuscole e minuscole;
  - pulsante "+ Nuova scheda";
  - interruttore "Mostra archiviate";
  - ogni riga mostra un punto colorato per tipo (palestra/altro `#5B9BFF`, corsa/trekking `#2BC4A6`), il nome e il numero di esercizi o il tipo.
- **Editor:**
  - campi: nome, tipo (`palestra|corsa|trekking|altro`), nota del trainer, durata stimata;
  - liste Riscaldamento e Stretching (nome, durata in secondi, serie, ripetizioni, per lato, nota);
  - Parte principale (nome, serie, ripetizioni, carico kg, recupero s, nota) oppure, per corsa e trekking, Obiettivo (descrizione, km, dislivello m);
  - ogni lista ha "+ Aggiungi esercizio", "Sposta su/giù" e "Rimuovi";
  - i numeri si leggono con `numeroDaInput`;
  - alla prima modifica chiama `setSporco(true)`, al salvataggio riuscito `setSporco(false)`.
- **Salvataggio:**
  - prima `validaScheda`: se ci sono errori, i campi vengono evidenziati con `Campo` e nessuna scrittura parte;
  - con `esito: 'conflitto'` si apre un `Dialogo` con il testo "La scheda è stata modificata da {nome} alle {oraRoma(salvataIl)}" e le azioni "Vedi le sue modifiche" (ricarica l'editor con la revisione corrente) e "Sovrascrivi" (`forza: true`);
  - gli errori di scrittura passano da `segnalaRifiuto` e mostrano `messaggioErrore`.
- **Cronologia revisioni:** elenco con `formatoData(validaDal)`, nome dell'autore e ora. Cliccando una revisione la si vede in sola lettura.
- **Archivia:** se l'esito è `in_uso`, si apre un `Dialogo` con l'elenco degli usi ("Settimana tipo n. {numero} (dal {formatoData(validaDal)})" / "Eccezione del {formatoData(data)}").

- [ ] **Step 1: Scrivi il test che fallisce** `test/e2e/schede.test.js` (vista trainer, seme vuoto, salvo dove indicato):
```js
await page.getByRole('link', { name: 'Schede di allenamento' }).click();
await page.getByRole('button', { name: '+ Nuova scheda' }).click();
await page.getByRole('button', { name: 'Salva' }).click();
await page.getByText('Campo obbligatorio').first().waitFor();                    // nome vuoto
assert.equal(Object.keys(await dump(page)).filter((p) => p.startsWith('schede/')).length, 0);
await page.getByLabel('Nome della scheda').fill('Spinta A');
// un esercizio principale con carico "22,5"
await page.getByRole('button', { name: 'Salva' }).click();
await page.getByText('Spinta A').waitFor();
assert.equal(revisioneDi(await dump(page), 'Spinta A').principale[0].caricoKg, 22.5);
// conflitto: con l'editor aperto, scrivi una revisione da page.evaluate tramite window.claude, poi salva
await page.getByText(/La scheda è stata modificata da .* alle \d\d:\d\d/).waitFor();
// archiviazione bloccata (seme: settimana in vigore che usa la scheda)
await page.getByRole('button', { name: 'Archivia' }).click();
await page.getByText(/Settimana tipo n\. 1/).waitFor();
```
`dump(page)` = `page.evaluate(() => window.claude.dump())`; `revisioneDi` è un helper nel file di test.

- [ ] **Step 2: Esegui e verifica che fallisca** · Run: `npm run build && node --test test/e2e/schede.test.js` · Expected: FAIL.
- [ ] **Step 3: Implementa `src/ui/trainer/schede.js`** e registra la sezione in `app.js`.
- [ ] **Step 4: Esegui e verifica che passi** · Run: `npm test && npm run build && npm run test:e2e` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: trainer scheda library and editor with revisions"`

---

### Task 9: Settimana tipo (vista trainer)

**Files:**
- Create: `src/ui/trainer/settimana.js`
- Modify: `src/ui/app.js` (registra `settimana`; per il trainer è la sezione iniziale)
- Test: `test/e2e/settimana.test.js`

**Interfaces:**
- Consumes: `risolviSettimana`, `risolviGiorno`, `usiScheda` (Task 3); `versioneValida`, `versioniFuture`, `revisionePerGiorno` (Task 2); `statoBlocchi` (Task 5); `lunediDi`, `aggiungiGiorni`, `formatoData` (Task 1); `ElencoSchede` (Task 8); `store.salvaSettimana`, `impostaEccezione`, `spostaGiorno`, `annullaEccezione`.
- Produces (riusati dal Task 12):
  - `SezioneSettimana()`
  - `EditorSoloQuestaSettimana({ lunedi, onChiudi })`
  - `EditorNuovaVersione({ onChiudi })`

**Comportamento:**
- **Intestazione:**
  - "Settimana tipo";
  - "In vigore dal {formatoData(validaDal)} · versione {numero} · creata da {nome} il {formatoData}";
  - una riga per ogni versione futura: "In programma dal {formatoData(validaDal)}";
  - link "Cronologia", che elenca tutte le versioni;
  - pulsanti "Modifica solo questa settimana" e "Nuova versione da una data…".
- **Navigazione:** "‹ Settimana precedente / successiva ›" con l'etichetta "Questa settimana · {date}" o l'intervallo di date.
- **7 card dei giorni:**
  - etichetta `LUN 2`;
  - nome della scheda e tipo, oppure "Riposo";
  - riassunto dei blocchi dalla revisione `revisionePerGiorno(revisioni[schedaId], data)`; se la scheda non c'è, "Scheda non disponibile";
  - giorni passati: stato del diario ("Fatto" se completati = 3, altrimenti "{n}/3", "Non fatto" se 0);
  - oggi: contorno blu e "OGGI";
  - eccezioni: contorno `#F2A774`, "Eccezione", "da {nome} · {formatoData(creataIl)}", "Spostata da {giorno}" se c'è `origine`, e pulsante "Ripristina" (`annullaEccezione`);
  - giorni di riposo: "+ Assegna scheda", che apre `ElencoSchede` e chiama `impostaEccezione`.
- **`EditorSoloQuestaSettimana`:** per ogni giorno, un select con le schede non archiviate e "Riposo". Salvando, scrive `impostaEccezione` solo per i giorni cambiati. C'è anche l'azione "Sposta giorno" (select "da" e "a" → `spostaGiorno`).
- **`EditorNuovaVersione`:** campo data, che parte dal lunedì della settimana successiva. I 7 select sono precompilati con la versione valida in quella data. Salva con `salvaSettimana`.
- **Libreria laterale:** `ElencoSchede`.
- **"Come sta":** l'ultima voce del diario con data ≤ oggi che abbia una nota o una sensazione: "Ultima nota · {formatoData}: “{nota}” · Sensazione {n}/5".
- **Stati vuoti:** senza versioni, `Vuoto` con "Crea la prima settimana tipo" (apre `EditorNuovaVersione`).

- [ ] **Step 1: Scrivi il test che fallisce** `test/e2e/settimana.test.js`. Seme: schede `gambe`, `spinta`, `tirata` con una revisione ciascuna, e la settimana v2 del Task 3. Oggi = 2026-11-04.
```js
await page.getByText('OGGI').waitFor();
await page.getByText('In vigore dal lun 26 ott · versione 2', { exact: false }).waitFor();
// sposta venerdì → giovedì
await page.getByRole('button', { name: 'Modifica solo questa settimana' }).click();
// … scegli da = ven 6, a = gio 5 → Salva
const d = await dump(page);
assert.equal(d['eccezioni/2026-11-05'].schedaId, 'tirata');
assert.equal(d['eccezioni/2026-11-06'].schedaId, null);
await page.getByText('Spostata da ven').waitFor();
// ripristina
await page.getByRole('button', { name: 'Ripristina' }).first().click();
// nuova versione da una data
await page.getByRole('button', { name: 'Nuova versione da una data…' }).click();
// … imposta 2026-11-16, mer = gambe → Salva
await page.getByText('In programma dal lun 16 nov').waitFor();
// pagina vuota
await pVuota.getByRole('button', { name: 'Crea la prima settimana tipo' }).waitFor();
```

- [ ] **Step 2: Esegui e verifica che fallisca** · Run: `npm run build && node --test test/e2e/settimana.test.js` · Expected: FAIL.
- [ ] **Step 3: Implementa `src/ui/trainer/settimana.js`** e registra la sezione.
- [ ] **Step 4: Esegui e verifica che passi** · Run: `npm test && npm run build && npm run test:e2e` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: trainer weekly template with versions and exceptions"`

---

### Task 10: Editor del piano alimentare (vista trainer)

**Files:**
- Create: `src/ui/trainer/alimentazione.js`
- Modify: `src/ui/app.js`
- Test: `test/e2e/piano.test.js`

**Interfaces:**
- Consumes: `versioneValida`, `versioniFuture` (Task 2); `validaPiano`, `numeroDaInput` (Task 4); `store.salvaPiano`.
- Produces: `SezionePiano()`.

**Comportamento:**
- **Intestazione:**
  - "Piano alimentare" e "In vigore dal … · versione n · creato da {nome} il …";
  - "Cronologia";
  - righe "In programma dal …" per le versioni future;
  - "Modifiche non salvate" quando la pagina è sporca;
  - "Annulla" e "Salva come nuova versione da…": chiede la data, che parte da oggi.
- **Contenuto:**
  - textarea "Indicazioni generali";
  - un pasto aperto alla volta (gli altri chiusi, con il riassunto del primo alimento di ogni opzione e "{n} opzioni");
  - schede "Opzione 1 / Opzione 2 / + Opzione";
  - righe alimento con nome, grammi (suffisso "g") e "Rimuovi alimento";
  - "+ Aggiungi alimento", nota dell'opzione, "+ Aggiungi pasto".
- **Base di partenza dell'editor:** una copia della versione valida oggi, se c'è; altrimenti un piano vuoto.
- **Stato vuoto:** senza versioni, "Crea il piano alimentare".
- **Salvataggio:** `validaPiano` prima; gli errori sono evidenziati sui campi.

- [ ] **Step 1: Scrivi il test che fallisce** `test/e2e/piano.test.js`:
```js
await page.getByRole('link', { name: 'Piano alimentare' }).click();
await page.getByRole('button', { name: 'Crea il piano alimentare' }).click();
// aggiungi pasto "Colazione", Opzione 1: "Avena" 60, Opzione 2: "Pane" "70,5"
await page.getByRole('button', { name: 'Salva come nuova versione da…' }).click();
// conferma data 2026-11-04
const piano = Object.entries(await dump(page)).find(([p]) => p.startsWith('alimentazione/'))[1];
assert.equal(piano.pasti[0].opzioni.length, 2);
assert.equal(piano.pasti[0].opzioni[1].alimenti[0].grammi, 70.5);
assert.equal(piano.numero, 1);
// grammi 0 → errore, nessuna nuova versione
await page.getByText('Inserisci un numero maggiore di 0').waitFor();
```

- [ ] **Step 2: Esegui e verifica che fallisca** · Run: `npm run build && node --test test/e2e/piano.test.js` · Expected: FAIL.
- [ ] **Step 3: Implementa `src/ui/trainer/alimentazione.js`** e registra la sezione.
- [ ] **Step 4: Esegui e verifica che passi** · Run: `npm test && npm run build && npm run test:e2e` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: trainer meal plan editor with versions"`

---

### Task 11: Vista cliente — Oggi e dettaglio giornata

**Files:**
- Create: `src/ui/cliente/oggi.js`, `src/ui/cliente/giornata.js`
- Modify: `src/ui/app.js` (`oggi` è la sezione iniziale del cliente; `giornata` è raggiungibile con il parametro `data`)
- Test: `test/e2e/oggi.test.js`

**Interfaces:**
- Consumes: `risolviGiorno` (Task 3); `revisionePerGiorno`, `versioneValida` (Task 2); `statoBlocchi` (Task 5); `aggiungiGiorni`, `formatoData`, `formatoDataLunga` (Task 1); `Anello`, `SelettoreData`, `Dialogo` (Task 7); `store.aggiornaDiario`.
- Produces: `SezioneOggi()`, `SezioneGiornata({ data })`.

**Comportamento:**
- **Oggi:**
  - `SelettoreData` (‹ / ›, etichetta "Oggi · {formatoData}" se è oggi);
  - tre anelli: Sonno (`#E08A4F`) e Cuore a riposo (`#2BC4A6`) con "Nessun dato" e `valore: null`; Allenamento (`#5B9BFF`) con "{completati}/3" e "blocchi", oppure "Riposo";
  - card "Allenamento di oggi": nome, tipo e i tre blocchi. Riscaldamento e Stretching hanno una checkbox di blocco, che spunta o toglie tutti gli indici. La Parte principale mostra il numero di esercizi e serie, oppure l'obiettivo. Il "+" (aria-label "Aggiungi nota") apre un `Dialogo` con textarea che salva `nota`. La card è un link a `giornata`;
  - quattro card dati con "Nessun dato" (FC a riposo, HRV, Passi, Fasi del sonno);
  - "Alimentazione di oggi": i pasti della versione valida per la data, con pulsanti di opzione (scelta locale, non salvata) e le grammature;
  - stati vuoti: "Il trainer non ha ancora preparato il programma" (nessuna versione) e "Nessun piano alimentare".
- **Giornata:**
  - pulsante indietro (aria-label "Torna a Oggi");
  - `formatoDataLunga`, tipo, durata stimata e titolo della scheda;
  - barra a 3 segmenti e "{n} blocco/blocchi su 3 completato/i";
  - "Nota del trainer", se presente;
  - Riscaldamento e Stretching con una checkbox per esercizio (`aggiornaDiario` con gli indici aggiornati) e il contatore "{fatti} / {n}";
  - Parte principale: colonna "Programmato" ("{serie} × {ripetizioni} · {caricoKg} kg", "rec. {m}′{ss}") e pulsante "Segna come fatta", che alterna `principaleFatto`. La colonna "Fatto" non c'è;
  - "Come ti sei sentito?": cinque pulsanti 1–5 con `aria-pressed`, textarea "Note per il trainer" e pulsante "Salva", che scrive `{ sensazione, nota }`.

- [ ] **Step 1: Scrivi il test che fallisce** `test/e2e/oggi.test.js` (vista cliente; seme con settimana, scheda `spinta` di 3 esercizi di riscaldamento e 2 di stretching, piano con Colazione a 2 opzioni):
```js
await page.getByText('Nessun dato').first().waitFor();
await page.getByText('0/3').waitFor();
await page.getByLabel('Riscaldamento').check();
await page.getByText('1/3').waitFor();
assert.deepEqual((await dump(page))['diario/2026-11-04'].riscaldamentoFatti, [0, 1, 2]);
await page.getByRole('button', { name: 'Opzione 2' }).click();      // alimentazione: cambia gli alimenti mostrati
await page.getByRole('link', { name: /Spinta A/ }).click();
await page.getByRole('button', { name: 'Segna come fatta' }).click();
await page.getByRole('button', { name: '4' }).click();
await page.getByLabel('Note per il trainer').fill('Polpaccio rigido');
await page.getByRole('button', { name: 'Salva' }).click();
assert.partialDeepStrictEqual((await dump(page))['diario/2026-11-04'], { principaleFatto: true, sensazione: 4, nota: 'Polpaccio rigido' });
// giorno senza programma
await pVuota.getByText('Il trainer non ha ancora preparato il programma').waitFor();
```

- [ ] **Step 2: Esegui e verifica che fallisca** · Run: `npm run build && node --test test/e2e/oggi.test.js` · Expected: FAIL.
- [ ] **Step 3: Implementa** `oggi.js` e `giornata.js` e registra le sezioni.
- [ ] **Step 4: Esegui e verifica che passi** · Run: `npm test && npm run build && npm run test:e2e` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: client Today and day detail with diary"`

---

### Task 12: Vista cliente — Allenamento e Alimentazione

**Files:**
- Create: `src/ui/cliente/allenamento.js`, `src/ui/cliente/alimentazione.js`
- Modify: `src/ui/app.js`
- Test: `test/e2e/cliente.test.js`

**Interfaces:**
- Consumes: `risolviSettimana` (Task 3); `EditorSoloQuestaSettimana`, `EditorNuovaVersione` (Task 9); `ElencoSchede`, `EditorScheda` (Task 8); `versioneValida`, `versioniFuture` (Task 2).
- Produces: `SezioneAllenamentoCliente()`, `SezioneAlimentazioneCliente()`.

**Comportamento:**
- **Allenamento:**
  - settimana corrente con un giorno per riga (giorno, scheda o "Riposo", "Eccezione"); ogni riga apre `giornata`;
  - pulsanti "Solo questa settimana" (`EditorSoloQuestaSettimana`) e "Da una data in poi" (`EditorNuovaVersione`);
  - sotto, "Schede": `ElencoSchede`, che apre `EditorScheda`.
- **Alimentazione:**
  - `SelettoreData`;
  - indicazioni generali;
  - ogni pasto con le opzioni selezionabili e le grammature, in sola lettura;
  - "In programma dal …" se c'è una versione futura;
  - "Nessun piano alimentare" se non ce n'è una valida.

- [ ] **Step 1: Scrivi il test che fallisce** `test/e2e/cliente.test.js`:
```js
await page.getByRole('link', { name: 'Allenamento' }).click();
assert.equal(await page.getByTestId('riga-giorno').count(), 7);
await page.getByRole('button', { name: 'Solo questa settimana' }).click();
// sposta ven → gio, Salva
assert.equal((await dump(page))['eccezioni/2026-11-05'].autore, 'u-cliente');
await page.getByRole('link', { name: 'Alimentazione' }).click();
await page.getByText('Colazione').waitFor();
assert.equal(await page.getByRole('button', { name: '+ Aggiungi alimento' }).count(), 0);   // sola lettura
```

- [ ] **Step 2: Esegui e verifica che fallisca** · Run: `npm run build && node --test test/e2e/cliente.test.js` · Expected: FAIL.
- [ ] **Step 3: Implementa** i due file e registrali; togli i segnaposto rimasti in `SEZIONI`.
- [ ] **Step 4: Esegui e verifica che passi** · Run: `npm test && npm run build && npm run test:e2e` · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -m "feat: client training week and read-only meal plan"`

---

### Task 13: Verifica visiva, pubblicazione e checklist

**Files:**
- Create: `scripts/screenshot.js`, `docs/prova-finale.md`
- Modify: nessuno

**Interfaces:**
- Consumes: `dist/pannello.html`, `test/support/apri.js`.

- [ ] **Step 1: Screenshot.** `scripts/screenshot.js` usa `apriPannello` con un seme dimostrativo (2 schede, una settimana, un'eccezione, un piano, una voce di diario) e salva in `screenshots/` le pagine Oggi e Giornata (vista cliente, 390 px) e Settimana tipo e Piano alimentare (vista trainer, 1440 px), con `deviceScaleFactor: 1`.
  Run: `npm run build && node scripts/screenshot.js` · Expected: 4 PNG. Aprili e controlla che non ci siano testi tagliati, scroll orizzontale a 390 px o elementi sovrapposti; correggi il CSS se serve.
- [ ] **Step 2: Suite completa** · Run: `npm test && npm run test:e2e` · Expected: PASS.
- [ ] **Step 3: Pubblica.** Usa lo strumento Artifact, azione `publish`:
  - `file_path`: `dist/pannello.html`;
  - `icon`: `"fitness"`;
  - `description`: "Pannello condiviso cliente/trainer: schede, settimana tipo, piano alimentare e diario.";
  - `capabilities`: esattamente quelle dei Global Constraints.

  Annota l'URL.
- [ ] **Step 4: Verifica dei permessi.** Con `ArtifactData`, sull'URL pubblicato:
  - `set` di `prova/permessi` con `{ ok: true }` al livello proprietario → riesce;
  - lo stesso `set` con `as_level: "view"` → rifiutato;
  - `delete` di `prova/permessi`;
  - `list` di `schede`, `settimane`, `eccezioni`, `alimentazione`, `diario` → vuote, senza errori.
- [ ] **Step 5: Scrivi `docs/prova-finale.md`** con:
  - **Come invitare il trainer:** menu Condividi → invito via email → ruolo **Editor**; nessun link pubblico (§4.2).
  - **La checklist di §9**, punti 1–8, con caselle da spuntare.
- [ ] **Step 6: Commit e push**

```bash
git add scripts/screenshot.js docs/prova-finale.md
git commit -m "chore: screenshots script and final test checklist"
git push -u origin claude/superpowers-brainstorming-vmso7s
```
