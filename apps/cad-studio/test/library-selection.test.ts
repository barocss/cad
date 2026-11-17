import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCadLibrary } from '@barocss/cad';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { libraries, libraryEntry, registerLibrary, setLibraryStore, unregisterLibrary } from '@barocss/cad-model/library/libraries';
import { insertDisplayedLibraryPart } from '../src/state/librarySelection';

const ID = 'selection-test-spacers';
const manifest = (height: number) => ({
  format: 'barocss-cad-library', version: 1, id: ID, name: 'Spacers', libraryVersion: '1.0.0', units: 'mm', license: 'MIT',
  parts: [{ id: 'spacer', name: 'Spacer', parameters: { h: { value: height, unit: 'mm', estimate: true } },
    variants: [{ id: height === 8 ? 'old-only' : 'new-only', values: { h: height + 2 } }],
    recipe: [{ id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 5 }, { id: 'e', kind: 'extrude', sketch: 's', height: { expr: 'h' } }] }],
});
function fixture() {
  let bytes = '', writes = 0;
  setLibraryStore({ getItem: () => bytes || null, setItem: (_key, value) => { bytes = value; writes++; } });
  const embedded = [{ library: loadCadLibrary(manifest(8)).manifest, authoredBy: 'agent' as const, confirmed: false }];
  const doc: StudioDoc = { ...emptyDoc(), libraries: embedded, nodes: [{ id: 'n0', kind: 'sketch', plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }, profile: 'circle', center: [2, 3], radius: 1 }],
    instances: [{ id: 'p1', name: 'Existing', doc: emptyDoc(), position: [11, 12, 13], rotation: [0, 0, 25] }] };
  registerLibrary(manifest(12), 'user');
  const entry = libraryEntry(ID)!;
  const snapshot = () => ({ bytes, writes, entries: libraries(), registry: JSON.stringify(libraries()), doc: JSON.stringify(doc) });
  return { doc, entry, snapshot, cleanup: () => { setLibraryStore(null); unregisterLibrary(ID); } };
}

test('stale displayed entry refuses both actions before any document, registry or store change, even same ID/version', () => {
  const f = fixture();
  try {
    registerLibrary(manifest(14), 'user');
    const before = f.snapshot();
    for (const place of [false, true]) assert.deepEqual(insertDisplayedLibraryPart(f.doc, f.entry, 'spacer', undefined, place), { ok: false, reason: 'changed' });
    assert.deepEqual(f.snapshot(), before);
    before.entries.forEach((entry, index) => assert.equal(libraries()[index], entry));
  } finally { f.cleanup(); }
});

test('Insert and Place use displayed B features/provenance and B-only variant while preserving embedded A metadata and existing placement', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    for (const place of [false, true]) for (const variant of [undefined, 'new-only']) {
      const result = insertDisplayedLibraryPart(f.doc, f.entry, 'spacer', variant, place);
      assert.ok(result.ok);
      const next = result.doc;
      assert.equal(next.libraries, f.doc.libraries);
      assert.equal(next.nodes[0], f.doc.nodes[0]);
      assert.equal(next.instances![0], f.doc.instances![0]);
      const node = place ? next.instances!.at(-1)!.doc.nodes[0] : next.nodes.at(-1)!;
      assert.equal(node.kind, 'library');
      if (node.kind !== 'library') throw new Error('expected library node');
      assert.equal(node.library.library, ID);
      assert.equal(node.library.variant, variant);
      assert.equal(node.library.values.h, variant ? 14 : 12);
      const extrude = node.features.find(feature => feature.kind === 'extrude');
      assert.ok(extrude && extrude.kind === 'extrude');
      assert.equal(extrude.height, variant ? 14 : 12);
      assert.equal(f.entry.license, 'MIT');
      assert.equal(f.entry.estimates, 1);
      assert.equal(f.entry.authoredBy, 'person');
      assert.equal(f.entry.confirmed, true);
    }
    assert.deepEqual(f.snapshot(), before);
  } finally { f.cleanup(); }
});

test('missing part and variant throw without changing document, exact registry entries or store', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    for (const place of [false, true]) {
      assert.throws(() => insertDisplayedLibraryPart(f.doc, f.entry, 'missing', undefined, place));
      assert.throws(() => insertDisplayedLibraryPart(f.doc, f.entry, 'spacer', 'old-only', place));
    }
    assert.deepEqual(f.snapshot(), before);
    before.entries.forEach((entry, index) => assert.equal(libraries()[index], entry));
  } finally { f.cleanup(); }
});

test('registration policy separately preserves built-ins and rejects malformed replacements before store writes', () => {
  const f = fixture();
  try {
    const before = f.snapshot(), builtin = libraryEntry('tslot-20');
    assert.throws(() => registerLibrary({ ...manifest(12), id: 'tslot-20' }, 'user'));
    assert.throws(() => registerLibrary({ ...manifest(12), parts: null }, 'user'));
    assert.equal(libraryEntry('tslot-20'), builtin);
    assert.equal(libraryEntry(ID), f.entry);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.cleanup(); }
});

test('unavailable store does not claim persistence: session registration and exact selection still work', () => {
  const f = fixture();
  try {
    const stored = f.snapshot(); let attempts = 0;
    setLibraryStore({ getItem: () => stored.bytes, setItem: () => { attempts++; throw new Error('unavailable'); } });
    registerLibrary(manifest(16), 'user');
    assert.equal(attempts, 1);
    const entry = libraryEntry(ID)!;
    assert.notEqual(entry, f.entry);
    const result = insertDisplayedLibraryPart(f.doc, entry, 'spacer', undefined, false);
    assert.ok(result.ok);
    const node = result.doc.nodes.at(-1)!;
    assert.ok(node.kind === 'library');
    assert.equal(node.library.values.h, 16);
    assert.equal(attempts, 1);
    assert.equal(f.snapshot().bytes, stored.bytes);
    assert.equal(f.snapshot().doc, stored.doc);
  } finally { f.cleanup(); }
});
