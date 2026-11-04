/** Lettura e analisi dei tracciati GPX (spec §5.2 e §6.2). */

const RAGGIO_M = 6371000;
const RAD = Math.PI / 180;
const SOGLIA_MOVIMENTO = 0.5; // m/s
const SOGLIA_DISLIVELLO = 1; // m
const FINESTRA_QUOTA = 5; // punti della media mobile
const RESIDUO_MINIMO = 10; // m: ultimo split solo se almeno tanto
const MAX_PUNTI = 300;
const CORNICE = 1000;
const MARGINE = 40;

const nonValido = () => ({ codice: 'non_valido' });
const arrotonda1 = (v) => Math.round(v * 10) / 10;

/** Distanza in metri con la formula dell'emisenoverso. */
function distanza(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAGGIO_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Testo del primo figlio con quel nome, o null. */
const testoFiglio = (el, nome) => el.getElementsByTagName(nome)[0]?.textContent ?? null;

/**
 * Legge i punti dei segmenti di traccia di un GPX. I punti senza `time` valido
 * (o con `lat`/`lon` non validi) sono scartati, così come i segmenti rimasti vuoti.
 * @param {string} testo XML del file
 * @param {typeof DOMParser} [DOMParserImpl] il DOMParser del browser (in Node va passato)
 * @returns {Array<Array<{lat: number, lon: number, ele: number|null, t: number}>>} `t` in ms
 * @throws {{codice: 'non_valido'}} se il file non si legge o ha meno di 2 punti con ora
 */
export function leggiGpx(testo, DOMParserImpl = globalThis.DOMParser) {
  let doc;
  try {
    doc = new DOMParserImpl().parseFromString(String(testo ?? ''), 'application/xml');
  } catch {
    throw nonValido();
  }
  if (!doc || doc.getElementsByTagName('parsererror').length > 0) throw nonValido();
  const segmenti = [];
  for (const seg of Array.from(doc.getElementsByTagName('trkseg'))) {
    const punti = [];
    for (const el of Array.from(seg.getElementsByTagName('trkpt'))) {
      const lat = Number.parseFloat(el.getAttribute('lat'));
      const lon = Number.parseFloat(el.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      const t = Date.parse((testoFiglio(el, 'time') ?? '').trim());
      if (Number.isNaN(t)) continue;
      const testoEle = (testoFiglio(el, 'ele') ?? '').trim();
      const ele = testoEle === '' ? null : Number(testoEle);
      punti.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null, t });
    }
    if (punti.length > 0) segmenti.push(punti);
  }
  if (segmenti.reduce((n, s) => n + s.length, 0) < 2) throw nonValido();
  return segmenti;
}

/** Quote smussate (media mobile centrata sui valori presenti) o null dove la finestra è vuota. */
function quoteLisce(punti) {
  const meta = Math.floor(FINESTRA_QUOTA / 2);
  return punti.map((_, i) => {
    let somma = 0;
    let n = 0;
    for (let j = Math.max(0, i - meta); j <= Math.min(punti.length - 1, i + meta); j++) {
      if (punti[j].ele !== null) {
        somma += punti[j].ele;
        n++;
      }
    }
    return n ? somma / n : null;
  });
}

/** Salita cumulata a ogni punto, contando solo variazioni ≥ 1 m dall'ultimo riferimento. */
function salitaCumulata(lisce) {
  let rif = null;
  let salita = 0;
  return lisce.map((q) => {
    if (q !== null) {
      if (rif === null) rif = q;
      else if (q - rif >= SOGLIA_DISLIVELLO) {
        salita += q - rif;
        rif = q;
      } else if (rif - q >= SOGLIA_DISLIVELLO) rif = q;
    }
    return salita;
  });
}

/** Distanza di p dal segmento a–b, in coordinate piane. */
function distanzaDalSegmento([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const f = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + f * dx), py - (ay + f * dy));
}

/** Douglas-Peucker iterativo: primo e ultimo punto sempre inclusi. */
function douglasPeucker(punti, tolleranza) {
  const n = punti.length;
  if (n <= 2) return punti.slice();
  const tieni = new Uint8Array(n);
  tieni[0] = 1;
  tieni[n - 1] = 1;
  const pila = [[0, n - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    let massima = -1;
    let indice = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanzaDalSegmento(punti[i], punti[a], punti[b]);
      if (d > massima) {
        massima = d;
        indice = i;
      }
    }
    if (indice !== -1 && massima > tolleranza) {
      tieni[indice] = 1;
      pila.push([a, indice], [indice, b]);
    }
  }
  return punti.filter((_, i) => tieni[i]);
}

/** Sfoltisce con tolleranza 0,5 raddoppiata finché i punti sono ≤ 300. */
function sfoltisci(punti) {
  let tolleranza = 0.5;
  let risultato = douglasPeucker(punti, tolleranza);
  while (risultato.length > MAX_PUNTI) {
    tolleranza *= 2;
    risultato = douglasPeucker(punti, tolleranza);
  }
  return risultato;
}

/** Al più `MAX_PUNTI` elementi presi a indici equidistanti, primo e ultimo inclusi. */
function campiona(elenco) {
  if (elenco.length <= MAX_PUNTI) return elenco;
  return Array.from({ length: MAX_PUNTI }, (_, i) => elenco[Math.round((i * (elenco.length - 1)) / (MAX_PUNTI - 1))]);
}

/** Minimo e massimo con un ciclo: lo spread in Math.min/max supera lo stack con molti punti. */
function estremi(valori) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of valori) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/**
 * Proiezione equirettangolare centrata sul percorso, scalata nella cornice
 * 1000×1000 con margine 40 e proporzioni mantenute; il nord è in alto.
 * @returns {(p: {lat: number, lon: number}) => [number, number]}
 */
function proiezione(punti) {
  const [minLat, maxLat] = estremi(punti.map((p) => p.lat));
  const lat0 = ((minLat + maxLat) / 2) * RAD;
  const piano = (p) => [p.lon * Math.cos(lat0), -p.lat];
  const xy = punti.map(piano);
  const [minX, maxX] = estremi(xy.map(([x]) => x));
  const [minY, maxY] = estremi(xy.map(([, y]) => y));
  const larghezza = maxX - minX;
  const altezza = maxY - minY;
  const lato = CORNICE - 2 * MARGINE;
  const estensione = Math.max(larghezza, altezza);
  const scala = estensione > 0 ? lato / estensione : 0;
  const offX = MARGINE + (lato - larghezza * scala) / 2;
  const offY = MARGINE + (lato - altezza * scala) / 2;
  return (p) => {
    const [x, y] = piano(p);
    return [offX + (x - minX) * scala, offY + (y - minY) * scala];
  };
}

/**
 * Analizza i segmenti letti da `leggiGpx` e produce i campi calcolati del
 * documento `tracciati/{idParte}` (spec §5.2): tutti tranne idParte, fonte,
 * nomeFile, idAsset, caricatoIl e autore.
 * @param {Array<Array<{lat: number, lon: number, ele: number|null, t: number}>>} segmenti
 * @returns {{inizio: string, fine: string, distanzaM: number, dislivelloM: number|null,
 *   durataSec: number, inMovimentoSec: number,
 *   split: Array<{km: number, distanzaM: number, durataSec: number, dislivelloM: number|null}>,
 *   percorso: Array<[number, number]>, segniKm: Array<[number, number]>,
 *   quote: Array<[number, number]>|null, istantiKm: number[]}}
 */
export function analizzaGpx(segmenti) {
  const punti = (segmenti ?? []).flat();
  if (punti.length === 0) throw nonValido();
  const t0 = punti[0].t;
  const tFine = punti.at(-1).t;
  const sec = (t) => (t - t0) / 1000;

  // Distanza cumulata (tra segmenti non si somma) e tempo in movimento.
  const cumulata = new Array(punti.length);
  let totale = 0;
  let inMovimento = 0;
  let k = 0;
  for (const seg of segmenti) {
    seg.forEach((p, i) => {
      if (i > 0) {
        const d = distanza(seg[i - 1], p);
        const dt = (p.t - seg[i - 1].t) / 1000;
        totale += d;
        if (dt > 0 && d / dt >= SOGLIA_MOVIMENTO) inMovimento += dt;
      }
      cumulata[k++] = totale;
    });
  }

  // Dislivello: null se meno del 50% dei punti ha la quota.
  const conQuota = punti.filter((p) => p.ele !== null).length;
  const haQuota = conQuota * 2 >= punti.length;
  const salita = haQuota ? salitaCumulata(quoteLisce(punti)) : null;
  const salitaTotale = salita ? salita.at(-1) : null;

  // Km interi: tempo, salita e posizione per interpolazione lineare tra i due punti a cavallo.
  const kmInteri = [];
  let j = 1;
  for (let km = 1; km * 1000 <= totale; km++) {
    const obiettivo = km * 1000;
    while (j < punti.length - 1 && cumulata[j] < obiettivo) j++;
    const f = (obiettivo - cumulata[j - 1]) / (cumulata[j] - cumulata[j - 1]);
    const tra = (a, b) => a + f * (b - a);
    const [a, b] = [punti[j - 1], punti[j]];
    kmInteri.push({
      sec: sec(tra(a.t, b.t)),
      salita: salita ? tra(salita[j - 1], salita[j]) : null,
      lat: tra(a.lat, b.lat),
      lon: tra(a.lon, b.lon),
    });
  }

  const split = [];
  let prec = { sec: 0, salita: 0 };
  const pezzo = (km, metri, fine) => ({
    km,
    distanzaM: Math.round(metri),
    durataSec: Math.round(fine.sec - prec.sec),
    dislivelloM: salita ? Math.round(fine.salita - prec.salita) : null,
  });
  kmInteri.forEach((fine, i) => {
    split.push(pezzo(i + 1, 1000, fine));
    prec = fine;
  });
  const residuo = totale - kmInteri.length * 1000;
  if (residuo >= RESIDUO_MINIMO) {
    split.push(pezzo(kmInteri.length + 1, residuo, { sec: sec(tFine), salita: salitaTotale }));
  }

  const proietta = proiezione(punti);
  const arrotondaXY = ([x, y]) => [arrotonda1(x), arrotonda1(y)];
  const quote = haQuota
    ? campiona(punti.filter((p) => p.ele !== null)).map((p) => [Math.round(sec(p.t)), arrotonda1(p.ele)])
    : null;

  return {
    inizio: new Date(t0).toISOString(),
    fine: new Date(tFine).toISOString(),
    distanzaM: Math.round(totale),
    dislivelloM: salita ? Math.round(salitaTotale) : null,
    durataSec: Math.round(Math.max(0, tFine - t0) / 1000),
    inMovimentoSec: Math.round(inMovimento),
    split,
    percorso: sfoltisci(punti.map(proietta)).map(arrotondaXY),
    segniKm: kmInteri.map((p) => arrotondaXY(proietta(p))),
    quote,
    istantiKm: kmInteri.map((p) => arrotonda1(p.sec)),
  };
}

const istante = (v) => (typeof v === 'number' ? v : Date.parse(v));

/**
 * Frazione (0..1) dell'intervallo più corto coperta dall'intersezione dei due.
 * 0 se uno dei due ha durata nulla o date non valide.
 * @param {{inizio: string, fine: string}} a
 * @param {{inizio: string, fine: string}} b
 * @returns {number}
 */
export function sovrapposizione(a, b) {
  const [ia, fa, ib, fb] = [a?.inizio, a?.fine, b?.inizio, b?.fine].map(istante);
  const piuCorta = Math.min(fa - ia, fb - ib);
  if (!(piuCorta > 0)) return 0;
  const comune = Math.min(fa, fb) - Math.max(ia, ib);
  return Math.max(0, Math.min(1, comune / piuCorta));
}
