import { curveDomain, evaluateCurve, revolutionOf, type Brep, type BrepCoedge, type BrepEdge } from '@barocss/cad';
import type { DisplayFace, DisplayMesh } from './mesh';
import { nativeCircleOf } from './nativeCircle';
import { add, cross, dot, len, scale, sub, type Vec3 } from './vec3';

const boreRailDivisions = 20, boreHalfDivisions = 24;
type Frame = { centre: Vec3; first: Vec3; last: Vec3; axis: Vec3; tangent: Vec3; sweep: number; tolerance: number };
type Row = { points: Vec3[]; normals: Vec3[] };
type Half = { start: string; end: string; rows: Row[] };

/** The two halves of a circular bore on the same native bend, in each rim's own edge order. */
export function readMixedSweepBore(brep: Brep, mesh: DisplayMesh, caps: readonly [DisplayFace, DisplayFace],
  frame: Frame, startUses: readonly BrepCoedge[], endUses: readonly BrepCoedge[]) {
  const { centre, first, last, axis, tangent, sweep, tolerance } = frame;
  const near = (a: Vec3, b: Vec3) => len(sub(a, b)) <= tolerance;
  const close = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const vertices = new Map(brep.vertices.map(v => [v.id, v.point]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const startEdges = startUses.map(use => edges.get(use.edge)!);
  const endEdges = endUses.map(use => edges.get(use.edge)!);
  if ([startEdges, endEdges].some(rim => rim.length !== 2 || rim[0].id === rim[1].id
    || rim[0].vertices[0] === rim[0].vertices[1]
    || !rim[0].vertices.every(id => rim[1].vertices.includes(id)))) return;

  const joined = [startEdges, endEdges].map((rim, i) => mesh.edges.find(edge =>
    edge.faces.includes(caps[i].index) && edge.names.length === 2 && rim.every(native => edge.names.includes(native.name!))));
  const [startOwner, endOwner] = joined;
  if (!startOwner || !endOwner) return;
  const ownerIndex = startOwner.faces.find(index => index !== caps[0].index);
  if (ownerIndex === undefined || !endOwner.faces.includes(ownerIndex)) return;
  const wall = mesh.faces[ownerIndex];
  if (wall.kind !== 'curved' || wall.exact) return;

  const wallOf = (use: BrepCoedge) => {
    const other = use.twin && uses.get(use.twin);
    return other ? loops.get(other.loop)?.face : undefined;
  };
  const startWalls = startUses.map(wallOf), endWalls = endUses.map(wallOf);
  if (!startWalls.includes(wall.id) || startWalls[0] === startWalls[1]
    || !startWalls.every(id => endWalls.includes(id))) return;
  const wallUses = startWalls.map(id => {
    const face = id && faces.get(id);
    const loop = face && face.loops.length === 1 ? loops.get(face.loops[0]) : undefined;
    return loop?.kind === 'outer' && loop.coedges.length === 4 ? loop.coedges.map(id => uses.get(id)!) : [];
  });
  if (wallUses.some(ring => ring.length !== 4)) return;
  const seamUses = wallUses[0].filter(use => ![...startEdges, ...endEdges].some(edge => edge.id === use.edge));
  if (seamUses.length !== 2 || !seamUses.every(use => wallUses[1].some(other => other.id === use.twin))) return;
  const seams = seamUses.map(use => edges.get(use.edge)!);
  if (seams.some(seam => mesh.edges.some(edge => edge.names.includes(seam.name!)))) return;

  const circle = nativeCircleOf(startEdges[0].curve);
  if (!circle) return;
  const d = sub(circle.centre, centre), major = dot(d, first), axial = dot(d, axis), radius = circle.radius;
  if (!(major > radius && radius > 0)) return;
  const carrier = add(centre, scale(axis, axial));
  const profileCentre = (radial: Vec3) => add(carrier, scale(radial, major));
  const midpoint = (edge: BrepEdge) => {
    const [lo, hi] = curveDomain(edge.curve);
    return evaluateCurve(edge.curve, (lo + hi) / 2);
  };
  for (const [rim, radial] of [[startEdges, first], [endEdges, last]] as const) {
    const capCentre = profileCentre(radial);
    if (!near(sub(midpoint(rim[0]), capCentre), sub(capCentre, midpoint(rim[1])))) return;
    for (const edge of rim) {
      const native = nativeCircleOf(edge.curve);
      const [a, b] = edge.vertices.map(id => sub(vertices.get(id)!, capCentre));
      if (!native || !near(native.centre, capCentre) || !close(native.radius, radius)
        || len(cross(native.normal, cross(axis, radial))) > 1e-9 || !close(len(a), radius) || !near(a, scale(b, -1))) return;
    }
  }
  for (const id of startWalls) {
    const face = faces.get(id!)!;
    if (face.surface.kind !== 'surface' || face.surface.degreeU !== 2 || face.surface.degreeV !== 2) return;
    const rev = revolutionOf(face.surface, 100);
    if (rev?.profile.kind !== 'arc' || !close(rev.profile.c[0], major) || !close(rev.profile.r, radius)
      || !near(add(rev.c, scale(rev.a, rev.profile.c[1])), carrier) || len(cross(rev.a, axis)) > 1e-9
      || !rev.patch || Math.abs(rev.patch.span - sweep) > 1e-9
      || Math.abs(rev.patch.s1 - rev.patch.s0 - Math.PI) > 1e-9) return;
  }

  const radial = (fraction: number) => add(scale(first, Math.cos(fraction * sweep)), scale(tangent, Math.sin(fraction * sweep)));
  const directions = Array.from({ length: boreRailDivisions + 1 }, (_, j) => radial(j / boreRailDivisions));
  const startVertices = new Set(startEdges[0].vertices), endVertices = new Set(endEdges[0].vertices);
  const shared = new Map<string, { end: string; points: Vec3[] }>();
  const phase = (point: Vec3, radial: Vec3) => {
    const offset = sub(point, profileCentre(radial));
    return Math.atan2(dot(offset, axis), dot(offset, radial));
  };
  const at = (radial: Vec3, psi: number): Vec3 => add(scale(radial, Math.cos(psi)), scale(axis, Math.sin(psi)));
  for (const seam of seams) {
    const [c, d] = seam.vertices;
    const [from, to] = startVertices.has(c) ? [c, d] : [d, c];
    if (!startVertices.has(from) || !endVertices.has(to) || shared.has(from)) return;
    const a = vertices.get(from)!, b = vertices.get(to)!, psi = phase(a, first);
    const expected = (radial: Vec3) => add(profileCentre(radial), scale(at(radial, psi), radius));
    const support = nativeCircleOf(seam.curve), r = major + radius * Math.cos(psi);
    const origin = add(carrier, scale(axis, radius * Math.sin(psi)));
    if (!support || !near(support.centre, origin) || !close(support.radius, r)
      || len(cross(support.normal, axis)) > 1e-9 || !near(a, expected(first))
      || !near(b, expected(last)) || !near(midpoint(seam), expected(radial(0.5)))) return;
    const points = directions.map(expected);
    points[0] = a;
    points[boreRailDivisions] = b;
    shared.set(from, { end: to, points });
  }
  if (new Set([...shared.values()].map(link => link.end)).size !== 2) return;

  const halves: Half[] = [];
  for (const [i, edge] of startEdges.entries()) {
    const [from, to] = edge.vertices, linkA = shared.get(from)!, linkB = shared.get(to)!;
    const mate = endEdges[endWalls.indexOf(startWalls[i])];
    if (![linkA.end, linkB.end].every(id => mate.vertices.includes(id))) return;
    const zero = phase(vertices.get(from)!, first), r = at(first, zero + Math.PI / 2);
    const direction = dot(sub(midpoint(edge), profileCentre(first)), r) > 0 ? 1 : -1;
    const half = zero + direction * Math.PI / 2;
    if (!near(midpoint(edge), add(profileCentre(first), scale(at(first, half), radius)))
      || !near(midpoint(mate), add(profileCentre(last), scale(at(last, half), radius)))) return;
    const rows = directions.map((e, j): Row => {
      const points: Vec3[] = [], normals: Vec3[] = [];
      for (let k = 0; k <= boreHalfDivisions; k++) {
        const n = at(e, zero + direction * Math.PI * k / boreHalfDivisions);
        points.push(k === 0 ? linkA.points[j] : k === boreHalfDivisions ? linkB.points[j] : add(profileCentre(e), scale(n, radius)));
        normals.push(scale(n, -1));
      }
      return { points, normals };
    });
    halves.push({ start: edge.id, end: mate.id, rows });
  }

  const theta = sweep / boreRailDivisions, psi = Math.PI / boreHalfDivisions;
  const error = ((major + radius) * theta ** 2 + 2 * radius * theta * psi + radius * psi ** 2) / 8;
  const capRows = (start: boolean) => halves.map((half, i) => {
    if (start) return { edge: half.start, points: half.rows[0].points, owner: startOwner.index };
    const mate = edges.get(half.end)!, points = half.rows[boreRailDivisions].points;
    const forward = mate.vertices[0] === shared.get(startEdges[i].vertices[0])!.end;
    return { edge: half.end, points: forward ? points : [...points].reverse(), owner: endOwner.index };
  });
  return { wall: wall.index, halves, capRows, error };
}
