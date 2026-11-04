import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaIniziale, salvaVista } from '../src/logic/vista.js';

const mem = (iniziale) => { const m = new Map(Object.entries(iniziale)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const rotta = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('vistaIniziale', () => {
  assert.equal(vistaIniziale({ isOwner: true, storage: null }), 'cliente');
  assert.equal(vistaIniziale({ isOwner: false, storage: null }), 'trainer');
  assert.equal(vistaIniziale({ isOwner: true, storage: rotta }), 'cliente');
  assert.equal(vistaIniziale({ isOwner: true, storage: mem({ 'pannello.vista': 'trainer' }) }), 'trainer');
  assert.equal(vistaIniziale({ isOwner: false, storage: mem({ 'pannello.vista': 'boh' }) }), 'trainer');
});

test('salvaVista', () => {
  assert.doesNotThrow(() => salvaVista(rotta, 'cliente'));
  const m = mem({}); salvaVista(m, 'trainer'); assert.equal(m.getItem('pannello.vista'), 'trainer');
});
