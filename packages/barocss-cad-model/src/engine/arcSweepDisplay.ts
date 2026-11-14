import { curveDomain, evaluateCurve, revolutionOf, type Brep } from '@barocss/cad';
import type { BoundedDisplayMesh, DisplayEdge, DisplayMesh } from './mesh';
import { add, cross, dot, len, scale, sub, unit, type Vec3 } from './vec3';

const byMesh = new WeakMap<DisplayMesh, DisplayMesh>();
const SWEEP_DIVISIONS = 56, HALF_RIM_DIVISIONS = 23;
const PACKET_BUDGET = 192 * 1024;

type Rim = { edge: DisplayEdge; cap: number; wall: number; mid: Vec3 };
type CapRims = readonly [Rim, Rim];

function buildDetail(base: DisplayMesh, brep: Brep): BoundedDisplayMesh | undefined {
  if (brep.source.family !== 'sweep-curve' || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed || brep.faces.length !== 4 || brep.edges.length !== 6
    || base.faces.length !== 4 || base.edges.length !== 4) return;
  const caps = base.faces.filter(face => face.exact?.kind === 'plane');
  if (caps.length !== 2) return;
  const rims: Rim[] = [];
  for (const edge of base.edges) {
    const cap = caps.find(face => edge.faces.includes(face.index));
    const wall = edge.faces.find(face => face !== cap?.index);
    const native = brep.edges.find(candidate => candidate.id === edge.nativeJoint?.edgeId);
    if (!cap || wall === undefined || caps.some(face => face.index === wall) || !native || !edge.nativeCircle) return;
    const [lo, hi] = curveDomain(native.curve);
    rims.push({ edge, cap: cap.index, wall, mid: evaluateCurve(native.curve, (lo + hi) / 2) });
  }
  const [start, end] = caps.map(cap => rims.filter(rim => rim.cap === cap.index));
  if (start.length !== 2 || end.length !== 2 || start[0].wall === start[1].wall) return;
  const wallFace = brep.faces.find(face => face.id === base.faces[start[0].wall].id);
  if (wallFace?.surface.kind !== 'surface') return;
  const revolution = revolutionOf(wallFace.surface, 100);
  if (revolution?.profile.kind !== 'arc') return;
  const [major, axial] = revolution.profile.c, minor = revolution.profile.r;
  const centre = add(revolution.c, scale(revolution.a, axial));
  const [origin, finish] = [start[0], end[0]].map(rim => rim.edge.nativeCircle!.centre);
  const first = unit(sub(origin, centre)), last = unit(sub(finish, centre));
  const axis = unit(cross(first, last)), tangent = cross(axis, first);
  const sweep = Math.atan2(dot(last, tangent), dot(last, first));
  if (!(major > minor && minor > 0 && sweep >= Math.PI / 6 - 1e-8 && sweep <= Math.PI / 2 + 1e-8)) return;

  const positionTolerance = 2e-10 * Math.max(1, ...centre.map(Math.abs), major);
  const phase = (point: Vec3, capCentre: Vec3, radial: Vec3) => {
    const d = sub(point, capCentre);
    return Math.atan2(dot(d, axis), dot(d, radial));
  };
  const startPhase = phase(start[0].edge.a, origin, first);
  const forward = Math.sin(phase(start[0].mid, origin, first) - startPhase) > 0 ? 1 : -1;
  const span = Math.PI / HALF_RIM_DIVISIONS;
  const halfStep = ((-forward * startPhase % Math.PI) + Math.PI) % Math.PI;
  const halfAngles = Array.from({ length: HALF_RIM_DIVISIONS }, (_, i) => i * span);
  // Include both inner and outer silhouette meridians, even when the seam has a different roll.
  if (Math.abs(halfStep - Math.round(halfStep / span) * span) > 1e-10) {
    halfAngles.splice(Math.ceil(halfStep / span), 0, halfStep);
  }
  const halfCount = halfAngles.length, length = 2 * halfCount;
  const phases = [...halfAngles, ...halfAngles.map(which => which + Math.PI)].map(angle => startPhase + forward * angle);

  // Keep the native half-rim edge owners, regardless of the seam roll of the sketch.
  const finishFirst = end.find(candidate => candidate.wall === start[0].wall);
  const finishSecond = end.find(candidate => candidate.wall === start[1].wall);
  if (!finishFirst || !finishSecond) return;
  const startRims: CapRims = [start[0], start[1]], endRims: CapRims = [finishFirst, finishSecond];
  const stations = [[startRims, 0, origin], [endRims, SWEEP_DIVISIONS, finish]] as const;
  const radial = Array.from({ length: SWEEP_DIVISIONS + 1 }, (_, j) => {
    const angle = sweep * j / SWEEP_DIVISIONS;
    return add(scale(first, Math.cos(angle)), scale(tangent, Math.sin(angle)));
  });
  const normals: Vec3[][] = [], rings: Vec3[][] = [];
  for (let j = 0; j <= SWEEP_DIVISIONS; j++) {
    const v = radial[j], ring: Vec3[] = [], normal: Vec3[] = [];
    const offset = add(centre, scale(v, major));
    for (const p of phases) {
      const n = add(scale(v, Math.cos(p)), scale(axis, Math.sin(p)));
      ring.push(add(offset, scale(n, minor)));
      normal.push(n);
    }
    rings.push(ring);
    normals.push(normal);
  }
  for (const [capRims, j, capCentre] of stations) {
    for (const [half, rim] of capRims.entries()) {
      const firstIndex = halfCount * half, lastIndex = (firstIndex + halfCount) % length, ring = rings[j];
      const a = ring[firstIndex], b = ring[lastIndex], middlePhase = phases[firstIndex] + forward * Math.PI / 2;
      const direction = add(scale(radial[j], Math.cos(middlePhase)), scale(axis, Math.sin(middlePhase)));
      const midpoint = add(capCentre, scale(direction, minor));
      const ends = len(sub(rim.edge.a, a)) <= positionTolerance ? [rim.edge.a, rim.edge.b] : [rim.edge.b, rim.edge.a];
      if (len(sub(ends[0], a)) > positionTolerance || len(sub(ends[1], b)) > positionTolerance
        || len(sub(rim.mid, midpoint)) > positionTolerance) return;
      ring[firstIndex] = ends[0]; ring[lastIndex] = ends[1];
    }
  }

  const p: number[] = [], n: number[] = [], own: number[] = [], indices: number[] = [];
  const lines: number[] = [], segmentOwners: number[] = [];
  const at = (j: number, k: number) => rings[j][k % length];
  function emit(point: Vec3, normal: Vec3, face: number) {
    p.push(...point); n.push(...normal); own.push(face);
  }
  function triangle(a: number, b: number, c: number, flip: boolean) {
    if (flip) indices.push(a, c, b);
    else indices.push(a, b, c);
  }

  for (const [half, rim] of start.entries()) {
    const offset = own.length, startIndex = half * halfCount, row = halfCount + 1;
    const flip = forward < 0;
    for (let j = 0; j <= SWEEP_DIVISIONS; j++) {
      for (let k = 0; k < row; k++) emit(at(j, startIndex + k), normals[j][(startIndex + k) % length], rim.wall);
      if (j === 0) continue;
      for (let k = 0; k < row - 1; k++) {
        const a = offset + (j - 1) * row + k, b = a + row;
        triangle(a, b, a + 1, flip); triangle(a + 1, b, b + 1, flip);
      }
    }
  }
  for (const [capRims, j, capCentre] of stations) {
    const cap = capRims[0].cap, normal = base.faces[cap].normal;
    const offset = own.length;
    emit(capCentre, normal, cap);
    for (let k = 0; k < length; k++) emit(at(j, k), normal, cap);
    const flip = dot(normal, cross(normals[j][0], normals[j][1])) < 0;
    for (let k = 0; k < length; k++) {
      triangle(offset, offset + 1 + k, offset + 1 + (k + 1) % length, flip);
      const edge = capRims[k < halfCount ? 0 : 1].edge.index;
      lines.push(...at(j, k), ...at(j, k + 1));
      segmentOwners.push(edge, edge);
    }
  }
  const bytes = 8 * (p.length + lines.length) + 4 * (n.length + own.length + indices.length + segmentOwners.length);
  if (bytes > PACKET_BUDGET) return;
  const min = [...base.bounds.min] as Vec3, max = [...base.bounds.max] as Vec3;
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]);
  }
  // The angular second derivative bounds are R+r, r and r. Linear terms cancel
  // in each triangle's barycentric sum and each angular variance is at most its step²/4.
  const step = sweep / SWEEP_DIVISIONS;
  const error = ((major + minor) * step ** 2 + 2 * minor * step * span + minor * span ** 2) / 8 + positionTolerance;
  return { positions: new Float64Array(p), normals: new Float32Array(n), faceOfVertex: new Float32Array(own), indices: new Uint32Array(indices),
    edgeLines: new Float64Array(lines), edgeOfSegment: new Float32Array(segmentOwners), bounds: { min, max }, error };
}

/** A display-only torus mesh. The cap/side selection tables and canonical mesh stay shared. */
export function arcSweepDisplayMesh(base: DisplayMesh, brep: Brep): DisplayMesh {
  const cached = byMesh.get(base);
  if (cached) return cached;
  const detail = buildDetail(base, brep);
  const result = detail ? { ...base, arcSweepDetail: detail } : base;
  byMesh.set(base, result);
  return result;
}
