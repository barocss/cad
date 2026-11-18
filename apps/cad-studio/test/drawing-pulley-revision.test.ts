import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { modelPrint, defaultDrawing } from '@barocss/cad-model/drawing/types';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { drawingRevisionPrint } from '../src/ui/drawing/revisionPrint';
const fixture = (): StudioDoc => ({ ...emptyDoc(), nextId: 2,
  nodes: [{ kind: 'pulley', row: 'timing-a', teeth: 24, width: 12, bore: 10, center: [0, 0], generator: 'pulley@0' }],
  drives: { version: 1, rows: [{ kind: 'timing-belt', id: 'timing-a', pitch: 5, pitchLineOffset: 0.5, groove: [[-1.6, 0], [-1.1, 1.2], [1.1, 1.2], [1.6, 0]], thickness: 2.2, estimate: true }] } });
const row = (d: StudioDoc, patch: Record<string, unknown>) => { d.drives!.rows = d.drives!.rows.map(r => ({ ...r, ...patch })); };
const volume = (d: StudioDoc) => { const e = evaluateDoc(d, 1); assert.ok(e.ok); return e.bodies.reduce((sum, b) => sum + b.volume!, 0); };

test('used timing pitch changes pulley volume and stamp, not the input document', () => {
  const a = fixture(), before = structuredClone(a), b = structuredClone(a); row(b, { pitch: 5.2 });
  assert.ok(Math.abs(volume(a) - 11185.429047468406) < 1e-6);
  assert.ok(Math.abs(volume(b) - 12277.91480810971) < 1e-6);
  assert.notEqual(drawingRevisionPrint(a), drawingRevisionPrint(b));
  assert.deepEqual(a, before);
});

test('offset and groove both affect geometry and stamp', () => {
  const a = fixture();
  for (const change of [{ pitchLineOffset: 0.6 }, { groove: [[-1.6, 0], [-1.1, 1.3], [1.1, 1.3], [1.6, 0]] }]) {
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
  const b = structuredClone(a); row(b, { pitch: 5.2 });
  assert.equal(drawingRevisionPrint(a), drawingRevisionPrint(b));
  const c = fixture(), changed = fixture(); row(changed, { pitch: 5.2 });
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
