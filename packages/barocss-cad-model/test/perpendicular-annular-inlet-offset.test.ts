import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { perpendicularAnnularOutletProposal, reviewedPerpendicularAnnularOutletEvidence } from '../src/chat/perpendicularAnnularOutletProposalReview';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, perpendicularAnnularOffsetEnd, offsetFaceDocumentProblem, sweepOffsetPlaneSource, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

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
  assert.equal(perpendicularAnnularOffsetEnd(source.nodes, 1, face), 'start');
  assert.equal(perpendicularAnnularOffsetEnd(source.nodes, 1, 'n1.end'), 'end');
  assert.equal(perpendicularAnnularOffsetEnd(source.nodes, 1, 'n1.lead.side[e0]#1'), undefined);
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
  const wrong: StudioDoc = { ...saved, nodes: [...source.nodes, { ...node, faces: ['n1.end'], sigs: { 'n1.end': node.sigs[face] } }] };
  assert.equal(offsetFaceDocumentProblem(wrong), null);
  const evaluated = evaluateDoc(wrong, 2);
  assert.ok(!evaluated.ok);
  assert.match(evaluated.error.detail, /signature|reference/i);
});

test('an original annular outlet supports signed Offset through History and native Open', async () => {
  const source = fixture(), before = structuredClone(source), end = 'n1.end', selected = context(source, end);
  assert.equal(offsetFaceCommand.available(selected).ok, true);
  const applied = offsetFaceCommand.build!(selected, { d: 4 }), node = applied.nodes[2];
  assert.ok(node.kind === 'offset-face');
  assert.deepEqual(node.faces, [end]);
  assert.equal(node.sigs?.[end]?.k, 'plane');
  assert.equal(offsetFaceDocumentProblem(applied), null);
  const opened = await readStudioFile(encodeStudioFile(applied));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(applied)));
  const edit = editSavedOffsetFaceCommand(opened.doc, 2);
  assert.ok(edit?.build);
  const current = context(opened.doc, end);
  const signed = edit.build(current, { d: -4 });
  const [{ brep }] = partBreps(signed), cap = faceGeometry(brep.faces.find(candidate => candidate.name === end)!);
  assert.ok(cap.kind === 'plane' && Math.abs(cap.o[2] - 24) < 1e-7);
  const fixed = faceGeometry(brep.faces.find(candidate => candidate.name === face)!);
  assert.ok(fixed.kind === 'plane' && Math.abs(fixed.o[0] + 10) < 1e-7);
  assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 3 * Math.PI * (15 * Math.PI + 16)) < 1e-7);
  const collapse = evaluateDoc(edit.build(current, { d: -10 }), 2);
  assert.ok(!collapse.ok);
  assert.match(collapse.error.detail, /outlet.*join/);
  assert.deepEqual(source, before);
});

test('the outlet review binds the exact signed command, base and native output', () => {
  const source = fixture(), end = 'n1.end', selected = context(source, end);
  const args = { command: 'offset-face', expectedRevision: revisionOf(source), faces: [end], values: { d: -4 } };
  const operation = { tool: 'run_command', args };
  const proposal: Proposal = { id: 'P1', title: 'Move the outlet inward', status: 'open', by: { agent: 'chat' },
    at: '2026-11-24T00:00:00.000Z', base: 'test', summary: '1 added', ops: [operation],
    risk: { level: 'low', features_touched: 1, references_broken: 0, hard_requirements_changed: [], approval: [] } };
  const edit = perpendicularAnnularOutletProposal(source, proposal);
  assert.ok(edit);
  assert.equal(edit.revision, digestOf(proposal));
  for (const patch of [{ faces: ['n1.start'] }, { values: { d: -4, offsetMode: 'distance' } },
    { values: { d: 0 } }, { expectedRevision: '0'.repeat(16) }])
    assert.equal(perpendicularAnnularOutletProposal(source, { ...proposal, ops: [{ ...operation, args: { ...args, ...patch } }] }), undefined);
  assert.equal(perpendicularAnnularOutletProposal(source, { ...proposal, ops: [operation, operation] }), undefined);
  const candidate = offsetFaceCommand.build!(selected, { d: -4 });
  const reviewed = reviewedPerpendicularAnnularOutletEvidence(source, selected.bodies, candidate, edit);
  assert.ok(reviewed);
  assert.deepEqual(partBreps(candidate)[0].brep, reviewed.brep);
  const { sourceBody, body } = reviewed.perpendicularAnnularOutletOffset;
  assert.deepEqual([sourceBody, body], ['b1', 'b2']);
  assert.equal(reviewedPerpendicularAnnularOutletEvidence(source, selected.bodies, offsetFaceCommand.build!(selected, { d: 4 }), edit), undefined);
  const wrongEnd = offsetFaceCommand.build!(context(source), { d: -4 });
  assert.equal(reviewedPerpendicularAnnularOutletEvidence(source, selected.bodies, wrongEnd, edit), undefined);
  const changed = { ...source, parameters: { revisionProbe: 1 } };
  assert.equal(perpendicularAnnularOutletProposal(changed, proposal), undefined);
  assert.equal(reviewedPerpendicularAnnularOutletEvidence(changed, selected.bodies, candidate, edit), undefined);
});

test('only the original perpendicular outlet binds a live parallel native plane', async () => {
  let source = withNode(fixture(), { kind: 'sketch', profile: 'rectangle', min: [40, 48], max: [48, 54] });
  source = withNode(source, { kind: 'extrude', sketch: 2, from: 32, height: 5 });
  source = withNode(source, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
  const end = 'n1.end';
  assert.equal(sweepOffsetPlaneSource(source.nodes, 1, face), undefined);
  assert.equal(sweepOffsetPlaneSource(source.nodes, 1, end), 'perpendicular-annular-outlet');
  const result = evaluateDoc(source, 0);
  assert.ok(result.ok);
  const bodies = result.bodies;
  const pick = (key: string, name: string) => {
    const body = bodies.findIndex(candidate => candidate.key === key);
    const face = bodies[body]?.mesh.faces.find(candidate => candidate.name === name)?.index;
    assert.ok(face !== undefined);
    return { body, face };
  };
  const ctx: Ctx = { doc: source, bodies, selection: { faces: [pick('b1',end)], edges: [], bodies: [] } };
  const toPlane = { offsetMode: 'to-plane' };
  const picked = offsetFaceCommand.onPick!(ctx, toPlane, { face: pick('b4','n3.bottom'), edge: null });
  assert.ok(picked && !picked.error);
  const linked = offsetFaceCommand.build!(ctx, picked), node = linked.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  assert.deepEqual([node.target.feature,node.target.face,node.target.body], ['n4','n3.bottom',{node:4,side:'solid'}]);
  assert.equal(offsetFaceDocumentProblem(linked),null);

  const zOf = (doc: StudioDoc) => {
    const part = partBreps(doc).find(candidate => candidate.key === 'b5');
    assert.ok(part && checkBrep(part.brep, { strict:true }).valid);
    const cap = faceGeometry(part.brep.faces.find(candidate => candidate.name === end)!);
    assert.ok(cap.kind === 'plane');
    return cap.o[2];
  };
  assert.ok(Math.abs(zOf(linked)-32)<1e-7);
  const move = (z: number): StudioDoc => ({ ...linked, nodes: linked.nodes.map((node,i) =>
    i === 4 && node.kind === 'translate' ? { ...node, offset:[0,0,z] } : node) });
  const moved = move(-8);
  assert.deepEqual(moved.nodes[5],node);
  assert.ok(Math.abs(zOf(moved)-24)<1e-7);
  const opened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in opened && Math.abs(zOf(opened.doc)-24)<1e-7);

  const collapse = evaluateDoc(move(-14),0);
  assert.ok(!collapse.ok);
  assert.match(collapse.error.detail,/reach or cross the retained bend-to-outlet join/);
  const nonparallel = offsetFaceCommand.onPick!(ctx, toPlane, { face: pick('b4','n3.side1'), edge: null });
  assert.ok(nonparallel && !nonparallel.error);
  const invalid = evaluateDoc(offsetFaceCommand.build!(ctx,nonparallel),0);
  assert.ok(!invalid.ok);
  assert.match(invalid.error.detail,/parallel/);
});
