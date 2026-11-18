import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { modelPrint, defaultDrawing } from '@barocss/cad-model/drawing/types';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { drawingRevisionPrint } from '../src/ui/drawing/revisionPrint';
const fixture = (): StudioDoc => ({ ...emptyDoc(), nextId: 2,
  nodes: [{ kind: 'pulley', row: 'v-a', diameter: 80, grooves: 2, bore: 12, center: [0, 0], generator: 'pulley@0' }],
  drives: { version: 1, rows: [{ kind: 'v-belt', id: 'v-a', angle: 38, datumWidth: 8.5, aboveDatum: 2, belowDatum: 9, spacing: 12, edge: 8, thickness: 8, estimate: true }] } });
const row = (d: StudioDoc, patch: Record<string, unknown>) => { d.drives!.rows = d.drives!.rows.map(r => ({ ...r, ...patch })); };
const volume = (d: StudioDoc) => { const e = evaluateDoc(d, 1); assert.ok(e.ok); return e.bodies.reduce((sum, b) => sum + b.volume!, 0); };

test('used V outer radius changes pulley volume and stamp, not the input document', () => {
  const a = fixture(), before = structuredClone(a), b = structuredClone(a); row(b, { aboveDatum: 3 });
  assert.ok(Math.abs(volume(a) - 120317.96473210932) < 1e-6);
  assert.ok(Math.abs(volume(b) - 122335.15616986172) < 1e-6);
  assert.notEqual(drawingRevisionPrint(a), drawingRevisionPrint(b));
  assert.deepEqual(a, before);
});

test('all consumed V section fields affect geometry and stamp', () => {
  const a = fixture();
  for (const change of [{ angle: 40 }, { datumWidth: 8.7 }, { aboveDatum: 3 }, { belowDatum: 8 }, { edge: 9 }, { spacing: 13 }]) {
    const b = structuredClone(a); row(b, change);
    assert.notEqual(volume(a), volume(b)); assert.notEqual(drawingRevisionPrint(a), drawingRevisionPrint(b));
  }
});

test('metadata, unused row and belt thickness do not invalidate', () => {
  const a = fixture(), b = structuredClone(a); row(b, { thickness: 3, source: 'Synthetic citation', estimate: undefined });
  b.drives!.rows.push({ ...b.drives!.rows[0], id: 'unused' });
  assert.equal(volume(a), volume(b));
  assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
});

test('suppressed pulley does not consume rows; last duplicate row wins', () => {
  const a = fixture(); a.nodes[0] = { ...a.nodes[0], suppressed: true };
  const b = structuredClone(a); row(b, { aboveDatum: 3 });
  assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
  const c = fixture(), changed = fixture(); row(changed, { aboveDatum: 3 });
  c.drives!.rows.unshift(changed.drives!.rows[0]);
  assert.equal(drawingRevisionPrint(c), drawingRevisionPrint(fixture()));
  c.drives!.rows.reverse(); assert.notEqual(drawingRevisionPrint(c), drawingRevisionPrint(fixture()));
});

test('ordinary legacy stamps stay exact; prior pulley issue survives native Open until explicit reissue', async () => {
  const normalized = await readStudioFile(encodeStudioFile(fixture())); assert.ok('doc' in normalized);
  const a = normalized.doc, legacy = modelPrint(a.nodes), doc = { ...a, drawing: { ...defaultDrawing(), revision: 'A', revisedModel: legacy } }, before = structuredClone(doc);
  assert.notEqual(drawingRevisionPrint(doc), legacy);
  const opened = await readStudioFile(encodeStudioFile(doc)); assert.ok('doc' in opened);
  assert.equal(opened.doc.drawing!.revisedModel, legacy);
  assert.equal(drawingRevisionPrint(opened.doc), drawingRevisionPrint(doc));
  assert.deepEqual(doc, before);
  const plain = emptyDoc(); assert.equal(drawingRevisionPrint(plain), modelPrint(plain.nodes));
});

test('one groove ignores spacing; a shared multigroove consumer requires it', () => {
  const a = fixture(); const n = a.nodes[0]; assert.ok(n.kind === 'pulley');
  a.nodes = [{ ...n, grooves: 1 }]; const b = structuredClone(a); row(b, { spacing: 13 });
  assert.equal(volume(a), volume(b)); assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
  a.nodes.push({ ...n, center: [100, 0] }); b.nodes.push({ ...n, center: [100, 0] });
  assert.notEqual(volume(a), volume(b)); assert.notEqual(drawingRevisionPrint(a), drawingRevisionPrint(b));
});
