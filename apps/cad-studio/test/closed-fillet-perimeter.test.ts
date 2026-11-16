import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { sketch } from '@barocss/cad/api';
import { part } from '@barocss/cad-model/api';
import { commands, type Ctx } from '@barocss/cad-model/app/commands';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { refusal } from '@barocss/cad-model/engine/refusal';
import { closedFilletPerimeter } from '../src/state/closedFilletPerimeter';
import { commandBuildFailure } from '../src/state/commandBuildFailure';
import { FeatureFailureNotice } from '../src/ui/FeatureFailureNotice';

const message = 'A varying radius needs the picked edges to form one open chain: its two ends take the two radii.';
function quarter(): Ctx {
  const profile = sketch().moveTo([0, 0]).lineTo([8, 0]).arcTo([0, 8], { center: [0, 0] }).close();
  const doc = part('Quarter rim diagnostic').extrude(profile, { h: 10 }).doc;
  const result = evaluateDoc(doc, 0); assert.ok(result.ok);
  return { doc, bodies: result.bodies, selection: { edges: [], faces: [], bodies: [] } };
}
const fillet = commands.find(command => command.id === 'fillet')!;
for (const individuallyPicked of [false, true]) {
  test(`real quarter-sector ${individuallyPicked ? 'edge' : 'face'} selection explains the closed perimeter, preserving radii/document and open-arc recovery`, () => {
    const ctx = quarter(), top = ctx.bodies[0].mesh.faces.find(face => face.kind === 'plane' && face.normal[2] > 0.99)!;
    assert.ok(top);
    const edges = ctx.bodies[0].mesh.edges.filter(edge => edge.faces.includes(top.index)); assert.equal(edges.length, 3);
    ctx.selection = individuallyPicked ? { edges: edges.map(edge => ({ body: 0, edge: edge.index })), faces: [], bodies: [] }
      : { edges: [], faces: [{ body: 0, face: top.index }], bodies: [] };
    const before = structuredClone(ctx.doc), selection = structuredClone(ctx.selection);
    const values = { radius: 0.6, endRadius: 1.2, stationMode: 'ends', shape: 'circular' }, savedValues = { ...values };
    let cause: unknown;
    assert.throws(() => fillet.build!(ctx, values), error => { cause = error; return true; });
    assert.deepEqual(closedFilletPerimeter(ctx), { individuallyPicked });
    const error = commandBuildFailure('fillet', cause, ctx);
    assert.equal(error.title, 'The picked edges form a closed perimeter');
    assert.match(error.hint, /Switch to Edges and select an open chain, such as the arc without its closing edges/);
    assert.equal(error.hint.includes('Edit picked edges'), individuallyPicked);
    assert.equal(error.code, 'FILLET_CHAIN'); assert.equal(error.detail, `[FILLET_CHAIN] ${message}`);
    const html = renderToStaticMarkup(createElement(FeatureFailureNotice, { error }));
    assert.match(html, /role="status"/); assert.match(html, /<summary[^>]*>Kernel detail<\/summary><code>\[FILLET_CHAIN\]/);
    assert.doesNotMatch(html.slice(0, html.indexOf('<details>')), /FILLET_CHAIN|BarocssError|Constant/);
    assert.deepEqual(values, savedValues); assert.deepEqual(ctx.doc, before); assert.deepEqual(ctx.selection, selection);
    const arc = edges.find(edge => !edge.straight)!; assert.ok(arc);
    const recovered = { ...ctx, selection: { edges: [{ body: 0, edge: arc.index }], faces: [], bodies: [] } };
    assert.equal(closedFilletPerimeter(recovered), null);
    const node = fillet.build!(recovered, values).nodes.at(-1)!;
    assert.equal(node.kind, 'fillet'); if (node.kind !== 'fillet') return;
    assert.deepEqual(node.radii?.map(station => station.radius), [0.6, 1.2]);
    assert.deepEqual(values, savedValues); assert.deepEqual(ctx.doc, before);
  });
}

type Point = [number, number, number];
function graph(pairs: [Point, Point][]): Ctx {
  const ctx = quarter();
  const edges = pairs.map(([a, b], index) => ({ index, a, b, faces: [0, 1], names: [`e${index}`], straight: true, axis: null } as DisplayEdge));
  return { ...ctx, bodies: [{ ...ctx.bodies[0], mesh: { ...ctx.bodies[0].mesh, edges } }],
    selection: { edges: edges.map(edge => ({ body: 0, edge: edge.index })), faces: [], bodies: [] } };
}
const triangle: [Point, Point][] = [ [[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 0]] ];
const legacy = (command: string, cause: unknown, ctx?: Ctx) => assert.deepEqual(commandBuildFailure(command, cause, ctx), { title: 'Invalid input', hint: String(cause), detail: '' });

test('only the owned varying-Fillet branch and a connected cycle receive closed-perimeter advice', () => {
  const ctx = graph(triangle), cause = refusal('FILLET_CHAIN', message);
  assert.ok(closedFilletPerimeter(ctx));
  legacy('chamfer', cause, ctx); legacy('face-fillet', cause, ctx); legacy('fillet', cause);
  legacy('fillet', new Error(`[FILLET_CHAIN] ${message}`), ctx);
  legacy('fillet', refusal('VALUE', message), ctx);
  const interior = commandBuildFailure('fillet', refusal('FILLET_CHAIN', 'An interior radius needs one original straight edge.'), ctx);
  assert.match(interior.hint, /3 edges are picked.*Edit picked edges/);
  assert.equal(interior.code, 'FILLET_CHAIN');
  assert.equal(interior.detail, '[FILLET_CHAIN] An interior radius needs one original straight edge.');
  legacy('fillet', refusal('FILLET_CHAIN', message + ' extra'), ctx);
  legacy('fillet', refusal('REFUSED', 'Constant full perimeter failed'), ctx);
  const translated = triangle.map(([a, b]) => [a.map(value => value + 10) as Point, b.map(value => value + 10) as Point] as [Point, Point]);
  for (const other of [
    graph(triangle.slice(0, 2)), // open
    graph([...triangle, [[0, 0, 0], [0, 0, 1]]]), // branch
    graph([...triangle, ...translated]), // two disconnected closed cycles
    graph([triangle[0], translated[0]]), // disconnected open chains
    graph([[[0, 0, 0], [Infinity, 0, 0]]]),
    graph([[[0, 0, 0], [NaN, 0, 0]]]),
    graph([[[0, 0, 0], [0.00004, 0, 0]]]), // one bucket is not a closed straight edge
    graph([[[0.000049, 0, 0], [0.000051, 0, 0]]]), // round bins, not Euclidean tolerance
  ]) {
    assert.equal(closedFilletPerimeter(other), null); legacy('fillet', cause, other);
  }
});

test('missing, duplicate and mixed-body picks do not prove a closed perimeter; inspection is read-only', () => {
  const ctx = graph(triangle), before = structuredClone(ctx), cause = refusal('FILLET_CHAIN', message);
  const choices = [
    { ...ctx, selection: { ...ctx.selection, edges: [...ctx.selection.edges, ctx.selection.edges[0]] } },
    { ...ctx, selection: { ...ctx.selection, edges: [{ body: 0, edge: 99 }] } },
    { ...ctx, selection: { ...ctx.selection, edges: [{ body: 99, edge: 0 }] } },
    { ...ctx, selection: { ...ctx.selection, edges: [{ body: 0, edge: 0 }, { body: 1, edge: 1 }] } },
    { ...ctx, selection: { ...ctx.selection, edges: [], faces: [{ body: 0, face: 99 }] } },
    { ...ctx, selection: { ...ctx.selection, edges: [], faces: [{ body: 0, face: 0 }, { body: 0, face: 0 }] } },
  ];
  for (const other of choices) { assert.equal(closedFilletPerimeter(other), null); legacy('fillet', cause, other); }
  assert.deepEqual(closedFilletPerimeter({ ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face: 99 }] } }), { individuallyPicked: true }, 'explicit-edge precedence matches the builder');
  assert.deepEqual(ctx, before);
});


test('one actual merged circular edge proves a perimeter; ambiguous persistent names do not', () => {
  const doc = part('Closed circle diagnostic').extrude(sketch().circle({ r: 8 }), { h: 10 }).doc;
  const result = evaluateDoc(doc, 0); assert.ok(result.ok);
  const body = result.bodies[0], top = body.mesh.faces.find(face => face.kind === 'plane' && face.normal[2] > 0.99)!;
  const edges = body.mesh.edges.filter(edge => edge.faces.includes(top.index)); assert.equal(edges.length, 1);
  assert.equal(edges[0].straight, false);
  const ctx: Ctx = { doc, bodies: result.bodies, selection: { edges: [{ body: 0, edge: edges[0].index }], faces: [], bodies: [] } };
  assert.deepEqual(closedFilletPerimeter(ctx), { individuallyPicked: true });
  const ambiguous = graph(triangle);
  ambiguous.bodies[0].mesh.edges[1].names = [...ambiguous.bodies[0].mesh.edges[0].names];
  assert.equal(closedFilletPerimeter(ambiguous), null);
  legacy('fillet', refusal('FILLET_CHAIN', message), ambiguous);
  const duplicateName = graph(triangle);
  duplicateName.bodies[0].mesh.edges[0].names.push(duplicateName.bodies[0].mesh.edges[0].names[0]);
  assert.equal(closedFilletPerimeter(duplicateName), null);
});
