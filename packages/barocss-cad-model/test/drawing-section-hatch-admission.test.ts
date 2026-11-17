import test from 'node:test';
import { changeDrawingScope, drawingScopeOf } from '../src/drawing/scope';
import { withManufacturingDrawing } from '../src/drawing/options';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { assertSavedDrawingDocument } from '../src/engine/savedDrawing';
import { readStudioDoc } from '../src/engine/migrate';
import { encodeStudioFile, readStudioFile, encodeStudioSnapshot, readStudioSnapshot } from '../src/engine/container';
import { snapshotKeyOf } from '../src/versions/log';
import { isRefusal } from '../src/engine/refusal';
import { checkSavedSectionHatch } from '../src/drawing/savedSectionHatch';
import { defaultDrawing, readDrawing, sectionsOf } from '../src/drawing/types';
const a = { id: 'A', view: 'front', at: 5, hideHatch: true };
const doc = (drawing: unknown): StudioDoc => ({ ...emptyDoc(), drawing } as StudioDoc);
const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));

test('supported saved flags survive file and raw snapshot admission without mutation', async () => {
  for (const drawing of [{ ...defaultDrawing(), section: { y: 5 } }, { ...defaultDrawing(), sections: [a] },
    { ...defaultDrawing(), scope: { kind: 'part' }, sections: [a, { ...a, id: 'B', view: 'top', at: -4 }], sheets: [{ id: 's2', views: ['top'] }] }]) {
    const input = doc(drawing), before = structuredClone(input), key = snapshotKeyOf(input);
    assert.deepEqual(checkSavedSectionHatch(drawing), []);
    const opened = await readStudioFile(encodeStudioFile(input)); assert.ok('doc' in opened); assert.deepEqual(opened.doc.drawing, drawing);
    const restored = await readStudioSnapshot(encodeStudioSnapshot(input, key), key); assert.ok('doc' in restored); assert.deepEqual(restored.doc, input);
    assert.deepEqual(input, before);
  }
});

test('explicit unsupported fields refuse before permissive normalization, Save and snapshot', async () => {
  const bad: unknown[] = [
    ...[false, null, 1, 'true'].map(hideHatch => ({ sections: [{ ...a, hideHatch }] })),
    ...[{ dir: [1, 0, 0] }, { half: {} }, { steps: [] }, { along: 'vertical' }, { removed: {} }, { revolved: true }].map(form => ({ sections: [{ ...a, ...form }] })),
    ...[{ id: 'invalid' }, { view: 'iso' }, { at: null }].map(change => ({ sections: [{ ...a, ...change }] })),
    { sections: [a, { ...a, hideHatch: undefined }] }, { sections: a }, { section: { y: 5, hideHatch: true } }, { hideHatch: true },
    { sections: [a], scope: { kind: 'assembly' } }, { sections: [a], scope: null }, { sections: [a], balloons: true },
    { sections: [a], tables: [{ id: 'bom', from: 'bom' }] },
  ];
  for (const drawing of bad) {
    const input = doc(drawing), before = structuredClone(input), key = snapshotKeyOf(input);
    assert.equal(checkSavedSectionHatch(drawing)[0]?.code, 'DRAWING_OPTIONS', JSON.stringify(drawing));
    assert.throws(() => encodeStudioFile(input), e => isRefusal(e, 'DRAWING_OPTIONS'));
    assert.throws(() => encodeStudioSnapshot(input, key), e => isRefusal(e, 'DRAWING_OPTIONS'));
    const opened = await readStudioFile(bytes(input)); assert.ok('error' in opened); assert.match(opened.error, /DRAWING_OPTIONS/);
    const restored = await readStudioSnapshot(bytes(input), key); assert.ok('error' in restored);
    assert.deepEqual(input, before);
  }
});

test('nested instances and pending parts use the same raw admission boundary', () => {
  const bad = doc({ sections: [{ ...a, hideHatch: false }] });
  for (const input of [
    { ...emptyDoc(), instances: [{ id: 'p', doc: bad }] },
    { ...emptyDoc(), pendingParts: { p: { doc: bad } } },
  ]) {
    const before = structuredClone(input);
    assert.throws(() => assertSavedDrawingDocument(input), e => isRefusal(e, 'DRAWING_OPTIONS'));
    const read = readStudioDoc(JSON.stringify(input)); assert.ok('error' in read); assert.match(read.error, /DRAWING_OPTIONS/);
    assert.deepEqual(input, before);
  }
});

test('omitted fields retain previous permissive policy; raw reader itself is unchanged', () => {
  for (const drawing of [{ sections: [{ id: 'bad', view: 'iso' }] }, { section: { y: 5 } }, { scope: { kind: 'assembly' }, sections: [{ id: 'A', view: 'front', at: 5 }] }]) {
    assert.deepEqual(checkSavedSectionHatch(drawing), []);
    assert.doesNotThrow(() => assertSavedDrawingDocument(doc(drawing)));
  }
  assert.equal(sectionsOf(readDrawing({ sections: [{ ...a, hideHatch: false }] }))[0].hideHatch, undefined);
  assert.deepEqual(checkSavedSectionHatch({ scope: { kind: 'part' }, balloons: true, sections: [a] }), [], 'explicit part overrides legacy BOM scope');
});

test('scope changes refuse hidden assembly atomically; explicit restoration permits the change', () => {
  const hidden = { ...defaultDrawing(), sections: [{ ...a, view: 'front' as const, hideHatch: true as const }] };
  const before = structuredClone(hidden);
  assert.throws(() => changeDrawingScope(hidden, { kind: 'assembly' }), e => isRefusal(e, 'DRAWING_OPTIONS'));
  assert.deepEqual(hidden, before);
  const shown = withManufacturingDrawing(hidden, { sections: [{ id: 'A', view: 'front', at: 5 }] });
  assert.equal(changeDrawingScope(shown, { kind: 'assembly' }).scope?.kind, 'assembly');
  assert.deepEqual(hidden, before);
});

test('final command settings reject explicit and implicit assembly, preserving part overrides and atomic recovery', () => {
  const hidden = { ...defaultDrawing(), sections: [{ ...a, view: 'front' as const, hideHatch: true as const }] };
  const assembly = { ...defaultDrawing(), scope: { kind: 'assembly' as const } };
  assert.throws(() => withManufacturingDrawing(assembly, { sections: [a] }), e => isRefusal(e, 'DRAWING_OPTIONS'));
  assert.deepEqual(assembly, { ...defaultDrawing(), scope: { kind: 'assembly' } });
  for (const patch of [{ balloons: true }, { tables: [{ id: 'bom', from: 'bom' }] }]) {
    const before = structuredClone(hidden);
    assert.throws(() => withManufacturingDrawing(hidden, patch), e => isRefusal(e, 'DRAWING_OPTIONS'));
    assert.deepEqual(hidden, before);
    const explicit = { ...hidden, scope: { kind: 'part' as const } };
    assert.equal(withManufacturingDrawing(explicit, patch).sections?.[0].hideHatch, true);
    const restored = withManufacturingDrawing(hidden, { ...patch, sections: [{ id: 'A', view: 'front', at: 5 }] });
    assert.equal(drawingScopeOf(restored).kind, 'assembly');
    assert.doesNotThrow(() => encodeStudioFile(doc(restored)));
  }
});
