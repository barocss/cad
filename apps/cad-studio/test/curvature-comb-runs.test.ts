import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidElement, type ReactElement } from 'react';
import { CurvatureComb } from '../src/viewport/CurvatureComb';
import type { CurvatureOverlay } from '../src/app/useEdgeCurvature';
import type { Vec3 } from '@barocss/cad-model/engine/vec3';
function collect(node: unknown, type: string): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(child => collect(child, type));
  if (!isValidElement<{children?: unknown}>(node)) return [];
  return [...(node.type === type ? [node] : []), ...collect(node.props.children, type)];
}
function overlay(spans: number[][]): CurvatureOverlay {
  return {target: {kind: 'edge', id:'edge'}, scale:4, density:8, measurement:{unit:'1/mm',minimum:1,maximum:1,
    spans:spans.map(xs=>xs.map((x,parameter)=>({parameter,point:[x,0,0],vector:[0,1,0],magnitude:1})))}};
}
const projectSegment=(a:Vec3,b:Vec3): [[number,number],[number,number]]|null =>
  [...a,...b].every(Number.isFinite) ? [[a[0],a[1]],[b[0],b[1]]] : null;
test('fully visible samples keep one envelope per knot span and unchanged tooth count',()=>{
  const data=overlay([[0,1,2],[3,4,5]]),before=structuredClone(data);
  const view=CurvatureComb({overlay:data,projectSegment});
  assert.equal(collect(view,'line').length,6);
  assert.deepEqual(collect(view,'polyline').map(node=>(node.props as {points:string}).points),['0,4 1,4 2,4','3,4 4,4 5,4']);
  assert.deepEqual(data,before);
});
test('one invalid sample removes only its tooth and adjacent envelope segments, without bridging',()=>{
  const data=overlay([[0,1,NaN,3,4]]),view=CurvatureComb({overlay:data,projectSegment});
  assert.equal(collect(view,'line').length,4);
  assert.deepEqual(collect(view,'polyline').map(node=>(node.props as {points:string}).points),['0,4 1,4','3,4 4,4']);
  const zero=overlay([[0,1]]);zero.measurement.maximum=0;assert.equal(CurvatureComb({overlay:zero,projectSegment}),null);
});
test('density selects spokes separately from tip runs and knot boundaries', () => {
  const data = overlay([[0,1,2,NaN,4,5,6,7], [8,9,10,11,12,13,14,15]]);
  const full = CurvatureComb({ overlay: data, projectSegment });
  const reduced = CurvatureComb({ overlay: { ...data, density: 2 }, projectSegment });
  assert.equal(collect(full, 'line').length, 15);
  assert.deepEqual(collect(reduced, 'line').map(node => (node.props as { x1: number }).x1), [2,6,10,14]);
  const tips = (view: unknown) => collect(view, 'polyline').map(node => (node.props as { points: string }).points);
  assert.deepEqual(tips(reduced), tips(full));
  assert.deepEqual(tips(reduced), ['0,4 1,4 2,4', '4,4 5,4 6,4 7,4', '8,4 9,4 10,4 11,4 12,4 13,4 14,4 15,4']);
});
