import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, isPerpendicularAnnularInletOffsetSource, offsetFaceDocumentProblem, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';

const face = 'n1.start';
const fixture = () => withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
  holes: [[{ kind: 'arc', center: [0, 0], start: [1, 0], direction: 'cw' }]],
  sideTags: { outer: ['e0'], holes: [['bore']] } }), { kind: 'sweep-curve', name: 'Perpendicular bore', mode: 'exact', sketch: 0,
  path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
    controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]],
  } });

function context(doc: StudioDoc, name = face): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok);
  const picked = result.bodies[0].mesh.faces.findIndex(candidate => candidate.name === name);
  assert.ok(picked >= 0);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: picked }], edges: [], bodies: [] } };
}

test('an original annular inlet has a signed Offset that survives native Open and History', async () => {
  const source = fixture(), before = structuredClone(source), original = context(source);
  assert.ok(isPerpendicularAnnularInletOffsetSource(source.nodes, 1, face));
  assert.equal(isPerpendicularAnnularInletOffsetSource(source.nodes, 1, 'n1.end'), false);
  assert.equal(offsetFaceCommand.available(original).ok, true);
  const applied = offsetFaceCommand.build!(original, { d: 4 }), node = applied.nodes[2];
  assert.ok(node.kind === 'offset-face');
  assert.equal(node.sigs?.[face]?.k, 'plane');
  assert.equal(offsetFaceDocumentProblem(applied), null);
  const opened = await readStudioFile(encodeStudioFile(applied));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(applied)));
  const edit = editSavedOffsetFaceCommand(opened.doc, 2);
  assert.ok(edit?.build);
  const pressed = edit.build(context(opened.doc), { d: -4 });
  const [{ brep }] = partBreps(pressed);
  const cap = faceGeometry(brep.faces.find(candidate => candidate.name === face)!);
  assert.ok(cap.kind === 'plane' && Math.abs(cap.o[0] + 6) < 1e-7);
  const topology = checkBrep(brep, { strict: true });
  assert.ok(topology.valid);
  assert.equal(topology.topology[0].genus, 1);
  assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 3 * Math.PI * (15 * Math.PI + 16)) < 1e-7);
  const collapse = evaluateDoc(edit.build(context(opened.doc), { d: -10 }), 2);
  assert.ok(!collapse.ok);
  assert.match(collapse.error.detail, /inlet-to-bend join/);
  assert.deepEqual(source, before);
});

test('saved inlet authority cannot be redirected to the other cap', () => {
  const source = fixture(), original = context(source);
  const saved = offsetFaceCommand.build!(original, { d: 4 }), node = saved.nodes[2];
  assert.ok(node.kind === 'offset-face' && node.sigs?.[face]);
  const wrong = { ...saved, nodes: [...source.nodes, { ...node, faces: ['n1.end'], sigs: { 'n1.end': node.sigs[face] } }] };
  assert.match(offsetFaceDocumentProblem(wrong) ?? '', /supported original straight end/);
  const otherView = context(source, 'n1.end');
  assert.throws(() => offsetFaceCommand.build!(otherView, { d: 4 }), /Offset face/);
});
