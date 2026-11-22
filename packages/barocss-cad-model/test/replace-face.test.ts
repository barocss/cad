import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { runCheck } from '../src/chat/spec';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { directFaceDocumentProblem, emptyDoc, parentsOf, usesOf, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { isExactThickenBoreHeal, isExactThickenEdit } from '../src/engine/exactThickenEdit';
import { partSnapshot } from '../src/engine/part';
import { readStudioDoc } from '../src/engine/migrate';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

function witness() {
  const footprint = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const stock = withNode(footprint, { kind: 'extrude', sketch: 0, height: 10 });
  const profile = withNode(stock, { kind: 'sketch', profile: 'polygon', points: [[28, 0], [37, 0], [42, 10], [32, 10]],
    plane: { origin: [0, 70, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } });
  const donor = withNode(profile, { kind: 'extrude', sketch: 2, height: 10 });
  return withNode(donor, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
}

const command = { action: 'command', command: 'replace-face', faces: ['n1.side1', 'n3.side1'] };
const near = (value: number | null | undefined, expected: number) =>
  assert.ok(typeof value === 'number' && Math.abs(value - expected) < 1e-7, String(value));

test('Replace face reads the tilted donor without consuming it and keeps the authored reference across Open', async () => {
  const doc = witness(), original = await stateOf(doc), before = partBreps(doc);
  const reply = await dispatchTool(original, 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
  assert.ok(!reply.isError && reply.changed, reply.content);
  const candidate = reply.state.doc, node = candidate.nodes[5];
  assert.ok(node?.kind === 'replace-face' && node.sigs);
  assert.deepEqual(node.faces, ['n1.side1']);
  assert.deepEqual(parentsOf(node), [1]);
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.equal(node.target.feature, 'n4');
  assert.equal(node.target.face, 'n3.side1');
  assert.deepEqual(candidate.nodes.slice(0, 5), doc.nodes);
  const reopened = readStudioDoc(JSON.stringify(candidate));
  assert.ok('doc' in reopened);
  const after = await stateOf(reopened.doc);
  near(after.bodies.find(body => body.key === 'b5')?.volume, 11850);
  assert.deepEqual(partBreps(reopened.doc).find(body => body.key === 'b4'), before.find(body => body.key === 'b4'));

  const moved = structuredClone(candidate), translate = moved.nodes[4];
  assert.ok(translate.kind === 'translate');
  translate.offset[0] = 2;
  const updated = await stateOf(moved);
  near(updated.bodies.find(body => body.key === 'b5')?.volume, 12450);
  assert.deepEqual(moved.nodes[5], node);
  const stale = await dispatchTool(updated, 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
  assert.equal(JSON.parse(stale.content).code, 'COMMAND_STALE');
  assert.equal(stale.state.doc, moved);
});

test('Replace face refuses either-end collapse and a changed or missing saved reference', async () => {
  const start = await stateOf(witness());
  const reply = await dispatchTool(start, 'features', command, evaluate);
  assert.ok(!reply.isError && reply.changed, reply.content);
  const accepted = reply.state.doc;
  const collapsed = structuredClone(accepted), move = collapsed.nodes[4];
  assert.ok(move.kind === 'translate');
  move.offset[0] = -37;
  const refused = await evaluate(collapsed);
  assert.ok(!refused.ok);
  assert.match(refused.error.detail, /reach or cross the opposite wall/);
  const reshaped = structuredClone(accepted), sketch = reshaped.nodes[2];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  sketch.points[2] = [43, 10];
  const reshapedResult = await evaluate(reshaped);
  assert.ok(!reshapedResult.ok);
  assert.match(reshapedResult.error.detail, /original reference face changed/);
  const malformed = structuredClone(accepted), node = malformed.nodes[5];
  assert.ok(node.kind === 'replace-face');
  node.target.feature = 'missing';
  assert.match(directFaceDocumentProblem(malformed) ?? '', /reference feature identity/);
  const bad = await dispatchTool(start, 'features', { ...command, faces: ['n1.side1', 'n1.side3'] }, evaluate);
  assert.ok(bad.isError && !bad.changed);
  assert.equal(bad.state.doc, start.doc);
});

test('Replace face links an inclined exact plane to the original semicylinder upper cap', async () => {
  const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
  const thicken = withNode(emptyDoc(), { kind: 'thicken', mode: 'exact-cylinder', name: 'Semicylinder', thickness: 2, side: 'reverse',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    } });
  const n = Math.sqrt(17);
  const sketch = withNode(thicken, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8],
    plane: { origin: [44, 22, 20], normal: [-1 / n, 0, 4 / n], xAxis: [4 / n, 0, 1 / n] } });
  const extrude = withNode(sketch, { kind: 'extrude', sketch: 1, height: 3 });
  const doc = withNode(extrude, { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] });
  const before = structuredClone(doc), state = await stateOf(doc);
  const apply = (face: string, target = 'n2.bottom') => dispatchTool(state, 'features', {
    action: 'command', command: 'replace-face', faces: [face, target], expectedRevision: revisionOf(doc),
  }, evaluate);
  const reply = await apply('n0.v-max');
  assert.ok(!reply.isError && reply.changed, reply.content);
  assert.deepEqual(doc, before);
  const result = reply.state.doc, node = result.nodes[4];
  assert.ok(node?.kind === 'replace-face' && node.sigs);
  assert.deepEqual([node.parent, node.faces, node.target.feature, node.target.face],
    [{ node: 0, side: 'solid' }, ['n0.v-max'], 'n3', 'n2.bottom']);
  const originalDonor = partBreps(doc).find(body => body.key === 'b3');
  assert.deepEqual(partBreps(result).find(body => body.key === 'b3'), originalDonor);
  const measure = (candidate: StudioDoc, height: number) => {
    const { brep } = partBreps(candidate).find(item => item.key === 'b4')!;
    const report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    const { volume, centroid } = brepMassProperties(brep, 1);
    near(volume, 18 * Math.PI * height);
    near(centroid[0], 20 + 41 / (4 * height));
    near(centroid[2], height / 2 + 41 / (32 * height));
    for (const [name, radius] of [['n0.normal', 10], ['n0.reverse', 8]] as const) {
      const support = faceGeometry(brep.faces.find(face => face.name === name)!);
      assert.equal(support.kind, 'cylinder');
      near(support.r, radius);
    }
    return brep;
  };
  const names = ['n0.normal', 'n0.reverse'] as const;
  const radial = { query: { fn: 'radial_wall', a: names[0], b: names[1] }, op: '==', value: 2, tol: 0.01, unit: 'mm' } as const;
  const checkWall = async (candidate: StudioDoc) => {
    const { bodies } = await stateOf(candidate);
    const wall = await runCheck(candidate, bodies, evaluate, radial);
    assert.equal(wall.status, 'pass');
    near(typeof wall.measured === 'number' ? wall.measured : undefined, 2);
    assert.deepEqual(wall.entities, names);
    const wrongLimit = await runCheck(candidate, bodies, evaluate, { ...radial, value: 3 });
    assert.equal(wrongLimit.status, 'fail');
    near(typeof wrongLimit.measured === 'number' ? wrongLimit.measured : undefined, 2);
  };
  const originalResult = measure(result, 14);
  await checkWall(result);
  const move = (z: number): StudioDoc => ({ ...result, nodes: result.nodes.map((item, i) =>
    i === 3 && item.kind === 'translate' ? { ...item, offset: [0, 0, z] } : item) });
  const moved = move(-3), expected = measure(moved, 11);
  assert.equal(moved.nodes[4], node);
  const opened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, moved);
  assert.deepEqual(measure(opened.doc, 11), expected);
  const later = withNode(opened.doc, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 9] });
  for (const candidate of [moved, opened.doc, later]) await checkWall(candidate);

  const current = partSnapshot(moved), prior = partSnapshot(result);
  const oldEdit = prior.document.features.find(feature => feature.id === node.id);
  assert.ok(oldEdit?.kind === 'replace-face');
  assert.equal(isExactThickenEdit(moved, current, 4, expected, names), true);
  assert.equal(isExactThickenEdit(moved, current, 4, originalResult, names), false);
  const stalePlane = { ...current, document: { ...current.document,
    features: current.document.features.map(feature => feature.id === node.id ? oldEdit : feature) } };
  assert.equal(isExactThickenEdit(moved, stalePlane, 4, expected, names), false);
  const noReference = { ...moved, nodes: moved.nodes.map((item, i) => i === 3 ? { ...item, suppressed: true as const } : item) };
  assert.equal(isExactThickenEdit(noReference, current, 4, expected, names), false);

  for (const unsupported of [await apply('n0.v-min'), await apply('n0.v-max', 'n2.side0')]) {
    assert.ok(unsupported.isError && !unsupported.changed);
    assert.equal(unsupported.state.doc, doc);
  }
  const collapsed = await evaluate(move(-11.5));
  assert.ok(!collapsed.ok);
  assert.match(collapsed.error.detail, /opposite cap/i);
  assert.deepEqual(doc, before);
});

function inclinedCapSource() {
  const n = Math.sqrt(5);
  const source = withNode(emptyDoc(), { kind: 'thicken', mode: 'exact-cylinder', name: 'Semicylinder', thickness: 2, side: 'reverse',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]].map(([x, y]) => [[x, y, 0], [x, y, 12]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    } });
  const sketch = withNode(source, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8],
    plane: { origin: [44, 20, 13], normal: [0, 1 / n, 2 / n], xAxis: [1, 0, 0] } });
  const donor = withNode(sketch, { kind: 'extrude', sketch: 1, height: 3 });
  return withNode(donor, { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] });
}

test('a signed radial Offset and a linked inclined upper cap compose in both History orders', async () => {
  const cap = 'n0.v-max', wall = 'n0.normal', reference = 'n2.bottom', base = inclinedCapSource();
  const offset = { action: 'command', command: 'offset-face', faces: [wall], values: { d: 2 } };
  const replace = { action: 'command', command: 'replace-face', faces: [cap, reference] };
  const apply = async (doc: StudioDoc, command: typeof offset | typeof replace) => {
    const result = await dispatchTool(await stateOf(doc), 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
    assert.ok(result.changed && !result.isError, result.content);
    return result.state.doc;
  };
  const move = (doc: StudioDoc, z: number): StudioDoc => ({ ...doc, nodes: doc.nodes.map((node, index) =>
    index === 3 && node.kind === 'translate' ? { ...node, offset: [0, 0, z] } : node) });
  const acceptedBreps = [];
  const names = [wall, 'n0.reverse'] as const;
  for (const [first, second] of [[offset, replace], [replace, offset]]) {
    const initial = await apply(base, first), accepted = await apply(initial, second);
    assert.deepEqual(accepted.nodes.slice(0, 5), initial.nodes);
    const binding = accepted.nodes.find(node => node.kind === 'replace-face');
    assert.ok(binding?.kind === 'replace-face');
    assert.deepEqual([binding.target.feature, binding.target.face], ['n3', reference]);
    const pair = accepted.nodes[5];
    assert.ok(pair.kind === 'replace-face' || pair.kind === 'offset-face');
    assert.deepEqual(pair.parent, { node: 4, side: 'solid' });
    const measure = (doc: StudioDoc, height: number) => {
      const { brep } = partBreps(doc).find(item => item.key === 'b5')!;
      const report = checkBrep(brep, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
      const top = faceGeometry(brep.faces.find(face => face.name === cap)!);
      assert.ok(top.kind === 'plane');
      near(top.n[1] / top.n[2], .5);
      near(top.o[2] + .5 * (top.o[1] - 20), height);
      near(brepMassProperties(brep, 1).volume, 40 * Math.PI * height - (12 ** 3 - 8 ** 3) / 3);
      return brep;
    };
    const before = measure(accepted, 13);
    acceptedBreps.push(before);
    const moved = move(accepted, -2), current = measure(moved, 11);
    assert.deepEqual(moved.nodes.slice(4), accepted.nodes.slice(4));
    const opened = await readStudioFile(encodeStudioFile(moved));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, moved);
    assert.deepEqual(measure(opened.doc, 11), current);
    const snapshot = partSnapshot(moved);
    assert.equal(isExactThickenEdit(moved, snapshot, 5, current, names), true);
    assert.equal(isExactThickenEdit(moved, snapshot, 5, before, names), false);
    const proof = await runCheck(moved, (await stateOf(moved)).bodies, evaluate, {
      query: { fn: 'radial_wall', a: names[0], b: names[1] }, op: '==', value: 4, tol: 0.01, unit: 'mm',
    });
    assert.equal(proof.status, 'pass');
    near(typeof proof.measured === 'number' ? proof.measured : undefined, 4);
    const collapsed = await evaluate(move(accepted, -7));
    assert.ok(!collapsed.ok);
    assert.match(collapsed.error.detail, /opposite cap/i);
    const third = await dispatchTool(await stateOf(accepted), 'features', {
      action: 'command', command: 'offset-face', faces: [names[1]], values: { d: 1 },
    }, evaluate);
    assert.ok(third.isError && !third.changed);
    assert.equal(third.state.doc, accepted);
  }
  assert.deepEqual(acceptedBreps[0], acceptedBreps[1]);
  const tiltBeforeRadial = await apply(move(base, -7), replace);
  assert.ok((await evaluate(tiltBeforeRadial)).ok);
  const expanded = await dispatchTool(await stateOf(tiltBeforeRadial), 'features', offset, evaluate);
  assert.ok(expanded.isError && !expanded.changed);
  assert.match(expanded.content, /opposite cap/i);
});

test('the linked upper-cap wall edit requires current ownership and a pinned single distance', async () => {
  const cap = 'n0.v-max', wall = 'n0.normal', inner = 'n0.reverse';
  async function command(doc: StudioDoc, name: string, faces: string[], values?: Record<string, number>) {
    const reply = await dispatchTool(await stateOf(doc), 'features', { action: 'command', command: name, faces, values,
      expectedRevision: revisionOf(doc) }, evaluate);
    assert.ok(reply.changed && !reply.isError, reply.content);
    return reply.state.doc;
  }
  const source = inclinedCapSource();
  const linked = await command(source, 'replace-face', [cap, 'n2.bottom']);
  const original = await command(linked, 'offset-face', [wall], { d: 2 }), index = 5;
  const move = (doc: StudioDoc, z: number): StudioDoc => ({ ...doc, nodes: doc.nodes.map((node, i) =>
    i === 3 && node.kind === 'translate' ? { ...node, offset: [0, 0, z] } : node) });
  const moved = move(original, -2), accepted = await stateOf(moved);
  const req = { action: 'edit', index, expectedRevision: revisionOf(moved), values: { offsetDistance: 3 } };
  const discovery = await dispatchTool(accepted, 'features', { action: 'edit', index }, evaluate);
  assert.match(discovery.content, /values\.offsetDistance .*current value 2/);
  for (const bad of [
    { ...req, expectedRevision: undefined },
    { ...req, expectedRevision: revisionOf(original) },
    { ...req, values: { offsetDistance: 3, d: 1 } },
    { ...req, values: { offsetDistance: 0 } },
    { ...req, values: { offsetDistance: 2 } },
  ]) {
    const refused = await dispatchTool(accepted, 'features', bad, evaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, moved);
  }
  const contact = await dispatchTool(accepted, 'features', { ...req, values: { offsetDistance: 12 } }, evaluate);
  assert.ok(contact.isError && !contact.changed, contact.content);
  assert.match(contact.content, /opposite cap/i);
  assert.equal(contact.state.doc, moved);

  const result = await dispatchTool(accepted, 'features', req, evaluate);
  assert.ok(!result.isError && result.changed, result.content);
  const edited = result.state.doc;
  assert.deepEqual(edited.nodes.slice(0, index), moved.nodes.slice(0, index));
  assert.deepEqual(edited.nodes[index], { ...moved.nodes[index], distance: 3 });
  assert.deepEqual(edited.outputs, moved.outputs);
  const saved = await readStudioFile(encodeStudioFile(edited));
  assert.ok('doc' in saved);
  const native = (doc: StudioDoc) => partBreps(doc).find(body => body.key === 'b5')?.brep;
  const brep = native(edited);
  assert.ok(brep && checkBrep(brep, { strict: true }).valid);
  assert.deepEqual(native(saved.doc), brep);
  near(brepMassProperties(brep, 1).volume, 52.5 * 11 * Math.PI - (13 ** 3 - 8 ** 3) / 3);
  const after = await stateOf(saved.doc);
  const proof = await runCheck(saved.doc, after.bodies, evaluate, {
    query: { fn: 'radial_wall', a: wall, b: inner }, op: '==', value: 5, tol: 0.01, unit: 'mm',
  });
  assert.equal(proof.status, 'pass');
  near(typeof proof.measured === 'number' ? proof.measured : undefined, 5);

  const innerOriginal = await command(linked, 'offset-face', [inner], { d: -1 });
  const innerResult = await dispatchTool(await stateOf(innerOriginal), 'features', {
    ...req, expectedRevision: revisionOf(innerOriginal), values: { offsetDistance: 1 },
  }, evaluate);
  assert.ok(innerResult.changed && !innerResult.isError, innerResult.content);
  const innerBrep = native(innerResult.state.doc);
  const innerFace = innerBrep?.faces.find(face => face.name === inner);
  assert.ok(innerFace);
  const innerSupport = faceGeometry(innerFace);
  assert.ok(innerSupport.kind === 'cylinder' && innerSupport.out === -1);
  near(innerSupport.r, 7);

  const plainRadial = await command(source, 'offset-face', [wall], { d: 2 });
  const continued = withNode(moved, { kind: 'translate', parent: { node: index, side: 'solid' }, offset: [1, 0, 0] });
  for (const [doc, index] of [[plainRadial, 4], [continued, 5]] as const) {
    const refused = await dispatchTool(await stateOf(doc), 'features', { ...req, index, expectedRevision: revisionOf(doc) }, evaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, doc);
  }
  const incompleteView = { ...accepted, bodies: accepted.bodies.filter(body => body.ref?.node !== 3) };
  const missingDonor = await dispatchTool(incompleteView, 'features', req, evaluate);
  assert.ok(missingDonor.isError && !missingDonor.changed);
  assert.equal(missingDonor.state.doc, moved);
});

test('wall evidence follows the current Exact semicylinder through bore repair', async () => {
  const a = 'n0.normal', b = 'n0.reverse', solid = (node: number) => ({ node, side: 'solid' as const });
  const check = { query: { fn: 'radial_wall', a, b }, op: '>=', value: 4, tol: 0.01, unit: 'mm' } as const;
  const apply = async (doc: StudioDoc, name: string, faces: string[], values?: Record<string, number>) => {
    const reply = await dispatchTool(await stateOf(doc), 'features', {
      action: 'command', command: name, faces, values, expectedRevision: revisionOf(doc),
    }, evaluate);
    assert.ok(reply.changed && !reply.isError, reply.content);
    return reply.state.doc;
  };
  const read = async (doc: StudioDoc, query: { fn: 'radial_wall'; a: string; b: string } = check.query) =>
    runCheck(doc, (await stateOf(doc)).bodies, evaluate, { ...check, query });

  for (const wallFirst of [false, true]) {
    const source = inclinedCapSource();
    const replace = (doc: StudioDoc) => apply(doc, 'replace-face', ['n0.v-max', 'n2.bottom']);
    const offset = (doc: StudioDoc) => apply(doc, 'offset-face', [a], { d: 2 });
    const stock = wallFirst ? await replace(await offset(source)) : await offset(await replace(source));
    const circle = withNode(stock, { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 1.5,
      plane: { origin: [20, 25, 3], normal: [0, 1, 0], xAxis: [1, 0, 0] } });
    const tool = withNode(circle, { kind: 'extrude', sketch: 6, height: 9 });
    const cut = withNode(tool, { kind: 'difference', parent: solid(5), tool: solid(7) });
    assert.equal((await read(cut)).status, 'unknown');

    const healed = await apply(cut, 'delete-face', ['n7.side0#2']);
    const proof = await read(healed);
    assert.equal(proof.status, 'pass');
    near(typeof proof.measured === 'number' ? proof.measured : undefined, 4);
    assert.deepEqual(proof.entities, [a, b]);
    assert.deepEqual(await read(healed, { fn: 'radial_wall', a: b, b: a }), proof);
    assert.equal((await read(healed, { fn: 'radial_wall', a, b: 'n0.v-max' })).status, 'unknown');

    const thinner = structuredClone(healed), wall = thinner.nodes[wallFirst ? 4 : 5];
    assert.ok(wall.kind === 'offset-face' && wall.target === undefined);
    wall.distance = 1;
    const failure = await read(thinner);
    assert.equal(failure.status, 'fail');
    near(typeof failure.measured === 'number' ? failure.measured : undefined, 3);
    assert.deepEqual(failure.entities, [a, b]);
    const current = partSnapshot(thinner);
    const repaired = current.outputs.find(output => output.id === 'n9')!.brep;
    const previous = partSnapshot(healed).outputs.find(output => output.id === 'n9')!.brep;
    assert.equal(isExactThickenBoreHeal(thinner, current, 9, repaired, [a, b]), true);
    assert.equal(isExactThickenBoreHeal(thinner, current, 9, previous, [a, b]), false);

    const opened = await readStudioFile(encodeStudioFile(healed));
    assert.ok('doc' in opened);
    assert.deepEqual(await read(opened.doc), proof);

    const moved = withNode(healed, { kind: 'translate', parent: solid(9), offset: [2, 0, 0] });
    assert.equal((await read(moved)).status, 'unknown');
  }
});
