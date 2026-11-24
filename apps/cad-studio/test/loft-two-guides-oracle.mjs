import assert from 'node:assert/strict';

export const twoGuideInspector = twoGuideInspectorWith('');

export function twoGuideInspectorWith(setup) {
  return `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, massPropertiesOf, surfaceDomain } from '@barocss/cad';
let doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
let extra={};
${setup}
const [{key,brep}]=partBreps(doc);
const output=evaluateCadPart(toPartDocument(doc)).outputs.find(body=>body.id===doc.nodes.at(-1).id);
assert.ok(output);
const ts=[0,.25,.5,.75,1];
const uprights=brep.edges.filter(({curve})=>curve.degree>1);
assert.equal(uprights.length,4);
const faces=brep.faces.filter(face=>face.name.includes('.side'));
const sample=(domain, t)=>domain[0]+(domain[1]-domain[0])*t;
const edges=uprights.map(({id,curve})=>({
  id, controls:curve.controlPoints,
  samples:ts.map(t=>evaluateCurve(curve,sample(curveDomain(curve),t))),
  uses:brep.coedges.filter(use=>use.edge===id).length,
}));
const sides=faces.map(({name,surface})=>{
  const {u,v}=surfaceDomain(surface);
  return {name,samples:ts.map(t=>[0,.5,1].map(s=>evaluateSurface(surface,sample(u,s),sample(v,t))))};
});
console.log(JSON.stringify({key,report:checkBrep(brep,{strict:true}),mass:massPropertiesOf(output),edges,sides,...extra}));
`;
}

const near = (actual, expected, tol = 1e-8) => assert.ok(Math.abs(actual - expected) < tol, `${actual} vs ${expected}`);
const samePoint = (actual, expected) => actual.every((value, i) => Math.abs(value - expected[i]) < 1e-8);

export async function verifyTwoGuideLoft(f, doc, a, b, label) {
  const guide = doc.nodes.at(-1);
  assert.deepEqual(guide.guides.map(g => g.controlPoints[1][0]), [a, 10 + b]);
  const actual = await f.inspect(label, doc);
  assert.ok(actual.report.valid, JSON.stringify(actual.report.issues));
  const { bodies, shells, faces, vertices, edges } = actual.report.counts;
  assert.deepEqual([bodies, shells, faces, vertices, edges], [1, 1, 6, 8, 12]);
  const [worker] = (await f.bodies()).bodies;
  assert.equal(worker.key, actual.key);
  const c = (b - a) / 10;
  const volume = 720 * (1 + 2 * c / 3 + 2 * c * c / 15);
  near(actual.mass.volume, volume);
  near(worker.volume, volume);
  near(actual.mass.centroid[2], 6);
  const left = actual.edges.find(edge => samePoint(edge.controls[0], [0, 0, 0]));
  const right = actual.edges.find(edge => samePoint(edge.controls[0], [10, 0, 0]));
  assert.deepEqual(left?.controls, [[0, 0, 0], [a, 0, 6], [0, 0, 12]]);
  assert.deepEqual(right?.controls, [[10, 0, 0], [10 + b, 0, 6], [10, 0, 12]]);
  assert.equal(left.uses, 2);
  assert.equal(right.uses, 2);
  assert.equal(actual.sides.length, 4);
  for (const [i, t] of [0, .25, .5, .75, 1].entries()) {
    const q = 2 * t * (1 - t), x = a * q, y = 6 * (1 + c * q), xmax = 10 + b * q, z = 12 * t;
    const ring = [[x, 0, z], [xmax, 0, z], [xmax, y, z], [x, y, z]];
    assert.ok(samePoint(left.samples[i], ring[0]) && samePoint(right.samples[i], ring[1]));
    const remaining = new Set([0, 1, 2, 3]);
    for (const side of actual.sides) {
      const [start, mid, end] = side.samples[i];
      const matches = [...remaining].find(j => samePoint(start, ring[j]) && samePoint(end, ring[(j + 1) % 4]));
      assert.notEqual(matches, undefined, JSON.stringify({ t, side, ring }));
      remaining.delete(matches);
      assert.ok(samePoint(mid, start.map((value, j) => (value + end[j]) / 2)));
    }
  }
  f.report.observations.push({ label, expectedVolume: volume, workerVolume: worker.volume, ...actual });
  return actual;
}
