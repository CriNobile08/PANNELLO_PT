// Normalizzazione pura delle risposte Hevy nei documenti di §5 della spec 2c-1.
import { dataDaIso } from '../../logic/date.js';

const TIPI_SERIE = { warmup: 'riscaldamento', normal: 'normale', failure: 'cedimento', dropset: 'drop' };

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const testo = (v) => (typeof v === 'string' ? v : '');
const perIndice = (a, b) => (numero(a?.index) ?? 0) - (numero(b?.index) ?? 0);

function serieDa(s) {
  return {
    ordine: numero(s.index) ?? 0,
    tipo: TIPI_SERIE[s.type] ?? 'normale',
    kg: numero(s.weight_kg),
    ripetizioni: numero(s.reps),
    durataSec: numero(s.duration_seconds),
    distanzaM: numero(s.distance_meters),
    rpe: numero(s.rpe),
  };
}

function esercizioDa(e) {
  return {
    ordine: numero(e.index) ?? 0,
    nome: testo(e.title),
    idTemplate: e.exercise_template_id ?? null,
    idSuperserie: numero(e.superset_id),
    note: testo(e.notes),
    serie: [...(e.sets ?? [])].sort(perIndice).map(serieDa),
  };
}

/** Documento `sessioni/hevy_{id}` (senza id); null se mancano gli estremi o la durata non è positiva. */
export function sessioneDaWorkout(w) {
  const inizio = w?.start_time;
  const fine = w?.end_time;
  if (!w?.id || !inizio || !fine) return null;
  const ms = Date.parse(fine) - Date.parse(inizio);
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const esercizi = [...(w.exercises ?? [])].sort(perIndice).map(esercizioDa);
  const lavoro = esercizi.flatMap((e) => e.serie).filter((s) => s.tipo !== 'riscaldamento');
  const volume = lavoro.reduce((t, s) => (s.kg !== null && s.ripetizioni !== null ? t + s.kg * s.ripetizioni : t), 0);

  return {
    fonte: 'hevy', idFonte: String(w.id), data: dataDaIso(inizio),
    inizio, fine,
    tipo: 'palestra', tipoOriginale: null, nome: testo(w.title) || null,
    durataAttivaMin: Math.round(ms / 60000),
    fcMedia: null, zoneMin: null, calorie: null, passi: null, distanzaM: null, dislivelloM: null, gps: false,
    idRoutine: w.routine_id ?? null,
    descrizione: testo(w.description),
    esercizi,
    serieTotali: lavoro.length,
    volumeKg: Math.round(volume),
    eliminata: false,
    aggiornatoIl: w.updated_at ?? null,
  };
}

/** Un'operazione per allenamento: vale l'evento più recente (a parità, l'ultimo ricevuto). */
export function operazioniDaEventi(eventi, { adesso = new Date() } = {}) {
  const ultimi = new Map();
  let scartate = 0;
  for (const ev of eventi ?? []) {
    let id = null;
    let istante = null;
    if (ev?.type === 'updated' && ev.workout?.id) {
      id = String(ev.workout.id);
      istante = Date.parse(ev.workout.updated_at);
    } else if (ev?.type === 'deleted' && ev.id) {
      id = String(ev.id);
      // Senza un istante valido la cancellazione vale "adesso": non deve mai perdere contro una modifica.
      istante = Date.parse(ev.deleted_at);
      if (!Number.isFinite(istante)) istante = adesso.getTime();
    } else {
      scartate++;
      continue;
    }
    const t = Number.isFinite(istante) ? istante : -Infinity;
    const prec = ultimi.get(id);
    // A parità di istante vince l'ultimo ricevuto (spec §5.2).
    if (!prec || t >= prec.t) ultimi.set(id, { ev, t });
  }

  const operazioni = [];
  const conteggi = { sessioni: 0, eliminate: 0, scartate };
  for (const [id, { ev }] of ultimi) {
    if (ev.type === 'deleted') {
      operazioni.push({ op: 'update', collection: 'sessioni', doc_id: `hevy_${id}`,
        data: { fonte: 'hevy', idFonte: id, eliminata: true, aggiornatoIl: ev.deleted_at ?? adesso.toISOString() } });
      conteggi.eliminate++;
      continue;
    }
    const doc = sessioneDaWorkout(ev.workout);
    if (!doc) { conteggi.scartate++; continue; }
    operazioni.push({ op: 'set', collection: 'sessioni', doc_id: `hevy_${id}`, data: doc });
    conteggi.sessioni++;
  }
  return { operazioni, conteggi };
}

/** Documento `hevy/catalogo`: forma compatta, senza miniature, ordinata per nome. */
export function catalogoCompatto(templates, { adesso }) {
  const esercizi = (templates ?? []).filter((t) => t?.id).map((t) => ({
    id: String(t.id),
    nome: testo(t.title),
    gruppo: t.primary_muscle_group ?? null,
    secondari: Array.isArray(t.secondary_muscle_groups) ? t.secondary_muscle_groups : [],
    attrezzo: t.equipment ?? null,
    tipo: t.type ?? null,
    personalizzato: t.is_custom === true,
  }));
  esercizi.sort((a, b) => a.nome.localeCompare(b.nome, 'en'));
  return { aggiornatoIl: adesso.toISOString(), esercizi };
}
