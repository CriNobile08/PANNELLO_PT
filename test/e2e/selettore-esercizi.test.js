import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { apriPannello, chiudiBrowser } from '../support/apri.js';

after(chiudiBrowser);

const dump = (page) => page.evaluate(() => window.claude.dump());
const revisioneDi = (d, nome) => {
  const p = Object.keys(d).find((k) => /^schede\/[^/]+$/.test(k) && d[k].nome === nome);
  return d[`${p}/revisioni/${d[p].revisioneCorrente}`];
};
const trainer = (extra = {}) => apriPannello({ isOwner: false, userId: 'u-trainer', profili: { 'u-trainer': 'Luca' }, ...extra });
const vaiASchede = (page) => page.getByRole('link', { name: 'Schede di allenamento' }).click();

// catalogo Hevy finto: poche voci, nessun dato reale
const es = (id, nome, gruppo, attrezzo) => ({ id, nome, gruppo, secondari: [], attrezzo, tipo: 'weight_reps', personalizzato: false });
const CATALOGO = {
  aggiornatoIl: '2026-11-04T06:00:00Z',
  esercizi: [
    es('T-BENCH', 'Bench Press (Barbell)', 'chest', 'barbell'),
    es('T-CGBP', 'Close Grip Bench Press', 'triceps', 'barbell'),
    es('T-INCL', 'Incline Bench Press (Dumbbell)', 'chest', 'dumbbell'),
    es('T-SQUAT', 'Squat (Barbell)', 'quadriceps', 'barbell'),
    es('T-STRANO', 'Esercizio Strano', 'tail', null),
  ],
};
const conCatalogo = { 'hevy/catalogo': CATALOGO };

async function nuovaScheda(page, nome) {
  await vaiASchede(page);
  await page.getByRole('button', { name: '+ Nuova scheda' }).click();
  await page.getByLabel('Nome della scheda', { exact: true }).fill(nome);
}
async function aggiungi(page, blocco) {
  const b = page.getByRole('region', { name: blocco });
  await b.getByRole('button', { name: '+ Aggiungi esercizio' }).click();
  return b.getByRole('group', { name: `Esercizio ${await b.getByRole('group').count()}` });
}
async function testoSenzaValoriVuoti(page) {
  const t = await page.locator('body').innerText();
  for (const parola of ['NaN', 'undefined', 'null']) assert.ok(!t.includes(parola), `"${parola}" nel testo`);
}

test('parte principale dal catalogo Hevy, riscaldamento dal catalogo locale, stretching libero', async () => {
  const { page, chiudi } = await trainer({ seme: conCatalogo });
  try {
    await nuovaScheda(page, 'Spinta B');
    const riga = await aggiungi(page, 'Parte principale');
    const nome = riga.getByRole('combobox', { name: 'Nome' });
    assert.equal(await nome.getAttribute('aria-expanded'), 'false');
    await nome.fill('bench');
    assert.equal(await nome.getAttribute('aria-expanded'), 'true');
    const lista = riga.getByRole('listbox');
    assert.equal(await nome.getAttribute('aria-controls'), await lista.getAttribute('id'));
    await lista.getByRole('option', { name: /Close Grip Bench Press/ }).waitFor();
    // filtro Petto: resta solo il petto; "Esercizio non in elenco…" è sempre l'ultima opzione
    await riga.getByLabel('Gruppo muscolare', { exact: true }).selectOption({ label: 'Petto' });
    const opzioni = lista.getByRole('option');
    assert.deepEqual(await opzioni.allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ').trim())), [
      'Bench Press (Barbell) Petto · Bilanciere',
      'Incline Bench Press (Dumbbell) Petto · Manubri',
      'Esercizio non in elenco…',
    ]);
    // il filtro "Tutti" li riporta
    await riga.getByLabel('Gruppo muscolare', { exact: true }).selectOption({ label: 'Tutti' });
    await lista.getByRole('option', { name: /Close Grip/ }).waitFor();
    await riga.getByLabel('Attrezzo', { exact: true }).selectOption({ label: 'Manubri' });
    assert.equal(await opzioni.count(), 2);
    await riga.getByLabel('Attrezzo', { exact: true }).selectOption({ label: 'Tutti' });
    await riga.getByLabel('Gruppo muscolare', { exact: true }).selectOption({ label: 'Petto' });
    await lista.getByRole('option', { name: /^Bench Press \(Barbell\)/ }).click();
    // scelto: nome, testo secondario e "Cambia"
    await riga.getByText('Bench Press (Barbell)', { exact: true }).waitFor();
    await riga.getByText('Petto · Bilanciere').waitFor();
    await riga.getByRole('button', { name: 'Cambia' }).waitFor();
    assert.equal(await riga.getByRole('combobox', { name: 'Nome' }).count(), 0);
    await riga.getByLabel('Serie', { exact: true }).fill('4');
    await riga.getByLabel('Ripetizioni', { exact: true }).fill('8');

    // riscaldamento: catalogo locale filtrato per categoria
    const risc = await aggiungi(page, 'Riscaldamento');
    const categoria = risc.getByLabel('Categoria', { exact: true });
    const categorie = await categoria.locator('option').allInnerTexts();
    assert.deepEqual(categorie, ['Tutti', 'Foam roller', 'Mobilità dinamica', 'Riscaldamento cardio']);
    await categoria.selectOption({ label: 'Mobilità dinamica' });
    const nomeRisc = risc.getByRole('combobox', { name: 'Nome' });
    await nomeRisc.fill('femorali');
    const opzRisc = risc.getByRole('listbox').getByRole('option');
    for (const t of await opzRisc.allInnerTexts()) {
      if (t.startsWith('Esercizio non in elenco')) continue;
      assert.match(t, /Mobilità dinamica/);
    }
    await risc.getByRole('listbox').getByRole('option', { name: /^Femorali 90\/90/ }).click();
    await risc.getByText('Mobilità dinamica · femorali').waitFor();

    // stretching: solo stretching statico e foam roller; esercizio non in elenco → testo libero
    const str = await aggiungi(page, 'Stretching');
    assert.deepEqual(await str.getByLabel('Categoria', { exact: true }).locator('option').allInnerTexts(), ['Tutti', 'Foam roller', 'Stretching statico']);
    await str.getByRole('combobox', { name: 'Nome' }).fill('allungamento inventato');
    await str.getByRole('listbox').getByRole('option', { name: 'Esercizio non in elenco…' }).click();
    const libero = str.getByRole('textbox', { name: 'Nome' });
    assert.equal(await libero.inputValue(), 'allungamento inventato');
    await libero.fill('Stretching libero');
    await str.getByRole('button', { name: 'Scegli dal catalogo' }).waitFor();
    await testoSenzaValoriVuoti(page);

    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('button', { name: '+ Nuova scheda' }).waitFor();
    const rev = revisioneDi(await dump(page), 'Spinta B');
    assert.equal(rev.principale[0].nome, 'Bench Press (Barbell)');
    assert.equal(rev.principale[0].hevyTemplateId, 'T-BENCH');
    assert.equal(rev.principale[0].serie, 4);
    assert.deepEqual({ nome: rev.riscaldamento[0].nome, idCatalogo: rev.riscaldamento[0].idCatalogo }, { nome: 'Femorali 90/90', idCatalogo: '90_90_Hamstring' });
    assert.deepEqual({ nome: rev.stretching[0].nome, idCatalogo: rev.stretching[0].idCatalogo }, { nome: 'Stretching libero', idCatalogo: null });
    assert.equal('hevyTemplateId' in rev.riscaldamento[0], false);

    // riaperta: le scelte restano, "Cambia" torna alla ricerca
    await page.getByText('Spinta B').click();
    const princ = page.getByRole('region', { name: 'Parte principale' }).getByRole('group', { name: 'Esercizio 1' });
    await princ.getByText('Petto · Bilanciere').waitFor();
    await princ.getByRole('button', { name: 'Cambia' }).click();
    const cerca = princ.getByRole('combobox', { name: 'Nome' });
    await assert.equal(await cerca.evaluate((el) => el === document.activeElement), true);
    await cerca.fill('squat');
    await princ.getByRole('listbox').getByRole('option', { name: /^Squat/ }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('button', { name: '+ Nuova scheda' }).waitFor();
    const rev2 = revisioneDi(await dump(page), 'Spinta B');
    assert.deepEqual([rev2.principale[0].nome, rev2.principale[0].hevyTemplateId], ['Squat (Barbell)', 'T-SQUAT']);
  } finally { await chiudi(); }
});

test('tastiera: frecce, Invio sceglie, Esc chiude; voce con chiavi sconosciute', async () => {
  const { page, chiudi } = await trainer({ seme: conCatalogo });
  try {
    await nuovaScheda(page, 'Tastiera');
    const riga = await aggiungi(page, 'Parte principale');
    const nome = riga.getByRole('combobox', { name: 'Nome' });
    await nome.focus();
    await page.keyboard.type('bench');
    const opzioni = riga.getByRole('listbox').getByRole('option');
    await opzioni.first().waitFor();
    assert.equal(await nome.getAttribute('aria-activedescendant'), null);
    await page.keyboard.press('ArrowDown');
    const primo = await opzioni.nth(0).getAttribute('id');
    assert.equal(await nome.getAttribute('aria-activedescendant'), primo);
    assert.equal(await opzioni.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    assert.equal(await nome.getAttribute('aria-activedescendant'), await opzioni.nth(1).getAttribute('id'));
    // Esc chiude
    await page.keyboard.press('Escape');
    assert.equal(await nome.getAttribute('aria-expanded'), 'false');
    assert.equal(await nome.getAttribute('aria-activedescendant'), null);
    // freccia su a lista chiusa: riapre sull'ultima opzione ("Esercizio non in elenco…")
    await page.keyboard.press('ArrowUp');
    assert.equal(await nome.getAttribute('aria-activedescendant'), await opzioni.last().getAttribute('id'));
    assert.equal(await opzioni.last().innerText(), 'Esercizio non in elenco…');
    await page.keyboard.press('Escape');
    // la freccia riapre; Invio sceglie (2ª voce: Close Grip Bench Press)
    await page.keyboard.press('ArrowDown');
    assert.equal(await nome.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await riga.getByText('Close Grip Bench Press', { exact: true }).waitFor();
    await riga.getByText('Tricipiti · Bilanciere').waitFor();
    // le voci con chiavi sconosciute mostrano la chiave; nessun "null"
    await riga.getByRole('button', { name: 'Cambia' }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox');
    await page.keyboard.type('strano');
    await riga.getByRole('listbox').getByRole('option', { name: /^Esercizio Strano\s*tail$/ }).waitFor();
    // le opzioni hanno almeno 44 px
    const altezza = await riga.getByRole('listbox').getByRole('option').first().evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(altezza >= 44, `altezza ${altezza}`);
    // fino all'ultima voce, "Esercizio non in elenco…", con Invio → testo libero
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // oltre l'ultima: resta sull'ultima
    await page.keyboard.press('Enter');
    const libero = riga.getByRole('textbox', { name: 'Nome' });
    assert.equal(await libero.evaluate((el) => el === document.activeElement), true);
    assert.equal(await libero.inputValue(), 'strano');
    await testoSenzaValoriVuoti(page);
  } finally { await chiudi(); }
});

test('scheda vecchia senza id: testo libero; salvata resta con id null', async () => {
  const seme = {
    ...conCatalogo,
    'schede/s1': { nome: 'Vecchia', tipo: 'palestra', archiviata: false, revisioneCorrente: 'r1', creataDa: 'u-trainer', creataIl: '2026-10-01T10:30:00+02:00' },
    'schede/s1/revisioni/r1': {
      validaDal: '2026-10-01', autore: 'u-trainer', salvataIl: '2026-10-01T10:30:00+02:00', nota: '', durataStimataMin: null,
      riscaldamento: [{ nome: 'Corda', durataSec: 120, serie: null, ripetizioni: null, perLato: false, nota: '' }],
      principale: [{ nome: 'Panca', serie: 3, ripetizioni: 10, caricoKg: 40, recuperoSec: 90, nota: '', hevyTemplateId: null }],
      stretching: [],
    },
  };
  const { page, chiudi } = await trainer({ seme });
  try {
    await vaiASchede(page);
    await page.getByText('Vecchia').click();
    const princ = page.getByRole('region', { name: 'Parte principale' }).getByRole('group', { name: 'Esercizio 1' });
    assert.equal(await princ.getByRole('textbox', { name: 'Nome' }).inputValue(), 'Panca');
    await princ.getByRole('button', { name: 'Scegli dal catalogo' }).waitFor();
    const risc = page.getByRole('region', { name: 'Riscaldamento' }).getByRole('group', { name: 'Esercizio 1' });
    assert.equal(await risc.getByRole('textbox', { name: 'Nome' }).inputValue(), 'Corda');
    assert.equal(await page.getByRole('combobox', { name: 'Nome' }).count(), 0);
    await page.getByLabel('Nota del trainer', { exact: true }).fill('nuova nota');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('button', { name: '+ Nuova scheda' }).waitFor();
    const rev = revisioneDi(await dump(page), 'Vecchia');
    assert.deepEqual([rev.principale[0].nome, rev.principale[0].hevyTemplateId], ['Panca', null]);
    assert.deepEqual([rev.riscaldamento[0].nome, rev.riscaldamento[0].idCatalogo], ['Corda', null]);

    // "Scegli dal catalogo" torna alla ricerca (con il testo di prima) e il campo vuoto è obbligatorio
    await page.getByText('Vecchia').click();
    await princ.getByRole('button', { name: 'Scegli dal catalogo' }).click();
    const cerca = princ.getByRole('combobox', { name: 'Nome' });
    assert.equal(await cerca.inputValue(), 'Panca');
    await page.getByRole('button', { name: 'Salva' }).click();
    await princ.getByText('Campo obbligatorio').waitFor();
    assert.equal(await cerca.getAttribute('aria-invalid'), 'true');
  } finally { await chiudi(); }
});

test('senza catalogo Hevy: nota e campo libero nella parte principale', async () => {
  const { page, chiudi } = await trainer();
  try {
    await nuovaScheda(page, 'Senza Hevy');
    const riga = await aggiungi(page, 'Parte principale');
    await riga.getByText('Catalogo Hevy non ancora disponibile').waitFor();
    assert.equal(await riga.getByRole('combobox', { name: 'Nome' }).count(), 0);
    assert.equal(await riga.getByRole('button', { name: 'Scegli dal catalogo' }).count(), 0);
    await riga.getByRole('textbox', { name: 'Nome' }).fill('Panca libera');
    await riga.getByLabel('Serie', { exact: true }).fill('3');
    await riga.getByLabel('Ripetizioni', { exact: true }).fill('10');
    // il riscaldamento ha comunque il suo catalogo
    const risc = await aggiungi(page, 'Riscaldamento');
    await risc.getByRole('combobox', { name: 'Nome' }).fill('mountain');
    await risc.getByRole('listbox').getByRole('option', { name: /^Mountain climber/ }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('button', { name: '+ Nuova scheda' }).waitFor();
    const rev = revisioneDi(await dump(page), 'Senza Hevy');
    assert.deepEqual([rev.principale[0].nome, rev.principale[0].hevyTemplateId], ['Panca libera', null]);
    assert.equal(typeof rev.riscaldamento[0].idCatalogo, 'string');
  } finally { await chiudi(); }
});

test('390 px: lista aperta senza scorrimento orizzontale', async () => {
  const { page, chiudi } = await trainer({ seme: conCatalogo, larghezza: 390 });
  try {
    await nuovaScheda(page, 'Stretta');
    const riga = await aggiungi(page, 'Parte principale');
    await riga.getByRole('combobox', { name: 'Nome' }).fill('press');
    await riga.getByRole('listbox').getByRole('option').first().waitFor();
    const str = await aggiungi(page, 'Stretching');
    await str.getByRole('combobox', { name: 'Nome' }).fill('a');
    await str.getByRole('listbox').getByRole('option').first().waitFor();
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `scrollWidth ${sw} > clientWidth ${cw}`);
    await testoSenzaValoriVuoti(page);
  } finally { await chiudi(); }
});
