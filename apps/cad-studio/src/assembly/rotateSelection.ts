import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { rotationMatrix, placementOf, matMul, eulerOf, type Mat3 } from '@barocss/cad-model/engine/placement';
import { translateSelection } from './translateSelection';

export interface GroupRotation { axis: 'X' | 'Y' | 'Z'; angle: number; pivot: readonly number[] }
const finite3 = (v: readonly number[]) => Array.isArray(v) && v.length === 3 && [0,1,2].every(k=>Number.isFinite(v[k]));
/** World rotation about one pivot. Definitions and unselected placements are never rewritten. */
export function rotateSelection(doc: StudioDoc, ids: readonly string[], value: GroupRotation): {instances: PartInstance[]; error?: never} | {error: string; instances?: never} {
  const k = ['X','Y','Z'].indexOf(value.axis);
  if (k < 0 || !Number.isFinite(value.angle) || !finite3(value.pivot)) return {error:'Enter a world X, Y or Z axis, finite angle in degrees and finite pivot coordinates in mm.'};
  // Reuse the conservative group-edit admission, including unselected linked-housing owners.
  const admitted = translateSelection(doc,ids,[0,0,0]);
  if (admitted.error !== undefined) return {error:admitted.error};
  const angle = value.angle % 360;
  if (angle === 0) return {instances:doc.instances!};
  const angles = [0,0,0]; angles[k] = angle;
  const turn = rotationMatrix(angles).map(v => Math.abs(v-Math.round(v)) < 1e-15 ? Math.round(v) : v) as Mat3;
  const apply = (v: readonly number[]) => [0,1,2].map(i=>turn[i*3]*v[0]+turn[i*3+1]*v[1]+turn[i*3+2]*v[2]);
  const selected = new Set(ids), changed = new Map<string,PartInstance>();
  const fail = () => ({error:'This rotation cannot preserve the placements at the requested numerical precision. Nothing was changed.'});
  for (const part of admitted.instances.filter(i=>selected.has(i.id))) {
    if (!finite3(part.rotation) || !finite3(part.position)) return fail();
    // The axial pivot coordinate is irrelevant: avoid cancellation along that axis.
    const relative = part.position.map((v,j)=>j===k?0:v-value.pivot[j]);
    const offset = apply(relative);
    const position = part.position.map((v,j)=>j===k?v:value.pivot[j]+offset[j]) as PartInstance['position'];
    const expected = matMul(turn,placementOf(part).m as Mat3);
    const rotation = [...eulerOf(expected)] as PartInstance['rotation'];
    if (!position.every(Number.isFinite) || !rotation.every(Number.isFinite)) return fail();
    const next = {...part,position,rotation}, actual = placementOf(next).m;
    if (expected.some((v,j)=>Math.abs(v-actual[j])>1e-10)) return fail();
    // Verify the translated result still represents its intended pivot-relative offset.
    if (offset.some((v,j)=>j!==k && Math.abs((position[j]-value.pivot[j])-v)>Math.max(1e-9,Math.abs(v)*1e-12))) return fail();
    changed.set(part.id,next);
  }
  const first = admitted.instances.find(i=>selected.has(i.id))!, origin = changed.get(first.id)!;
  for (const part of admitted.instances.filter(i=>selected.has(i.id))) {
    const before = part.position.map((v,j)=>v-first.position[j]), expected = apply(before), next = changed.get(part.id)!;
    if (expected.some((v,j)=>!Number.isFinite(v) || Math.abs((next.position[j]-origin.position[j])-v)>Math.max(1e-9,Math.abs(v)*1e-12))) return fail();
  }
  return {instances:admitted.instances.map(i=>changed.get(i.id)??i)};
}
