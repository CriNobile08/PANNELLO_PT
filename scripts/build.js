// Produce dist/pannello.html: un unico file con CSS e JS inline.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const da = (p) => fileURLToPath(new URL('../' + p, import.meta.url));

/**
 * `entrata`: codice sorgente alternativo (con import assoluti) al posto di src/main.js — usato dai test.
 */
export async function costruisci({ uscita = da('dist/pannello.html'), entrata } = {}) {
  const risultato = await build({
    ...(entrata ? { stdin: { contents: entrata, resolveDir: da('src'), loader: 'js' } } : { entryPoints: [da('src/main.js')] }),
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'es2020',
    legalComments: 'none',
  });
  const js = risultato.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(da('src/ui/stile.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
  const template = readFileSync(da('src/template.html'), 'utf8');

  // Sostituzione con funzione: il JS minificato può contenere sequenze come "$&".
  const html = template
    .replace('<!--STILE-->', () => `<style>\n${css}</style>`)
    .replace('<!--SCRIPT-->', () => `<script>${js}</script>`);

  mkdirSync(dirname(uscita), { recursive: true });
  writeFileSync(uscita, html);
  return { uscita, byte: html.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { byte } = await costruisci();
  console.log(`dist/pannello.html (${(byte / 1024).toFixed(1)} KB)`);
}
