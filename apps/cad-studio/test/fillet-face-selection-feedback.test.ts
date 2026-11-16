import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { newFilletActive } from '../src/app/filletFamily';
import { filletFaceSelectionFeedback } from '../src/app/filletFaceSelectionFeedback';
const doc = rectanglePart(30, 12, 20), result = evaluateDoc(doc, 0); assert.ok(result.ok);
const faces = result.bodies[0].mesh.faces;
const top = faces.findIndex(f => f.name === 'n1.top'), side = faces.findIndex(f => f.name === 'n1.side0');
assert.ok(top >= 0 && side >= 0);
const active = (type: 'face' | 'full-round', indices: number[]) => {
  const a = newFilletActive(type, { doc, bodies: result.bodies, selection: { faces: indices.map(face => ({ body: 0, face })), edges: [], bodies: [] } });
  const available = a.cmd.available(a.ctx);
  if (!available.ok) { a.preview = 'error'; a.error = { title: 'Invalid input', hint: `Error: ${available.reason}`, detail: '' }; }
  return a;
};
test('only exact missing-selection errors are redundant; other failures remain visible', () => {
  for (const [type, picks, expected] of [['face', [], 'first face'], ['face', [top], 'Shift-click'], ['full-round', [], 'flat top face']] as const) {
    const a = active(type, [...picks]);
    assert.match(filletFaceSelectionFeedback(a)!.text, new RegExp(expected));
    assert.equal(filletFaceSelectionFeedback(a)?.hideError, true);
    a.error = { title: 'Invalid input', hint: 'Error: unexpected failure', detail: '' };
    assert.equal(filletFaceSelectionFeedback(a)?.hideError, false);
    a.error = { ...a.error, detail: 'kernel error' };
    assert.equal(filletFaceSelectionFeedback(a)?.hideError, false);
  }
});
test('accepted faces show identity while unsupported picks and unrelated commands are not masked', () => {
  assert.equal(filletFaceSelectionFeedback(active('face', [top, side]))?.text, 'n1.top · n1.side0');
  assert.equal(filletFaceSelectionFeedback(active('full-round', [top]))?.text, 'n1.top');
  assert.equal(filletFaceSelectionFeedback(active('full-round', [side])), undefined);
  assert.equal(filletFaceSelectionFeedback(active('face', [top, top])), undefined);
  const stale = active('face', []); stale.ctx.selection.faces = [{ body: 0, face: 9999 }];
  assert.equal(filletFaceSelectionFeedback(stale), undefined);
  const other = active('face', []); other.cmd = { ...other.cmd, id: 'fillet' };
  assert.equal(filletFaceSelectionFeedback(other), undefined);
});
