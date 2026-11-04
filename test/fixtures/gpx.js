// Fixture GPX: costruttore del testo XML e parser minimo per Node (che non ha
// DOMParser). Il parser legge con espressioni regolari solo il formato generato
// qui sotto e offre il sottoinsieme di API usato da `leggiGpx`:
// `parseFromString`, `getElementsByTagName`, `getAttribute`, `textContent`.

const orario = (t) => (typeof t === 'number' ? new Date(t).toISOString() : t);

function trkpt(p) {
  const figli = [];
  if (p.ele !== undefined && p.ele !== null) figli.push(`<ele>${p.ele}</ele>`);
  if (p.time !== undefined && p.time !== null) figli.push(`<time>${orario(p.time)}</time>`);
  return `<trkpt lat="${p.lat}" lon="${p.lon}">${figli.join('')}</trkpt>`;
}

/**
 * Testo GPX 1.1 con una traccia.
 * @param {{punti?: Array<{lat: number, lon: number, ele?: number, time?: string|number}>,
 *   segmenti?: Array<Array<object>>}} opzioni `segmenti` ha la precedenza su `punti`;
 *   `time` può essere ISO o millisecondi
 * @returns {string}
 */
export function gpx({ punti = [], segmenti = null } = {}) {
  const segs = segmenti ?? [punti];
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">'
    + '<metadata><time>2000-01-01T00:00:00Z</time></metadata>'
    + '<trk><name>Corsa</name>'
    + segs.map((s) => `<trkseg>${s.map(trkpt).join('')}</trkseg>`).join('')
    + '</trk></gpx>';
}

class ElementoFinto {
  constructor(attributi, interno) {
    this.attributi = attributi;
    this.interno = interno;
  }

  get textContent() {
    return this.interno.replace(/<[^>]*>/g, '');
  }

  getAttribute(nome) {
    return Object.hasOwn(this.attributi, nome) ? this.attributi[nome] : null;
  }

  getElementsByTagName(nome) {
    const re = new RegExp(`<${nome}((?:\\s[^>]*)?)(?:/>|>([\\s\\S]*?)</${nome}>)`, 'g');
    return [...this.interno.matchAll(re)].map(([, attr, interno = '']) => {
      const attributi = {};
      for (const [, k, v] of attr.matchAll(/([\w:]+)="([^"]*)"/g)) attributi[k] = v;
      return new ElementoFinto(attributi, interno);
    });
  }
}

/** Parser minimo: un testo che non è un `<gpx>…</gpx>` dà un documento con `parsererror`. */
export class DOMParserFinto {
  parseFromString(testo) {
    const valido = /<gpx[\s>][\s\S]*<\/gpx>\s*$/.test(testo);
    return new ElementoFinto({}, valido ? testo : '<parsererror>XML non valido</parsererror>');
  }
}
