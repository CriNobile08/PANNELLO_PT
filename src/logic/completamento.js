function bloccoCompleto(esercizi, fatti) {
  const n = (esercizi ?? []).length;
  const set = new Set(Array.isArray(fatti) ? fatti : []);
  for (let i = 0; i < n; i++) if (!set.has(i)) return false;
  return true;
}

export function statoBlocchi(revisione, voce) {
  if (!revisione) return { riscaldamento: false, principale: false, stretching: false, completati: 0 };
  const riscaldamento = bloccoCompleto(revisione.riscaldamento, voce?.riscaldamentoFatti);
  const stretching = bloccoCompleto(revisione.stretching, voce?.stretchingFatti);
  const principale = voce?.principaleFatto === true;
  return { riscaldamento, principale, stretching, completati: [riscaldamento, principale, stretching].filter(Boolean).length };
}
