import assert from 'node:assert/strict';
import test from 'node:test';
import { editFields } from '../src/app/editFields';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { verifyReferences } from '../src/engine/references';
import { rematchNames } from '../src/engine/rematch';

const edge = 'n1.side0|n1.top';
const values = { radius: 1, endRadius: 4, stationMode: 'interior', stationAt: 25, stationRadius: 2 };
const seed = () => rectanglePart(40, 30, 10);
const bodies = (doc: StudioDoc) => {
  const result = evaluateDoc(doc, 0);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  return result.bodies;
};
const volume = (doc: StudioDoc, expected: number) => {
  const actual = bodies(doc)[0].volume;
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
};
const execute = (doc: StudioDoc, given = values) => dispatchTool({ doc, bodies: bodies(doc) },
  'run_command', { command: 'fillet', edges: [edge], values: given }, async doc => evaluateDoc(doc, 0));

test('a fillet with one interior station survives History, native Save/Open and changing edge length', async () => {
  const draft = seed(), result = await execute(draft);
  assert.ok(result.changed && !result.isError, result.content);
  const doc = result.state.doc, node = doc.nodes[2];
  assert.ok(node.kind === 'fillet');
  assert.deepEqual(node.radii?.map(r => r.radius), [1, 2, 4]);
  assert.equal(node.radii?.[1].fraction, 0.25);
  assert.equal(node.radii?.[1].at[0], 10);
  volume(doc, 11933.290621681288);
  const station = editFields(doc.nodes, 2).find(field => field.key === 'stationRadius');
  assert.ok(station?.kind === 'number');
  const edited = { ...doc, nodes: station.set(doc.nodes, 2.5) };
  volume(edited, 11918.344001172729);
  const opened = await readStudioFile(encodeStudioFile(edited));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(edited)));

  const [sketch, stock] = doc.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'rectangle' && stock.kind === 'extrude');
  const changed = { ...doc, nodes: [{ ...sketch, max: [60, 30] as [number, number] },
    { ...stock, height: 12 }, node] };
  volume(changed, 21499.935932521934);
});

test('endpoints cannot be used as an interior station and the agent keeps the original part', async () => {
  const doc = seed();
  for (const stationAt of [0, 100]) {
    const result = await execute(doc, { ...values, stationAt });
    assert.ok(result.isError && !result.changed, result.content);
    assert.match(result.content, /interior position/i);
    assert.equal(result.state.doc, doc);
  }
});

test('the agent creates a peak and a trough and History can edit the second interior station', async () => {
  const doc = seed();
  const both = { radius: 1.25, endRadius: 2.5, stationMode: 'two-interior', stationAt: 25, stationRadius: 3, station2At: 62.5, station2Radius: 1 };
  const accepted = await execute(doc, both);
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  const built = accepted.state.doc, node = built.nodes[2];
  assert.ok(node.kind === 'fillet');
  assert.deepEqual(node.radii?.map(p => [p.at[0], p.fraction, p.radius]), [
    [0, undefined, 1.25], [10, 0.25, 3], [25, 0.625, 1], [40, undefined, 2.5],
  ]);
  volume(built, 11964.57664564985);
  const fields = editFields(built.nodes, 2);
  const position = fields.find(field => field.key === 'station2At'), radius = fields.find(field => field.key === 'station2Radius');
  assert.ok(position?.kind === 'number' && radius?.kind === 'number');
  const edited = { ...built, nodes: radius.set(position.set(built.nodes, 70), 1.5) };
  volume(edited, 11957.923988715171);
  const opened = await readStudioFile(encodeStudioFile(edited));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(edited)));
  for (const [value, message] of [
    [{ station2At: 25 }, /position 2 after/i], [{ station2At: 10 }, /position 2 after/i],
    [{ station2At: 100 }, /interior position/i], [{ station2Radius: 0 }, /radius/i],
  ] as const) {
    const refused = await execute(doc, { ...both, ...value });
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.match(refused.content, message);
    assert.equal(refused.state.doc, doc);
  }
});


test('an ambiguously renamed edge cannot silently take the bound radius station', async () => {
  const draft = seed(), result = await execute(draft);
  assert.ok(result.changed && !result.isError, result.content);
  const doc = result.state.doc;
  const [body] = bodies(draft);
  const substitute = { ...body, mesh: { ...body.mesh, edges: body.mesh.edges.map(item => item.names.includes(edge)
    ? { ...item, names: ['n1.side0|n1.top#1'] } : item) } };
  const native = evaluateDoc(draft, 0);
  assert.ok(native.ok);
  const verified = await verifyReferences(doc, [], async () => ({ ...native, bodies: [substitute] }));
  assert.equal(verified.changes.length, 0);
  assert.ok(verified.problems.some(problem => problem.name === edge));
  const kept = verified.doc.nodes[2];
  assert.ok(kept.kind === 'fillet' && kept.suppressed);
  assert.deepEqual(kept.edges, [edge]);

  const candidate = { ...doc, nodes: [{ ...doc.nodes[0], bought: true }, ...doc.nodes.slice(1)] };
  const rematched = await rematchNames(doc, candidate, async prefix => ({
    ...native, bodies: prefix.nodes[0].bought ? [substitute] : [body],
  }));
  assert.ok('error' in rematched && /original straight edge/.test(rematched.error));
});
