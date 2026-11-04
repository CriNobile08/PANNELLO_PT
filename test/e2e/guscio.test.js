import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

test('proprietario: parte in vista cliente con la navigazione cliente', async () => {
  const { page, chiudi } = await apriPannello({ isOwner: true });
  try {
    await page.getByRole('button', { name: 'Cliente', pressed: true }).waitFor();
    await page.getByRole('button', { name: 'Trainer', pressed: false }).waitFor();
    for (const v of ['Oggi', 'Allenamento', 'Alimentazione']) await page.getByRole('link', { name: v }).waitFor();
    const dati = page.getByRole('link', { name: /Dati/ });
    assert.equal(await dati.getAttribute('aria-disabled'), 'true');
    await page.getByText('In arrivo').first().waitFor();
    assert.equal(await page.getByText('Puoi solo leggere: chiedi al proprietario di invitarti come Editor').count(), 0);
  } finally { await chiudi(); }
});

test('invitato: parte in vista trainer con le voci "In arrivo"', async () => {
  const { page: p2, chiudi } = await apriPannello({ isOwner: false, userId: 'u-trainer' });
  try {
    await p2.getByRole('button', { name: 'Trainer', pressed: true }).waitFor();
    await p2.getByText('In arrivo').first().waitFor();
    for (const v of ['Settimana tipo', 'Schede di allenamento', 'Piano alimentare']) await p2.getByRole('link', { name: v }).waitFor();
    assert.equal(await p2.getByRole('link', { name: /Report settimanali/ }).getAttribute('aria-disabled'), 'true');
    assert.equal(await p2.getByRole('link', { name: /Dati del cliente/ }).getAttribute('aria-disabled'), null);
  } finally { await chiudi(); }
});

test('la vista scelta resta dopo il ricaricamento', async () => {
  const { page, chiudi } = await apriPannello({ isOwner: true });
  try {
    await page.getByRole('button', { name: 'Cliente', pressed: true }).waitFor();
    await page.getByRole('button', { name: 'Trainer' }).click();
    await page.getByRole('button', { name: 'Trainer', pressed: true }).waitFor();
    await page.getByRole('link', { name: 'Settimana tipo' }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Trainer', pressed: true }).waitFor();
  } finally { await chiudi(); }
});

test('navigazione: la voce scelta mostra la sua sezione', async () => {
  const { page, chiudi } = await apriPannello({ isOwner: true });
  try {
    await page.getByRole('link', { name: 'Alimentazione' }).click();
    await page.getByRole('link', { name: 'Alimentazione' }).and(page.locator('[aria-current="page"]')).waitFor();
    await page.getByRole('heading', { name: 'Alimentazione' }).waitFor();
  } finally { await chiudi(); }
});

test('sola lettura: avviso fisso', async () => {
  const { page: p3, chiudi } = await apriPannello({ isOwner: false, puoScrivere: false });
  try {
    await p3.getByText('Puoi solo leggere: chiedi al proprietario di invitarti come Editor').waitFor();
  } finally { await chiudi(); }
});

test('db assente: errore e Riprova', async () => {
  const { page: p4, chiudi } = await apriPannello({ isOwner: true, senzaDb: true });
  try {
    await p4.getByText('Impossibile caricare i dati').waitFor({ timeout: 15000 });
    await p4.getByRole('button', { name: 'Riprova' }).waitFor();
    // Riprova rilancia l'avvio senza ricaricare: con il db ora disponibile la pagina si apre
    await p4.evaluate(() => { window.claude = creaFakeClaude({ isOwner: true }); window.__nonRicaricata = true; });
    await p4.getByRole('button', { name: 'Riprova' }).click();
    await p4.getByRole('button', { name: 'Cliente', pressed: true }).waitFor();
    assert.equal(await p4.evaluate(() => window.__nonRicaricata), true);
  } finally { await chiudi(); }
});

test('layout PC: menu laterale, telefono: barra fissa in basso', async () => {
  const pc = await apriPannello({ isOwner: true, larghezza: 1440 });
  const tel = await apriPannello({ isOwner: true, larghezza: 390 });
  try {
    await pc.page.getByRole('link', { name: 'Oggi' }).waitFor();
    assert.notEqual(await pc.page.getByRole('navigation').evaluate((n) => getComputedStyle(n).position), 'fixed');
    await tel.page.getByRole('link', { name: 'Oggi' }).waitFor();
    assert.equal(await tel.page.getByRole('navigation').evaluate((n) => getComputedStyle(n).position), 'fixed');
  } finally { await pc.chiudi(); await tel.chiudi(); }
});

// Guardia modifiche: variante del bundle con una sezione "oggi" che si segna sporca.
test('guardia modifiche: cambio di sezione o di vista chiede conferma', async () => {
  const { costruisci } = await import('../../scripts/build.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const uscita = join(mkdtempSync(join(tmpdir(), 'pannello-')), 'guardia.html');
  await costruisci({
    uscita,
    entrata: `
      import { SEZIONI } from './ui/app.js';
      import { Contesto } from './ui/contesto.js';
      import { html, useContext } from './ui/html.js';
      import './main.js';
      SEZIONI.oggi = () => {
        const { setSporco } = useContext(Contesto);
        return html\`<section><h1>Oggi</h1><button onClick=\${() => setSporco(true)}>Sporca</button></section>\`;
      };`,
  });
  const { page, chiudi } = await apriPannello({ isOwner: true, pagina: pathToFileURL(uscita).href });
  try {
    const domanda = page.getByRole('dialog', { name: 'Hai modifiche non salvate. Uscire senza salvare?' });
    await page.getByRole('button', { name: 'Sporca' }).click();
    // Resta: nessun cambio
    await page.getByRole('link', { name: 'Allenamento' }).click();
    await domanda.waitFor();
    await page.getByRole('button', { name: 'Resta' }).click();
    await domanda.waitFor({ state: 'detached' });
    await page.getByRole('heading', { name: 'Oggi' }).waitFor();
    // Anche il cambio di vista passa dalla guardia
    await page.getByRole('button', { name: 'Trainer' }).click();
    await domanda.waitFor();
    await page.getByRole('button', { name: 'Resta' }).click();
    await page.getByRole('button', { name: 'Cliente', pressed: true }).waitFor();
    // Esci senza salvare: il cambio avviene
    await page.getByRole('link', { name: 'Allenamento' }).click();
    await page.getByRole('button', { name: 'Esci senza salvare' }).click();
    await page.getByRole('heading', { name: 'Allenamento' }).waitFor();
    // pagina non più sporca: nessuna domanda
    await page.getByRole('link', { name: 'Alimentazione' }).click();
    await page.getByRole('heading', { name: 'Alimentazione' }).waitFor();
    assert.equal(await domanda.count(), 0);
  } finally { await chiudi(); }
});

test('db in ritardo oltre i 10 s: l\'errore resta fino a Riprova', async () => {
  const { page, chiudi } = await apriPannello({ isOwner: true, ritardoDb: 15_000, installaOrologio: true });
  try {
    await page.getByText('Caricamento…').waitFor();
    await page.clock.runFor(10_001);
    await page.getByText('Impossibile caricare i dati').waitFor();
    await page.clock.runFor(10_000); // il db arriva (a 15 s) e gli snapshot partono
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    await page.getByText('Impossibile caricare i dati').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cliente' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Riprova' }).count(), 1);
  } finally { await chiudi(); }
});

test('Campo: errore fuori dal nome accessibile, aria-invalid e aria-describedby', async () => {
  const { costruisci } = await import('../../scripts/build.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const uscita = join(mkdtempSync(join(tmpdir(), 'pannello-')), 'campo.html');
  await costruisci({
    uscita,
    entrata: `
      import { SEZIONI } from './ui/app.js';
      import { Campo } from './ui/componenti.js';
      import { html } from './ui/html.js';
      import './main.js';
      SEZIONI.oggi = () => html\`<section>
        <\${Campo} etichetta="Nome della scheda" errore="Campo obbligatorio"><input value="" /></\${Campo}>
        <\${Campo} etichetta="Nota"><input value="" /></\${Campo}>
      </section>\`;`,
  });
  const { page, chiudi } = await apriPannello({ isOwner: true, pagina: pathToFileURL(uscita).href });
  try {
    const nome = page.getByLabel('Nome della scheda', { exact: true });
    await nome.waitFor();
    assert.equal(await nome.getAttribute('aria-invalid'), 'true');
    const idErr = await nome.getAttribute('aria-describedby');
    assert.equal(await page.locator(`#${idErr}`).textContent(), 'Campo obbligatorio');
    const nota = page.getByLabel('Nota', { exact: true });
    assert.equal(await nota.getAttribute('aria-invalid'), null);
  } finally { await chiudi(); }
});
