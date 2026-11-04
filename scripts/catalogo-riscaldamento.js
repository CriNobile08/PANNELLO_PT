// `node scripts/catalogo-riscaldamento.js`: da docs/dati/riscaldamento-stretching.json genera
// src/data/catalogo-riscaldamento.json, compatto (senza istruzioni né immagini) e ordinato per nome.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const da = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
export const SORGENTE = da('docs/dati/riscaldamento-stretching.json');
export const USCITA = da('src/data/catalogo-riscaldamento.json');

/** Voci compatte `{ id, nome, nomeEn, categoria, attrezzo, muscoli, livello }`, ordinate per nome (it). */
export function generaCatalogo(sorgente) {
  const voci = (sorgente ?? []).map((e) => ({
    id: String(e.id),
    nome: String(e.name ?? ''),
    nomeEn: String(e.name_en ?? ''),
    categoria: e.app_sub_category ?? null,
    attrezzo: e.equipment ?? null,
    muscoli: Array.isArray(e.primaryMuscles) ? [...e.primaryMuscles] : [],
    livello: e.level ?? null,
  }));
  return voci.sort((a, b) => a.nome.localeCompare(b.nome, 'it') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Una voce per riga: diff leggibili e output stabile. */
export function serializza(voci) {
  return `[\n${voci.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const voci = generaCatalogo(JSON.parse(readFileSync(SORGENTE, 'utf8')));
  writeFileSync(USCITA, serializza(voci));
  console.log(`src/data/catalogo-riscaldamento.json (${voci.length} voci)`);
}
