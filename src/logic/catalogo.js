// Ricerca nei cataloghi degli esercizi (Hevy e riscaldamento/stretching) ed etichette in italiano.

/** Minuscole senza accenti; null/undefined → ''. */
export function normalizza(testo) {
  return String(testo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const vuoto = (v) => v === null || v === undefined || v === '';
const corrisponde = (valore, atteso) => (Array.isArray(valore) ? valore.includes(atteso) : valore === atteso);

/**
 * Voci il cui `nome` (o `nomeEn`) contiene tutte le parole di `testo` e che soddisfano ogni filtro
 * `{ campo: valore }` (valore vuoto = nessun filtro; per i campi array vale l'appartenenza).
 * Ordine: prima chi inizia con il testo, poi alfabetico. Al massimo `limite` voci.
 */
export function filtraCatalogo(voci, { testo = '', filtri = {} } = {}, limite = 50) {
  const q = normalizza(testo).trim().replace(/\s+/g, ' ');
  const parole = q ? q.split(' ') : [];
  const attivi = Object.entries(filtri ?? {}).filter(([, v]) => !vuoto(v));
  const trovate = [];
  for (const v of voci ?? []) {
    if (!v || typeof v.nome !== 'string') continue;
    if (!attivi.every(([campo, atteso]) => corrisponde(v[campo], atteso))) continue;
    const nome = normalizza(v.nome);
    const nomeEn = normalizza(v.nomeEn);
    const pagliaio = `${nome} ${nomeEn}`;
    if (!parole.every((p) => pagliaio.includes(p))) continue;
    trovate.push({ v, inizia: q !== '' && (nome.startsWith(q) || (nomeEn !== '' && nomeEn.startsWith(q))) });
  }
  trovate.sort((a, b) => (a.inizia !== b.inizia ? (a.inizia ? -1 : 1) : a.v.nome.localeCompare(b.v.nome, 'it')));
  return trovate.slice(0, limite).map((t) => t.v);
}

export const ETICHETTE_GRUPPI = {
  quadriceps: 'Quadricipiti', chest: 'Petto', abdominals: 'Addominali', full_body: 'Corpo intero',
  shoulders: 'Spalle', biceps: 'Bicipiti', glutes: 'Glutei', triceps: 'Tricipiti', upper_back: 'Dorso alto',
  lats: 'Dorsali', cardio: 'Cardio', calves: 'Polpacci', hamstrings: 'Femorali', forearms: 'Avambracci',
  traps: 'Trapezi', lower_back: 'Lombari', neck: 'Collo', abductors: 'Abduttori', adductors: 'Adduttori',
  other: 'Altro',
};

export const ETICHETTE_ATTREZZI = {
  machine: 'Macchina', none: 'Corpo libero', barbell: 'Bilanciere', dumbbell: 'Manubri', other: 'Altro',
  resistance_band: 'Elastico', kettlebell: 'Kettlebell', plate: 'Disco', suspension: 'Sospensione',
};

export const ETICHETTE_CATEGORIE = {
  cardio_warmup: 'Riscaldamento cardio', dynamic_mobility: 'Mobilità dinamica',
  foam_rolling: 'Foam roller', static_stretching: 'Stretching statico',
};

/** Etichetta italiana di `chiave` in `mappa`; chiave sconosciuta → la chiave stessa (null → ''). */
export function etichetta(mappa, chiave) {
  if (chiave === null || chiave === undefined) return '';
  return Object.hasOwn(mappa, chiave) ? mappa[chiave] : String(chiave);
}
