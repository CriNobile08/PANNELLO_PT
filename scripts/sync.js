// `npm run sync`: legge Google Health e Hevy e scrive out/sync.json (mai segreti né log dei dati).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creaClient } from '../src/sync/googleHealth/client.js';
import { creaClientHevy } from '../src/sync/hevy/client.js';
import { fonteGoogleHealth } from '../src/sync/fonti/googleHealth.js';
import { fonteHevy } from '../src/sync/fonti/hevy.js';
import { leggiFcIntervallo } from '../src/sync/fonti/fcGoogleHealth.js';
import { aggiungiFcPerOrario } from '../src/sync/fcPerOrario.js';
import { eseguiSync, esitoComplessivo } from '../src/sync/esegui.js';

const MESSAGGIO_FC = 'FC dettagliata non aggiornata';
const VARIABILI_GOOGLE = ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'GH_REFRESH_TOKEN'];

const CARTELLA_PREDEFINITA = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

export async function main({
  env = process.env, fetch = globalThis.fetch, adesso = new Date(), cartella = CARTELLA_PREDEFINITA,
  attendi, log = console.log, errore = console.error,
} = {}) {
  const file = join(cartella, 'sync.json');
  const opzioni = { env, fetch, ...(attendi && { attendi }) };
  const r = await eseguiSync({
    adesso,
    fonti: {
      googleHealth: () => fonteGoogleHealth({ client: creaClient(opzioni), adesso }),
      hevy: () => fonteHevy({ client: creaClientHevy(opzioni), adesso }),
    },
  });

  // FC per orario sulle sessioni Hevy (senza credenziali Google: niente, e nessun errore).
  // Se l'orologio ha già dato autorizzazione/configurazione errata, la lettura fallirebbe di nuovo: si salta.
  const hevy = r.fonti.hevy;
  const gh = r.fonti.googleHealth;
  const googleUtilizzabile = VARIABILI_GOOGLE.every((v) => env?.[v])
    && !(gh?.esito === 'errore' && (gh.codice === 'autorizzazione' || gh.codice === 'configurazione'));
  if (hevy && hevy.esito !== 'errore' && googleUtilizzabile) {
    const client = creaClient(opzioni);
    const { fcSessioni, fallite } = await aggiungiFcPerOrario({
      operazioni: r.operazioni,
      leggiFc: (inizio, fine) => leggiFcIntervallo(client, inizio, fine),
    });
    hevy.conteggi = { ...hevy.conteggi, fcSessioni };
    if (fallite > 0 && hevy.esito === 'ok') {
      hevy.esito = 'parziale';
      if (!hevy.messaggio) hevy.messaggio = MESSAGGIO_FC;
      r.esito = esitoComplessivo(r.fonti);
    }
  } else if (hevy && hevy.esito !== 'errore') {
    hevy.conteggi = { ...hevy.conteggi, fcSessioni: 0 };
  }

  if (r.esito === 'errore') {
    rmSync(file, { force: true });
    for (const [nome, f] of Object.entries(r.fonti)) errore(`ERRORE: ${nome}: ${f.codice}: ${f.messaggio}`);
    return 1;
  }
  mkdirSync(cartella, { recursive: true });
  writeFileSync(file, JSON.stringify(r, null, 2));
  log(`sync: ${r.esito} · ${Object.entries(r.fonti).map(([nome, f]) => `${nome} ${f.esito}`).join(' · ')}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
