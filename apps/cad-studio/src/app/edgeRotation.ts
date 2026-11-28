import type { Ctx } from '@barocss/cad-model/app/commands';
import type { Axis } from '@barocss/cad-model/engine/doc';
import type { MeasureTarget } from './measureTargets';

const axes: readonly Axis[] = ['x', 'y', 'z'];

/** Initial Rotate values from one original straight edge of the current solid. */
export function edgeRotationValues({ bodies, selection, direct }: Ctx, target: MeasureTarget) {
  if (bodies.length !== 1 || target.occurrence || direct?.length) return;
  const { edges, faces, bodies: selected, vertices, sketches, profileRegions } = selection;
  if (edges.length !== 1 || faces.length || selected.length || vertices?.length || sketches?.length || profileRegions) return;
  const [pick] = edges;
  if (pick.body !== target.pick.body || pick.edge !== target.pick.edge) return;
  const body = bodies[pick.body];
  if (!body || body.key !== target.body || body.mesh !== target.mesh || body.ref?.side !== 'solid'
    || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const edge = body.mesh.edges[pick.edge];
  if (!edge?.nativeLine || !edge.nativeVertices || !edge.nativeJoint || edge.names.length !== 1
    || edge.nativeVertices[0] === edge.nativeVertices[1] || edge.nativeJoint.faces[0] === edge.nativeJoint.faces[1]) return;
  const { edgeId } = edge.nativeJoint;
  if (body.mesh.edges.some(other => other !== edge && (other.nativeJoint?.edgeId === edgeId || other.names.includes(edge.names[0])))) return;
  if (![...edge.a, ...edge.b].every(Number.isFinite)) return;
  const varying = axes.filter((_, index) => edge.a[index] !== edge.b[index]);
  if (varying.length !== 1) return;
  const [px, py, pz] = edge.a;
  return { axis: varying[0], angle: 0, px, py, pz };
}
