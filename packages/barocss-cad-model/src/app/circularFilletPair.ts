import type { DisplayEdge } from '../engine/mesh';

function nativeRim(edge: DisplayEdge | undefined) {
  const circle = edge?.nativeCircle, frame = edge?.nativeFilletRim, joint = edge?.nativeJoint;
  if (!edge || edge.straight || edge.names.length !== 1 || !circle || !frame?.quarter || !joint
    || ![...circle.centre, ...circle.normal, circle.radius, ...frame.midpoint, ...frame.direction].every(Number.isFinite)
    || !(circle.radius > 0) || Math.hypot(circle.normal[0], circle.normal[1]) > 1e-9
    || Math.abs(Math.abs(circle.normal[2]) - 1) > 1e-9) return;
  return { edge, circle, frame, joint };
}

/** Match the two open quarter rims on one upright cylindrical wall. The upper rim owns the shared handle. */
export function circularFilletPair(edges: readonly (DisplayEdge | undefined)[]) {
  if (edges.length !== 2) return;
  const a = nativeRim(edges[0]), b = nativeRim(edges[1]);
  if (!a || !b || a.joint.edgeId === b.joint.edgeId || new Set([...a.joint.faces, ...b.joint.faces]).size !== 3) return;
  const [top, bottom] = a.circle.centre[2] > b.circle.centre[2] ? [a, b] : [b, a];
  if (!(top.circle.centre[2] > bottom.circle.centre[2]) || !(top.frame.direction[2] > 0 && bottom.frame.direction[2] < 0)
    || Math.abs(a.circle.radius - b.circle.radius) > 1e-8
    || Math.hypot(a.circle.centre[0] - b.circle.centre[0], a.circle.centre[1] - b.circle.centre[1]) > 1e-8
    || Math.hypot(a.frame.midpoint[0] - b.frame.midpoint[0], a.frame.midpoint[1] - b.frame.midpoint[1]) > 1e-8) return;
  return { top, bottom };
}
