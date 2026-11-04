export const MESSAGGI = {
  obbligatorio: 'Campo obbligatorio',
  intero: 'Inserisci un numero intero maggiore di 0',
  positivo: 'Inserisci un numero maggiore di 0',
  nonNegativo: 'Inserisci un numero maggiore o uguale a 0',
};

export function numeroDaInput(testo) {
  if (testo === null || testo === undefined) return null;
  if (typeof testo === 'number') return Number.isFinite(testo) ? testo : null;
  const pulito = String(testo).replace(/\s+/g, '').replace(',', '.');
  if (pulito === '') return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
}

const vuoto = (v) => typeof v !== 'string' || v.trim() === '';
const num = (v) => (typeof v === 'number' ? v : numeroDaInput(v));

function obbligatorio(errori, campo, valore) {
  if (vuoto(valore)) errori.push({ campo, messaggio: MESSAGGI.obbligatorio });
}

// facoltativo: null/undefined ammessi; altrimenti deve soddisfare la regola.
function numerico(errori, campo, valore, { intero = false, minimo }) {
  if (valore === null || valore === undefined || valore === '') return;
  const n = num(valore);
  const ok = n !== null && (!intero || Number.isInteger(n)) && (minimo === 'zero' ? n >= 0 : n > 0);
  if (!ok) {
    const chiave = intero ? 'intero' : minimo === 'zero' ? 'nonNegativo' : 'positivo';
    errori.push({ campo, messaggio: MESSAGGI[chiave] });
  }
}

// obbligatorio: il valore non può mancare.
function numericoRichiesto(errori, campo, valore, opzioni) {
  if (valore === null || valore === undefined || valore === '') {
    errori.push({ campo, messaggio: opzioni.intero ? MESSAGGI.intero : MESSAGGI.positivo });
    return;
  }
  numerico(errori, campo, valore, opzioni);
}

export function validaScheda(scheda, revisione) {
  const errori = [];
  obbligatorio(errori, 'nome', scheda?.nome);
  if (!revisione) return errori;

  for (const blocco of ['riscaldamento', 'stretching']) {
    (revisione[blocco] ?? []).forEach((e, i) => {
      const p = `${blocco}.${i}`;
      obbligatorio(errori, `${p}.nome`, e.nome);
      numerico(errori, `${p}.durataSec`, e.durataSec, { intero: true });
      numerico(errori, `${p}.serie`, e.serie, { intero: true });
      numerico(errori, `${p}.ripetizioni`, e.ripetizioni, { intero: true });
    });
  }

  if (scheda?.tipo === 'corsa' || scheda?.tipo === 'trekking') {
    const o = revisione.obiettivo;
    if (o) {
      obbligatorio(errori, 'obiettivo.descrizione', o.descrizione);
      numerico(errori, 'obiettivo.distanzaKm', o.distanzaKm, {});
      numerico(errori, 'obiettivo.dislivelloM', o.dislivelloM, { minimo: 'zero' });
    }
  } else {
    (revisione.principale ?? []).forEach((e, i) => {
      const p = `principale.${i}`;
      obbligatorio(errori, `${p}.nome`, e.nome);
      numericoRichiesto(errori, `${p}.serie`, e.serie, { intero: true });
      numericoRichiesto(errori, `${p}.ripetizioni`, e.ripetizioni, { intero: true });
      numerico(errori, `${p}.caricoKg`, e.caricoKg, { minimo: 'zero' });
      numerico(errori, `${p}.recuperoSec`, e.recuperoSec, { intero: true });
    });
  }
  return errori;
}

export function validaPiano(piano) {
  const errori = [];
  (piano?.pasti ?? []).forEach((pasto, i) => {
    const pp = `pasti.${i}`;
    obbligatorio(errori, `${pp}.nome`, pasto.nome);
    (pasto.opzioni ?? []).forEach((op, j) => {
      const po = `${pp}.opzioni.${j}`;
      obbligatorio(errori, `${po}.nome`, op.nome);
      (op.alimenti ?? []).forEach((al, k) => {
        const pa = `${po}.alimenti.${k}`;
        obbligatorio(errori, `${pa}.nome`, al.nome);
        numericoRichiesto(errori, `${pa}.grammi`, al.grammi, {});
      });
    });
  });
  return errori;
}
