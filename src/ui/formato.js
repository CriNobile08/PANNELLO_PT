/** Helper di formattazione condivisi tra vista cliente e vista trainer. */
export const numero = (v) => typeof v === 'number' && Number.isFinite(v);

/** 8423 → "8.423" */
export const migliaia = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 352 → "5′52″" (secondi arrotondati); non numerico → "—". */
export const minSec = (sec) => {
  if (!numero(sec)) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}′${String(s % 60).padStart(2, '0')}″`;
};

/** 118, 'bpm' → "118 bpm" (arrotondato); non numerico → "—". */
export const conUnita = (v, unita) => (numero(v) ? `${Math.round(v)} ${unita}` : '—');
