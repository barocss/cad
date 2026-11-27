import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, massPropertiesOf } from '@barocss/cad';
import { commands, type Ctx } from '../src/app/commands';
import { runTool } from '../src/chat/tools';
import { prefixDoc, rectanglePart, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { partSnapshot } from '../src/engine/part';
import { captureSignatures, verifyReferences } from '../src/engine/references';
import { xyPlane } from '../src/sketch/plane';

const body = (node: number) => ({ node, side: 'solid' as const });
const plate = rectanglePart(100, 50, 5);
const linear = commands.find(command => command.id === 'linear-pattern')!;
const values = { axis: 'x', distanceMode: 'spacing', result: 'join-plate', spacing: 25, count: 3 };

function addBoss(doc: StudioDoc, x: number, width: number, height: number, radius: number): StudioDoc {
  const sketch = doc.nodes.length, extrude = sketch + 1;
  const sides = ['e1', 'e2', 'e3', 'e4'];
  const profiled = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [x, 12], max: [x + width, 20],
    on: body(1), plane: xyPlane(5), sideTags: { outer: sides } });
  const solid = withNode(profiled, { kind: 'extrude', sketch, height });
  const id = solid.nodes[extrude].id;
  return withNode(solid, { kind: 'fillet', parent: body(extrude), radius, edges: sides.map(side => `${id}.side[${side}]|${id}.top`) });
}

function context(doc: StudioDoc, selected: number): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok);
  const index = result.bodies.findIndex(item => item.ref?.node === selected);
  assert.notEqual(index, -1);
  return { doc, bodies: result.bodies, selection: { faces: [], edges: [], bodies: [index] } };
}

function nativeVolume(doc: StudioDoc) {
  const [output, ...other] = partSnapshot(doc).outputs;
  assert.equal(other.length, 0);
  assert.equal(output.bodyCount, 1);
  assert.ok(checkOutput(output).valid);
  return massPropertiesOf(output).volume;
}

test('joined linear bosses inherit the seed and match three independent rounded bosses on the same plate', () => {
  for (const [x, width, height, radius] of [[10, 10, 6, 1], [12, 10, 6, 1], [12, 12, 6, 1], [12, 12, 8, 1], [12, 12, 8, 2]]) {
    const seed = addBoss(plate, x, width, height, radius);
    const ctx = context(seed, 4);
    const choices = linear.fields!(ctx, values).find(field => field.key === 'result');
    assert.ok(choices?.kind === 'choice' && choices.options.some(choice => choice.value === 'join-plate'));
    const patterned = linear.build!(ctx, values);
    let manual = plate, target = 1;
    for (let copy = 0; copy < 3; copy++) {
      manual = addBoss(manual, x + copy * 25, width, height, radius);
      manual = withNode(manual, { kind: 'union', left: body(target), right: body(manual.nodes.length - 1) });
      target = manual.nodes.length - 1;
    }
    assert.ok(Math.abs(nativeVolume(patterned) - nativeVolume(manual)) < 1e-8);
    const opened = readStudioDoc(JSON.stringify(patterned));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, patterned);
  }
});

test('joined boss rebuild and file admission refuse an outside, touching, or lost original while generic Union stays available', () => {
  const ctx = context(addBoss(plate, 12, 12, 8, 2), 4);
  const joined = linear.build!(ctx, values);
  const variants: [number, Partial<ModelNode>, RegExp][] = [
    [2, { min: [40, 12], max: [52, 20] }, /inside the original plate/i],
    [5, { spacing: 12 }, /overlap or touch/i],
    [4, { edges: ['n3.side[e1]|n3.top'] }, /upper Fillet edges/i],
    [4, { suppressed: true }, /upper Fillet edges/i],
  ];
  for (const [index, patch, reason] of variants) {
    const candidate = { ...joined, nodes: joined.nodes.map((node, i) => i === index ? { ...node, ...patch } as ModelNode : node) };
    assert.throws(() => partSnapshot(candidate), reason);
    const read = readStudioDoc(JSON.stringify(candidate));
    assert.ok('error' in read);
    assert.match(read.error, reason);
  }
  const right = body(5), patternOnly = linear.build!(ctx, { ...values, result: 'one' });
  assert.deepEqual(patternOnly.nodes, joined.nodes.slice(0, -1));
  const ordinary = withNode(patternOnly, { kind: 'union', left: body(1), right });
  assert.equal(nativeVolume(ordinary), nativeVolume(joined));
  const stockChoices = linear.fields!(context(plate, 1), values).find(field => field.key === 'result');
  assert.ok(stockChoices?.kind === 'choice' && !stockChoices.options.some(choice => choice.value === 'join-plate'));
});


test('reopening a resized joined boss follows the original four live rim names and never substitutes a missing rim', async () => {
  const seed = addBoss(plate, 10, 10, 6, 1);
  const source = context(prefixDoc(seed, 4), 3).bodies;
  const signed = captureSignatures(seed, source);
  const fillet = signed.nodes[4];
  assert.ok(fillet.kind === 'fillet' && fillet.sigs && Object.keys(fillet.sigs).length === 4);
  const joined = linear.build!(context(signed, 4), values);
  const doc: StudioDoc = { ...joined, nodes: joined.nodes.map((node, i) => {
    if (i === 2 && node.kind === 'sketch' && node.profile === 'rectangle') return { ...node, min: [12, 12], max: [24, 20] };
    if (i === 3 && node.kind === 'extrude') return { ...node, height: 8 };
    return node;
  }) };
  const reopened = readStudioDoc(JSON.stringify(doc));
  assert.ok('doc' in reopened);
  const evaluate = async (doc: StudioDoc) => evaluateDoc(doc, 1);
  const rebuilt = await evaluate(reopened.doc);
  assert.ok(rebuilt.ok);
  const verified = await verifyReferences(reopened.doc, rebuilt.bodies, evaluate);
  assert.deepEqual([verified.problems, verified.changes], [[], []]);
  assert.deepEqual(verified.doc, doc);
  const lost = fillet.edges[0];
  const missing = await verifyReferences(reopened.doc, rebuilt.bodies, async part => {
    const result = await evaluate(part);
    return result.ok && part.nodes.length === 4 ? { ...result, bodies: result.bodies.map(item => ({
      ...item, mesh: { ...item.mesh, edges: item.mesh.edges.filter(edge => !edge.names.includes(lost)) },
    })) } : result;
  });
  assert.deepEqual(missing.changes, []);
  assert.deepEqual(missing.problems.map(({ name, candidates }) => ({ name, candidates })), [{ name: lost, candidates: [] }]);
  assert.throws(() => partSnapshot(missing.doc), /upper Fillet edges/i);
});


test('the existing local agent command prepares the same joined pattern and refuses an overlapping pitch', async () => {
  const ctx = context(addBoss(plate, 10, 10, 6, 1), 4);
  const state = { doc: ctx.doc, bodies: ctx.bodies };
  const previous = process.env.CAD_AUTONOMY;
  process.env.CAD_AUTONOMY = '3';
  try {
    const run = (spacing: number) => runTool(state, 'run_command', {
      command: 'linear-pattern', bodies: ['b4'], values: { ...values, spacing },
    }, async doc => evaluateDoc(doc, 1));
    const result = await run(25);
    assert.equal(result.isError, false, result.summary);
    assert.deepEqual(result.state.doc, linear.build!(ctx, values));
    const refused = await run(10);
    assert.equal(refused.isError, true);
    assert.match(refused.summary, /overlap or touch/i);
    assert.deepEqual(refused.state.doc, state.doc);
  } finally {
    if (previous === undefined) delete process.env.CAD_AUTONOMY;
    else process.env.CAD_AUTONOMY = previous;
  }
});
