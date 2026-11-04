/** Helper di formattazione condivisi tra vista cliente e vista trainer. */
export const numero = (v) => typeof v === 'number' && Number.isFinite(v);

/** 8423 → "8.423" */
export const migliaia = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
