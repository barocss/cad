import { CadNumericPolicy } from '@barocss/cad';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { validFinishGroupEdge } from '@barocss/cad-model/engine/heldFinishGroup';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';

export function heldChamferThroughHole(doc: StudioDoc, index: number, bodies: readonly BodyResult[]) {
  const finish = doc.nodes[index], hole = doc.nodes[index + 1], [body] = bodies;
  if (index !== doc.nodes.length - 2 || finish?.kind !== 'chamfer' || !finish.held || !finish.suppressed ||
      finish.edges.length !== 1 || finish.parent.side !== 'solid' || finish.sigs?.[finish.edges[0]]?.k !== 'line' ||
      typeof finish.distance !== 'number' || !Number.isFinite(finish.distance) || finish.distance <= 0 ||
      hole?.kind !== 'hole' || hole.suppressed || hole.held || hole.parent.node !== index || hole.parent.side !== 'solid' ||
      (hole.axis ?? 'z') !== 'z' || (hole.side ?? 'max') !== 'max' || hole.depth !== undefined ||
      hole.pattern || hole.thread || hole.countersink !== undefined || hole.csk !== undefined ||
      hole.center.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
      typeof hole.radius !== 'number' || !Number.isFinite(hole.radius) || hole.radius <= 0 ||
      bodies.length !== 1 || body.key !== bodyKeyFor(doc.nodes, index + 1, 'solid') ||
      body.ref?.node !== index + 1 || body.ref.side !== 'solid' ||
      body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const parent = doc.nodes[finish.parent.node];
  const sketch = parent?.kind === 'extrude' ? doc.nodes[parent.sketch] : undefined;
  const id = featureId(doc.nodes, finish.parent.node);
  if (parent?.kind !== 'extrude' || parent.suppressed || (parent.draft ?? 0) !== 0 ||
      sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || sketch.suppressed ||
      sketch.holes?.length || sketch.regions?.length || hole.face !== id + '.top') return;
  return { body, parent: finish.parent, face: hole.face, center: hole.center as [number, number],
    radius: hole.radius, distance: finish.distance };
}

const samePoint = (a: Vec3, b: Vec3) => a.every((value, axis) => value === b[axis]);

/** Match the complete live top edge to the earlier native parent, before writing its signature. */
export function parentChamferEdge(scope: NonNullable<ReturnType<typeof heldChamferThroughHole>>,
  parent: BodyResult, picked: DisplayEdge | undefined): DisplayEdge | undefined {
  const visible = scope.body.mesh;
  if (!picked?.nativeLine || !validFinishGroupEdge(picked, visible.edges)) return;
  const original = parent.mesh.edges.find(edge => edge.names[0] === picked.names[0]);
  if (!original?.nativeLine || !validFinishGroupEdge(original, parent.mesh.edges) ||
      !((samePoint(picked.a, original.a) && samePoint(picked.b, original.b)) ||
        (samePoint(picked.a, original.b) && samePoint(picked.b, original.a)))) return;
  const faces = original.faces.map(index => parent.mesh.faces[index]);
  const names = faces.map(face => face.nativePlaneName);
  const current = picked.faces.map(index => visible.faces[index]);
  if (names.some(name => !name) || !names.includes(scope.face) || faces.some(face => {
    const other = current.find(item => item.nativePlaneName === face.nativePlaneName);
    return !face.nativeAxisPlane || face.nativeAxisPlane.axis !== other?.nativeAxisPlane?.axis ||
      face.nativeAxisPlane.at !== other.nativeAxisPlane.at;
  })) return;
  const side = faces.find(face => face.nativePlaneName !== scope.face)?.nativeAxisPlane;
  const axis = side?.axis === 'x' ? 0 : side?.axis === 'y' ? 1 : undefined;
  if (axis === undefined || !side || Math.abs(scope.center[axis] - side.at) <=
      scope.radius + scope.distance + 10 * CadNumericPolicy.linearTolerance) return;
  return original;
}
