import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft } from '../src/app/commands';
import { editSavedDraftCommand } from '../src/app/draftEdit';
import { rectanglePart } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { friendly, friendlyCause } from '../src/engine/errors';

function seed() {
  const doc = rectanglePart(40, 30, 10), result = evaluateDoc(doc, 1);
  assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(f => f.kind === 'plane' && f.normal[1] < -0.9)!;
  assert.ok(face);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } };
}
function hint(error: ReturnType<typeof friendly>) {
  assert.equal(error.title, 'Draft needs a nonzero angle below 45°');
  assert.match(error.hint, /finite.*−45°.*45°.*excluding 0°/);
}

test('creation and saved Draft editing explain existing zero and boundary refusals without modifying source', () => {
  const ctx = seed(), before = structuredClone(ctx.doc);
  const saved = buildDraft(ctx, { deg: 5, pull: 'z', neutralMode: 'auto' });
  const edit = editSavedDraftCommand(saved, saved.nodes.length - 1)!;
  assert.ok(edit);
  const savedBefore = structuredClone(saved);
  for (const deg of [0, -45, 45, Infinity, NaN]) {
    for (const run of [() => buildDraft(ctx, { deg, pull: 'z' }), () => edit.build!({ ...ctx, doc: saved }, { deg, pull: 'z', neutralMode: 'auto' })]) {
      assert.throws(run, cause => {
        const error = friendlyCause(cause); assert.equal(error.code, 'DRAFT_ANGLE'); hint(error); return true;
      });
    }
  }
  assert.deepEqual(ctx.doc, before); assert.deepEqual(saved, savedBefore);
});

test('native saved-node angle refusals retain code/detail/feature and valid signed angles still build', () => {
  const ctx = seed(), saved = buildDraft(ctx, { deg: 5, pull: 'z' }), index = saved.nodes.length - 1;
  const before = structuredClone(saved);
  for (const angle of [0, -45, 45]) {
    const doc = { ...saved, nodes: saved.nodes.map((node, i) => i === index && node.kind === 'draft' ? { ...node, angle } : node) };
    const result = evaluateDoc(doc, 2); assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected refusal');
    assert.equal(result.error.code, 'INPUT'); assert.equal(result.error.feature, 'n2');
    assert.equal(result.error.detail, 'angle must be a number of degrees, not 0, below 45 in size'); hint(result.error);
  }
  for (const deg of [-5, 5]) {
    const doc = buildDraft(ctx, { deg, pull: 'z' }), result = evaluateDoc(doc, 3);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    assert.ok(result.bodies[0].volume! > 0);
    const edit = editSavedDraftCommand(saved, index)!;
    assert.ok(evaluateDoc(edit.build!({ ...ctx, doc: saved }, { deg, pull: 'z', neutralMode: 'auto' }), 4).ok);
  }
  assert.deepEqual(saved, before);
});

test('unrelated angle messages and wrong native category keep existing fallbacks', () => {
  const exact = 'angle must be a number of degrees, not 0, below 45 in size';
  for (const error of [friendly(exact), friendly(exact, 'GEOMETRY'), friendly('other: ' + exact, 'INPUT'), friendly(exact + '.', 'INPUT')])
    assert.equal(error.title, 'The kernel could not build this');
  assert.equal(friendly('draft closes a box wall at or before the end of the pull', 'GEOMETRY').title, 'The draft is too steep for this height');
});
