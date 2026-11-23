import { faceGeometry, type Brep } from '@barocss/cad';
import { circularCapReplacementFrame } from '@barocss/cad/internal/bored-cap-offset';
import type { DisplayEdge, DisplayFace } from './mesh';
import { nativeCircleOf, sameNativeCircle } from './nativeCircle';
import { add, len, sub, unit, type Vec3 } from './vec3';

/** Frame only for one freshly assembled complete rim of an original upright round prism. */
export function nativeClosedCircularFilletRim(brep: Brep, edge: DisplayEdge, faces: readonly DisplayFace[]):
  { midpoint: Vec3; direction: Vec3 } | undefined {
  try {
    if (brep.source.family !== 'prismatic-solid' || brep.faces.length !== 4 || brep.loops.length !== 4 ||
      brep.coedges.length !== 12 || brep.edges.length !== 6 || brep.vertices.length !== 4 ||
      edge.straight || edge.names.length !== 2 || new Set(edge.names).size !== 2 || edge.nativeJoint ||
      edge.nativeFilletRim || !edge.nativeCircle || new Set(edge.faces).size !== 2 ||
      !edge.a.every((value, axis) => value === edge.b[axis])) return;
    // A consumed prism can be cached with a temporary source ID. Its authored face names stay stable.
    const top = brep.faces.find(face => face.name?.endsWith('.top'));
    const owner = top?.name?.slice(0, -'.top'.length);
    if (!owner) return;
    const caps = brep.faces.filter(face => face.name === `${owner}.bottom` || face === top);
    const walls = brep.faces.filter(face => face.name === `${owner}.side0#1` || face.name === `${owner}.side0#2`);
    if (caps.length !== 2 || walls.length !== 2 || new Set(caps.map(face => face.name)).size !== 2 ||
      new Set(walls.map(face => face.name)).size !== 2) return;
    const selected = caps.filter(cap => edge.faces.some(index => faces[index]?.id === cap.id && faces[index].nativePlaneName === cap.name));
    if (selected.length !== 1) return;
    const cap = selected[0], other = caps.find(face => face.id !== cap.id)!;
    const displayWall = edge.faces.map(index => faces[index]).filter(face => face && walls.some(wall => wall.id === face.id));
    if (displayWall.length !== 1) return;
    // This existing native certificate checks BOTH cap loops, matching pcurves, reciprocal closed incidence
    // and two nonoverlapping outward half cylinders with their full rational coefficients.
    const frame = circularCapReplacementFrame(brep, cap.name!), opposite = faceGeometry(other);
    if (!frame || opposite.kind !== 'plane' || frame.normal[2] !== -opposite.n[2] ||
      frame.normal[0] !== 0 || frame.normal[1] !== 0 || opposite.n[0] !== 0 || opposite.n[1] !== 0 ||
      frame.anchor[2] === opposite.o[2]) return;
    const loop = brep.loops.find(loop => loop.id === cap.loops[0]);
    if (cap.loops.length !== 1 || loop?.kind !== 'outer' || loop.coedges.length !== 2) return;
    const uses = loop.coedges.map(id => brep.coedges.find(use => use.id === id));
    const rim = uses.map(use => use && brep.edges.find(candidate => candidate.id === use.edge));
    if (rim.some(candidate => !candidate || candidate.curve.controlPoints.length !== 5 ||
      !candidate.name || !edge.names.includes(candidate.name)) || rim[0]!.id === rim[1]!.id) return;
    const circles = rim.map(candidate => nativeCircleOf(candidate!.curve));
    if (circles.some(circle => !circle || !sameNativeCircle(circle, edge.nativeCircle!))) return;
    // Bind each half to the selected cap and a different actual native wall, never a display-average normal.
    const adjacent = uses.map(use => {
      const twin = use?.twin ? brep.coedges.find(candidate => candidate.id === use.twin) : undefined;
      const wallLoop = twin ? brep.loops.find(loop => loop.id === twin.loop) : undefined;
      return wallLoop ? walls.find(wall => wall.id === wallLoop.face) : undefined;
    });
    if (adjacent.some(wall => !wall) || adjacent[0]!.id === adjacent[1]!.id) return;
    const extent = brep.vertices.reduce((value, vertex) => vertex.point.reduce((scale, coordinate) => Math.max(scale, Math.abs(coordinate)), value), 1);
    const roundoff = 64 * Number.EPSILON * extent;
    const support = faceGeometry(adjacent[0]!);
    if (support.kind !== 'cylinder' || support.out !== 1 || support.a[0] !== 0 || support.a[1] !== 0 || support.a[2] !== 1) return;
    const vertices = new Set(rim.flatMap(candidate => [...candidate!.vertices]));
    if (vertices.size !== 2) return;
    const seams = brep.vertices.filter(vertex => vertices.has(vertex.id));
    if (seams.length !== 2 || seams.some(vertex => vertex.point[2] !== frame.anchor[2] ||
      Math.abs(vertex.point[1] - frame.anchor[1]) > roundoff ||
      Math.abs(Math.abs(vertex.point[0] - frame.anchor[0]) - support.r) > roundoff)) return;
    const positive = seams.filter(vertex => vertex.point[0] > frame.anchor[0]);
    if (positive.length !== 1 || seams.filter(vertex => vertex.point[0] < frame.anchor[0]).length !== 1) return;
    const midpoint: Vec3 = [...positive[0].point];
    const radial = unit(sub(midpoint, frame.anchor)), direction = unit(add(radial, frame.normal));
    if (![...midpoint, ...direction].every(Number.isFinite) || Math.abs(len(direction) - 1) > 1e-12) return;
    return { midpoint, direction };
  } catch { return; }
}
