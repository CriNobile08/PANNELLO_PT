// Finto window.claude: script classico (niente import/export), assegna globalThis.creaFakeClaude.
(function () {
  const clona = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const unisci = (base, nuovo) => {
    const r = { ...base };
    for (const [k, v] of Object.entries(nuovo)) r[k] = isObj(v) && isObj(r[k]) ? unisci(r[k], v) : clona(v);
    return r;
  };

  globalThis.creaFakeClaude = function creaFakeClaude(opzioni) {
    const { isOwner = true, puoScrivere = true, userId = 'u-cliente', profili = {}, seme = {}, senzaDb = false, ritardoDb = 0, mcp: conMcp = false,
      assets: conAssets = false, assetFallisce = false } = opzioni ?? {};
    // scritturaFallisce: nome di una collezione di primo livello le cui scritture vengono rifiutate (modificabile con scritturaFallisce()).
    let collezioneRifiutata = opzioni?.scritturaFallisce ?? null;
    const docs = new Map(Object.entries(seme).map(([p, d]) => [p, clona(d)]));
    const ascoltatori = new Set();
    let contatore = 0;

    const segmenti = (p) => p.split('/').filter(Boolean);
    const rifiuto = () => Promise.reject({ code: 'invalid_argument', message: 'write below minimum level' });
    const guasto = (path) => collezioneRifiutata !== null && segmenti(path)[0] === collezioneRifiutata;
    const rifiutoGuasto = () => Promise.reject({ code: 'unavailable', message: 'write failed' });

    function snapshotDoc(path) {
      const dati = docs.get(path);
      return { id: segmenti(path).pop(), exists: dati !== undefined, data: () => clona(dati) };
    }
    function snapshotCol(path) {
      const n = segmenti(path).length + 1;
      const prefisso = path + '/';
      const elenco = [...docs.keys()]
        .filter((p) => p.startsWith(prefisso) && segmenti(p).length === n)
        .sort((x, y) => { const a = segmenti(x).pop(); const b = segmenti(y).pop(); return a < b ? -1 : a > b ? 1 : 0; })
        .map((p) => ({ ...snapshotDoc(p), ref: docRef(p) }));
      return { docs: elenco, size: elenco.length, empty: elenco.length === 0 };
    }
    function consegna(a) {
      setTimeout(() => {
        if (!a.attivo) return;
        a.next(a.tipo === 'doc' ? snapshotDoc(a.path) : snapshotCol(a.path));
      }, 0);
    }
    // Come il db vero: al massimo 64 sottoscrizioni attive per vista; la 65ª fallisce sul callback d'errore.
    const MAX_ISCRIZIONI = 64;
    function iscrivi(tipo, path, next, errore) {
      if (ascoltatori.size >= MAX_ISCRIZIONI) {
        let attivo = true;
        setTimeout(() => {
          if (!attivo) return;
          const e = { code: 'resource_exhausted', message: 'too many active subscriptions' };
          if (errore) errore(e);
          else console.error(e);
        }, 0);
        return () => { attivo = false; };
      }
      const a = { tipo, path, next, attivo: true };
      ascoltatori.add(a);
      consegna(a);
      return () => { a.attivo = false; ascoltatori.delete(a); };
    }
    function scritto() { for (const a of ascoltatori) consegna(a); }

    function docRef(path) {
      return {
        id: segmenti(path).pop(),
        path,
        get: () => Promise.resolve(snapshotDoc(path)),
        set(dati) {
          if (!puoScrivere) return rifiuto();
          if (guasto(path)) return rifiutoGuasto();
          docs.set(path, clona(dati));
          scritto();
          return Promise.resolve();
        },
        update(dati) {
          if (!puoScrivere) return rifiuto();
          if (guasto(path)) return rifiutoGuasto();
          if (!docs.has(path)) return Promise.reject({ code: 'invalid_argument', message: 'document does not exist' });
          docs.set(path, unisci(docs.get(path), dati));
          scritto();
          return Promise.resolve();
        },
        delete() {
          if (!puoScrivere) return rifiuto();
          if (guasto(path)) return rifiutoGuasto();
          docs.delete(path);
          scritto();
          return Promise.resolve();
        },
        onSnapshot: (next, errore) => iscrivi('doc', path, next, errore),
        collection: (p) => colRef(path + '/' + p),
      };
    }
    function colRef(path) {
      return {
        path,
        doc: (id) => docRef(path + '/' + (id ?? 'id' + ++contatore)),
        add(dati) {
          const ref = docRef(path + '/id' + ++contatore);
          return ref.set(dati).then(() => ref);
        },
        get: () => Promise.resolve(snapshotCol(path)),
        onSnapshot: (next, errore) => iscrivi('col', path, next, errore),
      };
    }

    const db = {
      doc: (p) => docRef(p),
      collection: (p) => colRef(p),
    };
    const user = {
      id: () => Promise.resolve(userId),
      isOwner: () => isOwner,
      can: () => puoScrivere,
      profiles: (ids) => Promise.resolve(Object.fromEntries((ids ?? []).map((i) => [i, { id: i, name: profili[i] ?? '' }]))),
    };

    const chiamate = [];
    const mcp = conMcp ? {
      callTool: (server, tool, input) => { chiamate.push({ server, tool, input: clona(input) }); return Promise.resolve({}); },
    } : null;

    // assets finti: id a1, a2, … (come il vero, l'id è il puntatore durevole e l'URL è /_blob/<id>).
    // Il tipo è `opzioni.type || blob.type` e deve stare nell'insieme accettato dal contratto (assets.d.ts 0.2.96):
    // fuori → unsupported_type; vuoto, con parametri (`;charset=`) o blob vuoto/non Blob → invalid_request.
    const TIPI_ASSET = new Set([
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf',
      'font/woff2', 'font/woff', 'font/ttf', 'font/otf',
      'text/csv', 'text/markdown', 'application/json', 'text/plain', 'text/css', 'text/javascript',
    ]);
    const chiamateAsset = { upload: [], tipi: [], delete: [] };
    let contatoreAsset = 0;
    const assets = conAssets ? {
      upload(blob, opzioniUpload) {
        if (assetFallisce) return Promise.reject({ code: 'upstream_error', message: 'upload failed' });
        const tipo = opzioniUpload?.type || blob?.type || '';
        if (typeof Blob === 'undefined' || !(blob instanceof Blob) || blob.size === 0 || tipo === '' || tipo.includes(';')) {
          return Promise.reject({ code: 'invalid_request', message: 'invalid upload' });
        }
        if (!TIPI_ASSET.has(tipo)) return Promise.reject({ code: 'unsupported_type', message: 'unsupported type ' + tipo });
        const id = 'a' + ++contatoreAsset;
        chiamateAsset.upload.push(id);
        chiamateAsset.tipi.push(tipo);
        return Promise.resolve({ id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: tipo });
      },
      delete(id) {
        chiamateAsset.delete.push(id);
        return Promise.resolve({ deleted: true });
      },
    } : null;

    return {
      use: (nome) => {
        const valore = nome === 'db' ? (senzaDb ? null : db) : nome === 'user' ? user : nome === 'mcp' ? mcp : nome === 'assets' ? assets : null;
        if (nome === 'db' && ritardoDb > 0) return new Promise((ok) => setTimeout(() => ok(valore), ritardoDb));
        return Promise.resolve(valore);
      },
      chiamateMcp: () => clona(chiamate),
      chiamateAsset: () => clona(chiamateAsset),
      scritturaFallisce: (nome) => { collezioneRifiutata = nome ?? null; },
      iscrizioniAttive: () => ascoltatori.size,
      dump: () => Object.fromEntries([...docs].map(([p, d]) => [p, clona(d)])),
    };
  };
})();
