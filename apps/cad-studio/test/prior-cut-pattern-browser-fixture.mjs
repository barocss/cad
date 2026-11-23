import assert from 'node:assert/strict';

export const fillMask = [[4, 4], [32, 4], [32, 12], [16, 12], [16, 35], [4, 35]];
export const inspectorSource = `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode, type BodyRef } from '@barocss/cad-model/engine/doc';
import { resolveCurveFeaturePatternPath } from '@barocss/cad-model/engine/curveFeaturePattern';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (input.pathDocument) {
  console.log(JSON.stringify(resolveCurveFeaturePatternPath(input.pathDocument, { objectId: input.objectId })));
} else if (!input.nodes) {
  let doc = emptyDoc();
  const ref = (node: number): BodyRef => ({ node, side: 'solid' });
  const box = (min: [number, number], max: [number, number]) => {
    const sketch = doc.nodes.length;
    doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min, max });
    doc = withNode(doc, { kind: 'extrude', sketch, height: 10 });
  };
  box([0, 0], [60, 40]);
  box([8, 8], [12, 10]);
  doc = withNode(doc, { kind: 'difference', parent: ref(1), tool: ref(3) });
  box([8, 26], [14, 28]);
  doc = withNode(doc, { kind: 'difference', parent: ref(4), tool: ref(6) });
  if (input.fill) {
    const points: [number, number][] = ${JSON.stringify(fillMask)};
    doc = withNode(doc, { kind: 'sketch', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })) });
  }
  console.log(JSON.stringify(doc));
} else {
  const [body] = partBreps(input);
  const { brep } = body;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const caps = brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane' || Math.abs(plane.n[2]) < 1 - 1e-9) return [];
    const openings = face.loops.map(id => loops.get(id)!).filter(loop => loop.kind === 'inner').map(loop => {
      const curves = loop.coedges.map(id => edges.get(uses.get(id)!.edge)!.curve);
      if (curves.length !== 4 || curves.some(curve => curve.degree !== 1 || curve.controlPoints.length !== 2))
        throw Error('Expected four native straight edges for a rectangular opening.');
      const points = curves.flatMap(curve => curve.controlPoints);
      if (points.some(point => Math.abs(point[2] - plane.o[2]) > 1e-8)) throw Error('Opening is off its cap.');
      return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
        Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    });
    return [{ z: plane.o[2], openings }];
  });
  console.log(JSON.stringify({ counts: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1), caps }));
}
`;

export const equivalent = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, JSON.stringify({ actual: a, expected: b }));
const order = (a, b) => a[0] - b[0] || a[1] - b[1];
export const older = [8, 8, 12, 10], later = [8, 26, 14, 28];
export const shift = (box, x, y) => [box[0] + x, box[1] + y, box[2] + x, box[3] + y];

export async function verifyPriorCut(f, label, doc, openings) {
  const result = await f.inspect(label, doc);
  assert.ok(result.counts.valid, result.counts.issues.join('\n'));
  assert.equal(result.counts.topology.length, 1);
  assert.equal(result.counts.topology[0].genus, openings.length);
  assert.equal(result.caps.length, 2);
  result.caps.map(cap => cap.z).sort((a, b) => a - b).forEach((z, i) => equivalent(z, 10 * i));
  const expected = [...openings].sort(order);
  for (const cap of result.caps) {
    assert.equal(cap.openings.length, expected.length);
    cap.openings.sort(order).forEach((opening, i) => opening.forEach((p, k) => equivalent(p, expected[i][k])));
  }
  const net = { volume: 24000, moment: [24000 * 30, 24000 * 20, 24000 * 5] };
  for (const [x0, y0, x1, y1] of openings) {
    const removed = 10 * (x1 - x0) * (y1 - y0);
    net.volume -= removed;
    net.moment[0] -= removed * (x0 + x1) / 2;
    net.moment[1] -= removed * (y0 + y1) / 2;
    net.moment[2] -= removed * 5;
  }
  equivalent(result.mass.volume, net.volume);
  result.mass.centroid.forEach((value, i) => equivalent(value, net.moment[i] / net.volume));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  equivalent(bodies[0].volume, net.volume);
  f.report.observations.push({ label, volume: result.mass.volume, centroid: result.mass.centroid, openings: expected });
  return result;
}

export async function choosePriorCutSource(f, entry) {
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await browser.locator('.ol:not(.ol-step)').first().click();
  if (entry === 'Browser') await browser.locator('.ol-step').filter({ hasText: 'Subtract' }).first().click();
  if (entry === 'History') await f.page.locator('.history [data-node-index="4"]').click();
  if (entry) await f.closeEditor();
}
