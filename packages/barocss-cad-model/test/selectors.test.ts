import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkBrep } from '@barocss/cad';
import { partBreps, evaluatePart } from '../src/engine/evaluate';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { runTool, type ChatState } from '../src/chat/tools';
import { resolveEdge, resolveFace } from '../src/chat/names';
import { readStudioDoc } from '../src/engine/migrate';

// Selectors (A1.2): a face or edge said by what it is, resolved to its persistent name.
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
async function stateOf(doc: StudioDoc): Promise<ChatState> { const r = await evaluate(doc); assert.ok(r.ok); return { doc, bodies: r.bodies }; }
const parse = (content: string) => JSON.parse(content) as Record<string, any>;
const box = (doc: StudioDoc, x: number, w: number, h: number) => withNode(withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [x, 0], max: [x + w, w] }), { kind: 'extrude', sketch: doc.nodes.length, height: h });

test('selectors: a feature’s face by role, the flat face facing a direction, the edge two faces share', async () => {
  const s = await stateOf(rectanglePart(40, 20, 8)), { nodes } = s.doc;
  assert.deepEqual(resolveFace(nodes, s.bodies, { feature: 1, role: 'top' }), ['n1.top']);
  assert.deepEqual(resolveFace(nodes, s.bodies, { feature: 'n1', role: 'bottom' }), ['n1.bottom']);
  assert.match(resolveFace(nodes, s.bodies, { feature: 1, role: 'side' }) as string, /fits 4 faces: n1\.side\d, n1\.side\d, n1\.side\d, n1\.side\d; name one/);
  assert.equal((resolveFace(nodes, s.bodies, { feature: 1, role: 'side', all: true }) as string[]).length, 4);
  assert.deepEqual(resolveFace(nodes, s.bodies, { normal: [0, 0, 1] }), ['n1.top']);
  assert.deepEqual(resolveFace(nodes, s.bodies, { normal: [0, 0, -2] }), ['n1.bottom']);
  const east = resolveFace(nodes, s.bodies, { normal: [1, 0, 0] }) as string[];
  assert.equal(east.length, 1);
  const f = s.bodies[0].mesh.faces.find(x => x.name === east[0])!;
  assert.ok(Math.abs(f.centroid[0] - 40) < 1e-9, 'the face at x = 40');
  const edge = resolveEdge(nodes, s.bodies, { between: [{ feature: 1, role: 'top' }, { normal: [1, 0, 0] }] }) as string[];
  assert.deepEqual(edge, [[east[0], 'n1.top'].sort().join('|')]);
  // Refusals say why and what there is.
  assert.match(resolveFace(nodes, s.bodies, { feature: 7, role: 'top' }) as string, /no feature 7/);
  assert.match(resolveFace(nodes, s.bodies, { feature: 1, role: 'cap' }) as string, /feature n1 has no face "cap" \(its faces: /);
  assert.match(resolveFace(nodes, s.bodies, { normal: [1, 1, 0] }) as string, /no flat face faces/);
  assert.match(resolveEdge(nodes, s.bodies, { between: [{ normal: [0, 0, 1] }, { normal: [0, 0, -1] }] }) as string, /share no edge/);
});

test('selectors: the same direction on two bodies is refused with both, narrowed by "on"', async () => {
  const s = await stateOf(box(box(emptyDoc(), 0, 10, 5), 20, 10, 5)), { nodes } = s.doc;
  assert.match(resolveFace(nodes, s.bodies, { normal: [0, 0, 1] }) as string, /fits 2 faces: n1\.top, n3\.top/);
  assert.deepEqual(resolveFace(nodes, s.bodies, { normal: [0, 0, 1], on: 'b3' }), ['n3.top']);
  assert.match(resolveFace(nodes, s.bodies, { normal: [0, 0, 1], on: 'b9' }) as string, /no body b9/);
});

test('selectors in the tools: a fillet on edges said by their faces, a measure between faces said by direction; each reports its name', async () => {
  const s = await stateOf(rectanglePart(40, 20, 8));
  let r = await runTool(s, 'run_command', { command: 'fillet', edges: [{ between: [{ feature: 1, role: 'top' }, { normal: [1, 0, 0] }] }], values: { radius: 2 } }, evaluate);
  assert.ok(!r.isError, r.content);
  const out = parse(r.content);
  assert.deepEqual(out.resolved.map((x: { names: string[] }) => x.names.length), [1]);
  assert.ok(Math.abs(r.state.bodies[0].volume! - (40 * 20 * 8 - (4 - Math.PI) * 20)) < 1e-3);
  r = await runTool(s, 'measure', { a: { feature: 1, role: 'top' }, b: { normal: [0, 0, -1] } }, evaluate);
  assert.ok(!r.isError, r.content);
  assert.equal(parse(r.content).normalDistance, 8); assert.deepEqual(parse(r.content).resolved.map((x: { names: string[] }) => x.names[0]), ['n1.top', 'n1.bottom']);
  assert.equal('normal_distance' in parse(r.content), false);
  const rightAngle = await runTool(s, 'measure', { a: 'n1.top', b: 'n1.side0' }, evaluate);
  assert.ok(!rightAngle.isError, rightAngle.content);
  assert.equal(parse(rightAngle.content).angle, 90); assert.equal('angle_deg' in parse(rightAngle.content), false);
  r = await runTool(s, 'select', { faces: [{ feature: 1, role: 'side', all: true }] }, evaluate);
  assert.ok(!r.isError, r.content); assert.equal(parse(r.content).selected.faces.length, 4);
  r = await runTool(s, 'run_command', { command: 'fillet', edges: [{ between: [{ feature: 1, role: 'side' }, { feature: 1, role: 'top' }] }], values: { radius: 1 } }, evaluate);
  assert.ok(r.isError); assert.match(parse(r.content).error, /fits 4 faces/);
});

// The selector conformance cases (conformance/a1, those with "selectors").
const a1 = join(resolve(import.meta.dirname, '..'), 'conformance', 'a1');
for (const file of readdirSync(a1).filter(f => f.endsWith('.json'))) {
  const c = JSON.parse(readFileSync(join(a1, file), 'utf8'));
  if (!c.input.selectors) continue;
  test(`conformance ${c.id}: ${c.about}`, async () => {
    const read = readStudioDoc(JSON.stringify(c.input.file)); assert.ok('doc' in read);
    const s = await stateOf(read.doc);
    for (const x of c.input.selectors) {
      const r = x.face ? resolveFace(s.doc.nodes, s.bodies, x.face) : resolveEdge(s.doc.nodes, s.bodies, x.edge);
      if (x.error) { assert.equal(typeof r, 'string', JSON.stringify(x)); assert.ok((r as string).includes(x.error), `${r} ⊅ ${x.error}`); }
      else assert.deepEqual(r, x.names, JSON.stringify(x));
    }
  });
}


test('between selectors reject distinct edge identities, preserve merged names and refuse before mutation', async () => {
  const s = await stateOf(rectanglePart(40, 20, 8)), original = structuredClone(s.doc);
  const pair = { between: ['n1.side0', 'n1.top'] };
  const edge = s.bodies[0].mesh.edges.find(e => e.names.includes('n1.side0|n1.top'))!;
  assert.ok(edge);
  // Synthetic split-display fixture: two disconnected edges, not two native
  // names owned by one display edge. Reversing traversal must not choose one.
  const duplicate = { ...edge, index: s.bodies[0].mesh.edges.length, a: [1, 1, 1] as [number, number, number], b: [2, 1, 1] as [number, number, number], names: ['n1.side0|n1.top#2'] };
  const body = { ...s.bodies[0], mesh: { ...s.bodies[0].mesh, edges: [...s.bodies[0].mesh.edges, duplicate] } };
  const bad = { ...s, bodies: [body] };
  const refusal = resolveEdge(s.doc.nodes, bad.bodies, pair);
  assert.match(refusal as string, /fit 2 edges:.*name one edge explicitly/);
  assert.equal(resolveEdge(s.doc.nodes, [{ ...body, mesh: { ...body.mesh, edges: [...body.mesh.edges].reverse() } }], pair), refusal);
  for (const [tool, args] of [
    ['select', { edges: [pair] }],
    ['run_command', { command: 'fillet', edges: [pair], values: { radius: 1 } }],
    ['measure', { a: pair, b: 'n1.bottom' }],
  ] as const) {
    let evaluated = false;
    const result = await runTool(bad, tool, args, async doc => { evaluated = true; return evaluate(doc); });
    assert.ok(result.isError, result.content); assert.match(result.content, /fit 2 edges/);
    assert.deepEqual(result.state, bad); assert.deepEqual(s.doc, original); assert.equal(evaluated, false);
  }
  const merged = { ...s.bodies[0], mesh: { ...s.bodies[0].mesh, edges: s.bodies[0].mesh.edges.map(e => e === edge ? { ...e, names: [...e.names, 'n1.side0|n1.top#2'] } : e) } };
  assert.deepEqual(resolveEdge(s.doc.nodes, [merged], pair), ['n1.side0|n1.top']);
  assert.deepEqual(resolveEdge(s.doc.nodes, bad.bodies, 'n1.side0|n1.top#2'), ['n1.side0|n1.top#2']);
});

test('between selectors require two distinct present faces of one body, including aliases and body restrictions', async () => {
  const s = await stateOf(rectanglePart(40, 20, 8));
  const resolve = (a: unknown, b: unknown, bodies = s.bodies) => resolveEdge(s.doc.nodes, bodies, { between: [a, b] });
  assert.match(resolve('n1.top', 'n1.top') as string, /different face/);
  assert.match(resolve('missing', 'n1.top') as string, /no face named/);
  const top = s.bodies[0].mesh.faces.find(f => f.name === 'n1.top')!;
  assert.match(resolve(top.id, 'n1.top') as string, /different face/);
  const copy = { ...s.bodies[0], key: 'copy' };
  assert.match(resolve('n1.top', 'n1.side0', [...s.bodies, copy]) as string, /fits 2 display faces/);
  assert.match(resolve({ feature: 1, role: 'top', on: 'b1' }, { feature: 1, role: 'side0', on: 'copy' }, [...s.bodies, copy]) as string, /different bodies/);
  assert.match(resolve({ feature: 1, role: 'top', on: 'b1' }, { feature: 1, role: 'side0', on: 'b1' }, [...s.bodies, copy]) as string, /no unambiguous name/);
});


test('native box adjacency agrees with selector identity, including a fresh file read', async () => {
  const doc = rectanglePart(40, 20, 8);
  const read = readStudioDoc(JSON.stringify(doc)); assert.ok('doc' in read);
  for (const model of [doc, read.doc]) {
    const s = await stateOf(model), [{ brep }] = partBreps(model);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    const loopFaces = new Map(brep.loops.map(loop => [loop.id, loop.face]));
    for (const edge of brep.edges) {
      // Independent adjacency walk from native coedges/loops, not name parsing
      // or the display edge.faces used by the resolver.
      const faceIds = [...new Set(brep.coedges.filter(coedge => coedge.edge === edge.id).map(coedge => loopFaces.get(coedge.loop)))];
      assert.equal(faceIds.length, 2);
      const faces = faceIds.map(id => brep.faces.find(face => face.id === id)!.name!);
      assert.deepEqual(resolveEdge(model.nodes, s.bodies, { between: faces }), [edge.name]);
    }
    const result = await runTool(s, 'select', { edges: [{ between: ['n1.top', 'n1.top'] }] }, evaluate);
    assert.ok(result.isError); assert.match(result.content, /different face/); assert.deepEqual(result.state, s);
  }
});

test('generated gear duplicate display roles are refused while unique face IDs resolve', async () => {
  const doc = withNode(emptyDoc(), { kind: 'gear', module: 2, teeth: 12, faceWidth: 5, center: [0, 0], generator: 'spur-gear@1' });
  const s = await stateOf(doc);
  const [{ brep }] = partBreps(doc);
  assert.ok(brep.faces.some(face => /#\d/.test(face.name ?? '')), 'native gear retains tooth suffixes');
  const edges = s.bodies[0].mesh.edges;
  assert.ok(edges.length > 0);
  assert.ok(s.bodies[0].mesh.faces.filter(face => face.name === 'n0.flankL').length > 1);
  assert.match(resolveEdge(doc.nodes, s.bodies, { between: ['n0.flankL', 'n0.top'] }) as string, /fits \d+ display faces/);
  let unique = 0, ambiguous = 0;
  for (const edge of edges) {
    const pair = edge.faces.map(index => s.bodies[0].mesh.faces.find(face => face.index === index)!.id);
    const candidates = s.bodies[0].mesh.edges.filter(other => pair.every(id => other.faces.some(index => s.bodies[0].mesh.faces.find(face => face.index === index)!.id === id)));
    const result = resolveEdge(doc.nodes, s.bodies, { between: pair });
    if (candidates.length === 1) { assert.deepEqual(result, [[...edge.names].sort()[0]]); unique++; }
    else { assert.match(result as string, /fit \d+ edges/); ambiguous++; }
  }
  assert.ok(unique + ambiguous > 0);
});
