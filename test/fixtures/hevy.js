// Fixture con i campi dell'API Hevy visti nello spike (routine) e nella
// documentazione (workout, eventi). Nessun dato reale.

export function serie({ index = 0, type = 'normal', weight_kg = null, reps = null, distance_meters = null, duration_seconds = null, rpe = null } = {}) {
  return { index, type, weight_kg, reps, distance_meters, duration_seconds, rpe, custom_metric: null };
}

export function esercizio({ index = 0, title = 'Bench Press (Barbell)', exercise_template_id = 'T1', superset_id = null, notes = '', sets = [serie()] } = {}) {
  return { index, title, notes, exercise_template_id, superset_id, sets };
}

export function workout({
  id = 'w1', title = 'Spinta A', description = '', routine_id = 'r1',
  inizio = '2026-11-04T06:35:00Z', fine = '2026-11-04T07:30:00Z', aggiornato = '2026-11-04T07:31:00Z',
  esercizi = [esercizio()],
} = {}) {
  return {
    id, title, description, routine_id,
    start_time: inizio, end_time: fine, updated_at: aggiornato, created_at: aggiornato,
    exercises: esercizi,
  };
}

export const evento = {
  aggiornato: (w) => ({ type: 'updated', workout: w }),
  cancellato: (id, quando) => ({ type: 'deleted', id, deleted_at: quando }),
};

export function template({ id = 'T1', title = 'Bench Press (Barbell)', type = 'weight_reps', primary_muscle_group = 'chest',
  secondary_muscle_groups = ['triceps'], equipment = 'barbell', is_custom = false } = {}) {
  return { id, title, type, primary_muscle_group, secondary_muscle_groups, equipment, is_custom, thumbnail_url: 'https://esempio.invalid/t.jpg' };
}
