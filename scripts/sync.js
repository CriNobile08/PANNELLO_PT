// `npm run sync`: legge Google Health e scrive out/sync.json (mai segreti né log dei dati).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creaClient, ErroreSync } from '../src/sync/googleHealth/client.js';
import { eseguiSync } from '../src/sync/esegui.js';

const CARTELLA_PREDEFINITA = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
const MESSAGGI = {
  autorizzazione: 'Autorizzazione Google scaduta: va rinnovato il token',
  rete: 'Google Health non raggiungibile',
  configurazione: 'Credenziali Google Health mancanti',
};

export async function main({
  env = process.env, fetch = globalThis.fetch, adesso = new Date(), cartella = CARTELLA_PREDEFINITA,
  attendi, log = console.log, errore = console.error,
} = {}) {
  const file = join(cartella, 'sync.json');
  try {
    const client = creaClient({ env, fetch, ...(attendi && { attendi }) });
    const r = await eseguiSync({ client, adesso });
    mkdirSync(cartella, { recursive: true });
    writeFileSync(file, JSON.stringify(r, null, 2));
    log(`sync: ${r.esito}, ${r.conteggi.giorni} giorni, ${r.conteggi.sessioni} sessioni`);
    return 0;
  } catch (e) {
    rmSync(file, { force: true });
    const codice = e instanceof ErroreSync ? e.codice : 'rete';
    errore(`ERRORE: ${codice}: ${MESSAGGI[codice] ?? MESSAGGI.rete}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
