import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// store.js talks to localStorage; give it a minimal in-memory one.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const { noteFor, setNote, spotNotes, noteCount, exportBundle, importBundle } =
  await import('../src/model/store.js');

beforeEach(() => mem.clear());

test('a note round-trips and is trimmed', () => {
  assert.equal(noteFor('spot-1'), null);
  setNote('spot-1', '  Park at the second pullout; gate locked after dusk.  ');
  assert.equal(noteFor('spot-1'), 'Park at the second pullout; gate locked after dusk.');
  assert.equal(noteCount(), 1);
});

test('an empty note clears rather than storing blanks', () => {
  setNote('spot-1', 'something');
  assert.equal(setNote('spot-1', '   '), null);
  assert.equal(noteFor('spot-1'), null);
  assert.equal(noteCount(), 0);
  assert.deepEqual(spotNotes(), {});
});

test('notes are capped so one entry cannot blow the storage quota', () => {
  setNote('spot-1', 'x'.repeat(5000));
  assert.equal(noteFor('spot-1').length, 2000);
});

test('notes travel in the backup bundle', () => {
  setNote('spot-1', 'best at 7am');
  const bundle = exportBundle();
  assert.deepEqual(bundle.notes, { 'spot-1': 'best at 7am' });
  mem.clear(); // a fresh device
  const res = importBundle(bundle);
  assert.equal(res.ok, true);
  assert.equal(res.notes, 1);
  assert.equal(noteFor('spot-1'), 'best at 7am');
});

test('importing never overwrites a note already written on THIS device', () => {
  setNote('spot-1', 'mine, written here');
  const res = importBundle({
    app: 'photo-pointer', version: 1, userPins: [],
    notes: { 'spot-1': 'from the old backup', 'spot-2': 'new one' },
  });
  assert.equal(res.ok, true);
  assert.equal(noteFor('spot-1'), 'mine, written here'); // local wins
  assert.equal(noteFor('spot-2'), 'new one');            // absent one is taken
  assert.equal(res.notes, 1);
});

test('a bundle with no notes (an older backup) imports cleanly', () => {
  setNote('spot-1', 'keep me');
  const res = importBundle({ app: 'photo-pointer', version: 1, userPins: [] });
  assert.equal(res.ok, true);
  assert.equal(noteFor('spot-1'), 'keep me');
});

test('corrupt stored notes degrade to empty instead of throwing', () => {
  mem.set('pointer.notes', '["not","an","object"]');
  assert.deepEqual(spotNotes(), {});
  assert.equal(noteFor('spot-1'), null);
});
