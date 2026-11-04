// Apre dist/pannello.html in Chromium con un finto window.claude.
// Un browser per file di test (ogni file gira nel suo processo), un contesto nuovo per ogni apertura.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const FAKE = fileURLToPath(new URL('./fake-claude.js', import.meta.url));
const PAGINA = pathToFileURL(fileURLToPath(new URL('../../dist/pannello.html', import.meta.url))).href;

let browser = null;
async function prendiBrowser() {
  browser ??= await chromium.launch();
  return browser;
}

/** Da chiamare in `after()` di ogni file di test. */
export async function chiudiBrowser() {
  const b = browser;
  browser = null;
  await b?.close();
}

/**
 * Opzioni del finto claude: isOwner, puoScrivere, userId, profili, seme, senzaDb.
 * `pagina`: URL file:// alternativo (default dist/pannello.html).
 */
export async function apriPannello({
  isOwner, puoScrivere, userId, profili, seme, senzaDb,
  adesso = '2026-11-04T09:00:00+01:00', larghezza = 390, pagina = PAGINA,
} = {}) {
  const b = await prendiBrowser();
  const contesto = await b.newContext({ viewport: { width: larghezza, height: larghezza >= 900 ? 900 : 844 } });
  const page = await contesto.newPage();
  await page.clock.setFixedTime(new Date(adesso));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  const config = Object.fromEntries(
    Object.entries({ isOwner, puoScrivere, userId, profili, seme, senzaDb }).filter(([, v]) => v !== undefined),
  );
  await page.addInitScript({ path: FAKE });
  await page.addInitScript((cfg) => { window.claude = globalThis.creaFakeClaude(cfg); }, config);
  await page.goto(pagina);
  return { page, chiudi: () => contesto.close() };
}
