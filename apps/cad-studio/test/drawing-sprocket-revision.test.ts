import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { modelPrint, defaultDrawing } from '@barocss/cad-model/drawing/types';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { drawingRevisionPrint } from '../src/ui/drawing/revisionPrint';
const fixture = (): StudioDoc => ({ ...emptyDoc(), nextId: 2,
  nodes: [{ kind: 'sprocket', row: 'chain-a', teeth: 17, tip: 75, width: 7, seat: 8.8, bore: 20, center: [0, 0], generator: 'sprocket@0' }],
  drives: { version: 1, rows: [{ kind: 'chain', id: 'chain-a', pitch: 12.7, rollerDiameter: 8.51, innerWidth: 7.75, plateHeight: 11.8, estimate: true }] } });
const row = (d: StudioDoc, patch: Record<string, unknown>) => { d.drives!.rows = d.drives!.rows.map(r => ({ ...r, ...patch })); };
const volume = (d: StudioDoc) => { const e = evaluateDoc(d, 1); assert.ok(e.ok); return e.bodies.reduce((sum, b) => sum + b.volume!, 0); };

test('used chain pitch changes sprocket volume and stamp, not the input document', () => {
  const a = fixture(), before = structuredClone(a), b = structuredClone(a); row(b, { pitch: 12.8 });
  assert.ok(Math.abs(volume(a) - 21697.229985369377) < 1e-6);
  assert.ok(Math.abs(volume(b) - 22065.282702881625) < 1e-6);
  assert.notEqual(drawingRevisionPrint(a), drawingRevisionPrint(b));
  assert.deepEqual(a, before);
});

test('explicit seat ignores report-only roller changes; implicit seat consumes them', () => {
  const a = fixture(), b = structuredClone(a); row(b, { rollerDiameter: 8.6 });
  assert.equal(volume(a), volume(b));
  assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
  for (const d of [a, b]) { const n = d.nodes[0]; assert.equal(n.kind, 'sprocket'); if (n.kind === 'sprocket') delete n.seat; }
  assert.notEqual(volume(a), volume(b));
  assert.notEqual(drawingRevisionPrint(a), drawingRevisionPrint(b));
});

test('metadata, unused row and non-geometric chain dimensions do not invalidate', () => {
  const a = fixture(), b = structuredClone(a); row(b, { innerWidth: 9, plateHeight: 13, source: 'Synthetic citation', estimate: undefined });
  b.drives!.rows.push({ ...b.drives!.rows[0], id: 'unused' });
  assert.equal(volume(a), volume(b));
  assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
});

test('only active sprockets reserve rows; mixed consumers include implicit seats and use last-row lookup', () => {
  const a = fixture(); a.nodes[0] = { ...a.nodes[0], suppressed: true };
  const b = structuredClone(a); row(b, { pitch: 12.8 });
  assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
  const shared = fixture(), n = shared.nodes[0]; assert.ok(n.kind === 'sprocket');
  shared.nodes.push({ ...n, center: [100, 0], seat: undefined });
  const changed = structuredClone(shared); row(changed, { rollerDiameter: 8.6 });
  assert.notEqual(drawingRevisionPrint(shared), drawingRevisionPrint(changed));
  const duplicate = fixture(); duplicate.drives!.rows.unshift({ ...duplicate.drives!.rows[0], kind: 'chain', pitch: 12.8, rollerDiameter: 8.51 });
  assert.equal(drawingRevisionPrint(fixture()), drawingRevisionPrint(duplicate));
  duplicate.drives!.rows.reverse(); assert.notEqual(drawingRevisionPrint(fixture()), drawingRevisionPrint(duplicate));
});

test('ordinary legacy stamps stay exact; prior sprocket issue survives native Open until explicit reissue', async () => {
  const normalized = await readStudioFile(encodeStudioFile(fixture())); assert.ok('doc' in normalized);
  const a = normalized.doc, legacy = modelPrint(a.nodes), doc = { ...a, drawing: { ...defaultDrawing(), revision: 'A', revisedModel: legacy } }, before = structuredClone(doc);
  assert.notEqual(drawingRevisionPrint(doc), legacy);
  const opened = await readStudioFile(encodeStudioFile(doc)); assert.ok('doc' in opened);
  assert.equal(opened.doc.drawing!.revisedModel, legacy);
  assert.equal(drawingRevisionPrint(opened.doc), drawingRevisionPrint(doc));
  assert.deepEqual(doc, before);
  const plain = emptyDoc(); assert.equal(drawingRevisionPrint(plain), modelPrint(plain.nodes));
});
