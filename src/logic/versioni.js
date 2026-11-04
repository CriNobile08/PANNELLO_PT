const istante = (v) => v.salvataIl ?? v.creataIl ?? '';

export function versioneValida(versioni, data) {
  let migliore = null;
  for (const v of versioni ?? []) {
    if (v.validaDal > data) continue;
    if (
      migliore === null ||
      v.validaDal > migliore.validaDal ||
      (v.validaDal === migliore.validaDal && istante(v) > istante(migliore))
    ) migliore = v;
  }
  return migliore;
}

export function versioniFuture(versioni, oggi) {
  return (versioni ?? [])
    .filter((v) => v.validaDal > oggi)
    .sort((a, b) => (a.validaDal < b.validaDal ? -1 : a.validaDal > b.validaDal ? 1 : 0));
}

export function revisionePerGiorno(revisioni, data) {
  const valida = versioneValida(revisioni, data);
  if (valida) return valida;
  // Nessuna revisione valida quel giorno: la più vecchia disponibile (validaDal minimo; a parità,
  // la salvata per prima). L'ordine dell'array non conta: il db ordina per id casuale.
  let prima = null;
  for (const r of revisioni ?? []) {
    if (
      prima === null ||
      r.validaDal < prima.validaDal ||
      (r.validaDal === prima.validaDal && istante(r) < istante(prima))
    ) prima = r;
  }
  return prima;
}

export function prossimoNumero(versioni) {
  return (versioni ?? []).reduce((m, v) => Math.max(m, v.numero), 0) + 1;
}
