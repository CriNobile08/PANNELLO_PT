import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessioneDaWorkout, operazioniDaEventi, catalogoCompatto } from '../src/sync/hevy/normalizza.js';
import { workout, esercizio, serie, evento, template } from './fixtures/hevy.js';

test('documento completo', () => {
  const w = workout({
    esercizi: [
      esercizio({ index: 0, title: 'Bench Press (Barbell)', exercise_template_id: 'T1', notes: 'gomiti stretti',
        sets: [serie({ index: 0, weight_kg: 60, reps: 8, rpe: 8 })] }),
      esercizio({ index: 1, title: 'Push Up', exercise_template_id: 'T2', superset_id: 1, notes: null,
        sets: [serie({ index: 0, reps: 15 })] }),
    ],
  });
  assert.deepEqual(sessioneDaWorkout(w), {
    fonte: 'hevy', idFonte: 'w1', data: '2026-11-04',
    inizio: '2026-11-04T06:35:00Z', fine: '2026-11-04T07:30:00Z',
    tipo: 'palestra', tipoOriginale: null, nome: 'Spinta A',
    durataAttivaMin: 55,
    fcMedia: null, zoneMin: null, calorie: null, passi: null, distanzaM: null, dislivelloM: null, gps: false,
    idRoutine: 'r1', descrizione: '',
    esercizi: [
      { ordine: 0, nome: 'Bench Press (Barbell)', idTemplate: 'T1', idSuperserie: null, note: 'gomiti stretti',
        serie: [{ ordine: 0, tipo: 'normale', kg: 60, ripetizioni: 8, durataSec: null, distanzaM: null, rpe: 8 }] },
      { ordine: 1, nome: 'Push Up', idTemplate: 'T2', idSuperserie: 1, note: '',
        serie: [{ ordine: 0, tipo: 'normale', kg: null, ripetizioni: 15, durataSec: null, distanzaM: null, rpe: null }] },
    ],
    serieTotali: 2, volumeKg: 480, eliminata: false, aggiornatoIl: '2026-11-04T07:31:00Z',
  });
});

test('routine e descrizione assenti', () => {
  const w = workout();
  delete w.routine_id;
  w.description = null;
  const s = sessioneDaWorkout(w);
  assert.equal(s.idRoutine, null);
  assert.equal(s.descrizione, '');
});

test('tipi di serie', () => {
  const tipi = ['warmup', 'normal', 'failure', 'dropset', 'boh', undefined];
  const w = workout({ esercizi: [esercizio({ sets: tipi.map((type, index) => serie({ index, type })) })] });
  assert.deepEqual(sessioneDaWorkout(w).esercizi[0].serie.map((s) => s.tipo),
    ['riscaldamento', 'normale', 'cedimento', 'drop', 'normale', 'normale']);
});

test('volume e serie totali', () => {
  const w = workout({ esercizi: [esercizio({ sets: [
    serie({ index: 0, type: 'warmup', weight_kg: 40, reps: 10 }),
    serie({ index: 1, weight_kg: 60, reps: 8 }),
    serie({ index: 2, weight_kg: 60, reps: 8 }),
    serie({ index: 3, type: 'failure', weight_kg: 60, reps: 6 }),
  ] })] });
  const s = sessioneDaWorkout(w);
  assert.equal(s.serieTotali, 3);
  assert.equal(s.volumeKg, 1320);
});

test('volume con valori nulli', () => {
  const w = workout({ esercizi: [esercizio({ sets: [
    serie({ index: 0, reps: 15 }),
    serie({ index: 1, duration_seconds: 45 }),
    serie({ index: 2, distance_meters: '400' }),
  ] })] });
  const s = sessioneDaWorkout(w);
  assert.equal(s.volumeKg, 0);
  assert.equal(s.serieTotali, 3);
  const [a, b, c] = s.esercizi[0].serie;
  assert.equal(a.kg, null);
  assert.equal(b.durataSec, 45);
  assert.equal(c.distanzaM, 400);
});

test('numeri come stringa', () => {
  const w = workout({ esercizi: [esercizio({ sets: [serie({ weight_kg: '62.5', reps: '5' })] })] });
  const [s] = sessioneDaWorkout(w).esercizi[0].serie;
  assert.equal(s.kg, 62.5);
  assert.equal(s.ripetizioni, 5);
  assert.equal(sessioneDaWorkout(w).volumeKg, 313);
});

test('ordine', () => {
  const w = workout({ esercizi: [
    esercizio({ index: 1, title: 'B', sets: [serie({ index: 1, reps: 2 }), serie({ index: 0, reps: 1 })] }),
    esercizio({ index: 0, title: 'A' }),
  ] });
  const s = sessioneDaWorkout(w);
  assert.deepEqual(s.esercizi.map((e) => e.nome), ['A', 'B']);
  assert.deepEqual(s.esercizi[1].serie.map((x) => x.ripetizioni), [1, 2]);
});

test('mezzanotte', () => {
  assert.equal(sessioneDaWorkout(workout({ inizio: '2026-11-04T22:30:00Z', fine: '2026-11-04T22:50:00Z' })).data, '2026-11-04');
  assert.equal(sessioneDaWorkout(workout({ inizio: '2026-11-04T23:30:00Z', fine: '2026-11-05T00:30:00Z' })).data, '2026-11-05');
});

test("cambio d'ora", () => {
  // 25/10/2026: alle 03:00 CEST gli orologi tornano alle 02:00 CET.
  const s = sessioneDaWorkout(workout({ inizio: '2026-10-25T00:30:00Z', fine: '2026-10-25T01:30:00Z' }));
  assert.equal(s.data, '2026-10-25');
  assert.equal(s.durataAttivaMin, 60);
});

test('senza fine o durata non positiva', () => {
  assert.equal(sessioneDaWorkout(workout({ fine: null })), null);
  assert.equal(sessioneDaWorkout(workout({ inizio: null })), null);
  assert.equal(sessioneDaWorkout(workout({ fine: '2026-11-04T06:35:00Z' })), null);
  const r = operazioniDaEventi([evento.aggiornato(workout({ fine: null }))]);
  assert.deepEqual(r, { operazioni: [], conteggi: { sessioni: 0, eliminate: 0, scartate: 1 } });
});

test('aggiornato', () => {
  const r = operazioniDaEventi([evento.aggiornato(workout())]);
  assert.equal(r.operazioni.length, 1);
  const [o] = r.operazioni;
  assert.equal(o.op, 'set');
  assert.equal(o.collection, 'sessioni');
  assert.equal(o.doc_id, 'hevy_w1');
  assert.deepEqual(o.data, sessioneDaWorkout(workout()));
  assert.deepEqual(r.conteggi, { sessioni: 1, eliminate: 0, scartate: 0 });
});

test('cancellato', () => {
  const r = operazioniDaEventi([evento.cancellato('X', '2026-11-04T09:00:00Z')]);
  assert.deepEqual(r.operazioni, [{ op: 'update', collection: 'sessioni', doc_id: 'hevy_X',
    data: { fonte: 'hevy', idFonte: 'X', eliminata: true, aggiornatoIl: '2026-11-04T09:00:00Z' } }]);
  assert.deepEqual(r.conteggi, { sessioni: 0, eliminate: 1, scartate: 0 });
});

test('cancellato senza deleted_at usa adesso', () => {
  const r = operazioniDaEventi([{ type: 'deleted', id: 'X' }], { adesso: new Date('2026-11-04T10:00:00Z') });
  assert.equal(r.operazioni[0].data.aggiornatoIl, '2026-11-04T10:00:00.000Z');
});

test('modificato poi cancellato', () => {
  const r = operazioniDaEventi([
    evento.aggiornato(workout({ id: 'w1', aggiornato: '2026-11-04T10:00:00Z' })),
    evento.cancellato('w1', '2026-11-04T11:00:00Z'),
  ]);
  assert.equal(r.operazioni.length, 1);
  assert.equal(r.operazioni[0].op, 'update');
  assert.equal(r.operazioni[0].data.eliminata, true);
  assert.deepEqual(r.conteggi, { sessioni: 0, eliminate: 1, scartate: 0 });
});

test('due modifiche: vince la più recente anche se arriva prima', () => {
  const r = operazioniDaEventi([
    evento.aggiornato(workout({ title: 'Nuovo', aggiornato: '2026-11-04T12:00:00Z' })),
    evento.aggiornato(workout({ title: 'Vecchio', aggiornato: '2026-11-04T10:00:00Z' })),
  ]);
  assert.equal(r.operazioni.length, 1);
  assert.equal(r.operazioni[0].data.nome, 'Nuovo');
});

test('a parità di istante vince l\'ultimo', () => {
  const r = operazioniDaEventi([
    evento.aggiornato(workout({ title: 'Primo' })),
    evento.aggiornato(workout({ title: 'Secondo' })),
  ]);
  assert.equal(r.operazioni[0].data.nome, 'Secondo');
});

test('evento sconosciuto', () => {
  const r = operazioniDaEventi([{ type: 'boh' }, { type: 'updated' }, { type: 'deleted' }, null]);
  assert.deepEqual(r, { operazioni: [], conteggi: { sessioni: 0, eliminate: 0, scartate: 4 } });
});

test('catalogo', () => {
  const t = template({ id: 'T3', title: 'Squat (Barbell)', primary_muscle_group: 'quadriceps' });
  delete t.secondary_muscle_groups;
  const c = catalogoCompatto([template({ id: 'T2', title: 'Push Up', type: 'reps_only', equipment: 'none' }), t, template()],
    { adesso: new Date('2026-11-04T05:52:00Z') });
  assert.equal(c.aggiornatoIl, '2026-11-04T05:52:00.000Z');
  assert.deepEqual(c.esercizi.map((e) => e.nome), ['Bench Press (Barbell)', 'Push Up', 'Squat (Barbell)']);
  assert.deepEqual(c.esercizi[0], { id: 'T1', nome: 'Bench Press (Barbell)', gruppo: 'chest', secondari: ['triceps'], attrezzo: 'barbell', tipo: 'weight_reps', personalizzato: false });
  assert.deepEqual(c.esercizi[2].secondari, []);
  assert.ok(!JSON.stringify(c).includes('thumbnail'));
});

test('cancellazione senza deleted_at vince su una modifica precedente', () => {
  const r = operazioniDaEventi([
    evento.aggiornato(workout({ id: 'a', aggiornato: '2026-11-04T10:00:00Z' })),
    { type: 'deleted', id: 'a' },
  ], { adesso: new Date('2026-11-04T12:00:00Z') });
  assert.equal(r.operazioni.length, 1);
  assert.equal(r.operazioni[0].op, 'update');
  assert.equal(r.operazioni[0].data.eliminata, true);
});
