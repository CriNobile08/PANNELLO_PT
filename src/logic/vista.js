export const CHIAVE_VISTA = 'pannello.vista';

const VALIDE = ['cliente', 'trainer'];

export function vistaIniziale({ isOwner, storage }) {
  try {
    const v = storage?.getItem(CHIAVE_VISTA);
    if (VALIDE.includes(v)) return v;
  } catch {
    // memoria non disponibile: si usa la vista predefinita
  }
  return isOwner ? 'cliente' : 'trainer';
}

export function salvaVista(storage, vista) {
  try {
    storage?.setItem(CHIAVE_VISTA, vista);
  } catch {
    // ignorato
  }
}
