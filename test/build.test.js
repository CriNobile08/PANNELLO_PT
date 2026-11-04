import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const radice = fileURLToPath(new URL('..', import.meta.url));

test('build produce un unico HTML autosufficiente', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: radice, stdio: 'pipe' });
  const out = readFileSync(new URL('../dist/pannello.html', import.meta.url), 'utf8');
  assert.match(out, /<title>Pannello PT<\/title>/);
  assert.match(out, /<meta name="viewport"/);
  assert.doesNotMatch(out, /<script[^>]+src=/); // niente script esterni
  assert.doesNotMatch(out, /<!--SCRIPT-->|<!--STILE-->/);
  assert.match(out, /fonts\.googleapis\.com/);
  assert.match(out, /<div id="app"><\/div>/);
  // l'unico </script è quello che chiude il blocco inline
  assert.equal(out.match(/<\/script/gi).length, 1);
});
