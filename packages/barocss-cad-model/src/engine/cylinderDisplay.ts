import { faceGeometry, type Brep } from '@barocss/cad';
import { boreWallOffsetFrame } from '@barocss/cad/internal/bored-cap-offset';
import { bodyMesh, type CylinderDisplayTier, type DisplayMesh } from './mesh';
import { cross, len, sub, unit } from './vec3';

const byMesh = new WeakMap<DisplayMesh, DisplayMesh>();
const MAX_PACKET_BYTES = 192 * 1024;

function chordError(mesh: DisplayMesh): number {
  let max = 0;
  for (let i = 0; i < mesh.edgeLines.length; i += 6) {
    const edge = mesh.edges[mesh.edgeOfSegment[i / 3]], r = edge?.nativeCircle?.radius;
    if (!r) return Infinity;
    const xyz = mesh.edgeLines, c2 = (xyz[i] - xyz[i + 3]) ** 2 + (xyz[i + 1] - xyz[i + 4]) ** 2 + (xyz[i + 2] - xyz[i + 5]) ** 2;
    if (!(c2 > 0 && c2 < 4 * r * r)) return Infinity;
    max = Math.max(max, c2 / (4 * (r + Math.sqrt(r * r - c2 / 4))));
  }
  return max;
}

function sameOwners(base: DisplayMesh, next: DisplayMesh): boolean {
  return next.faces.length === base.faces.length && next.edges.length === base.edges.length
    && base.faces.every((face, index) => {
      const other = next.faces[index];
      return other.index === face.index && other.id === face.id && other.name === face.name && other.kind === face.kind
        && JSON.stringify(other.nativeFaces?.map(member => member.name)) === JSON.stringify(face.nativeFaces?.map(member => member.name));
    })
    && base.edges.every((edge, index) => {
      const other = next.edges[index];
      return edge.index === other.index && edge.faces[0] === other.faces[0] && edge.faces[1] === other.faces[1]
        && edge.names.length === other.names.length && edge.names.every((name, k) => name === other.names[k]);
    });
}

function nativeTubeWall(wall: DisplayMesh['faces'][number], brep: Brep, tolerance: number): boolean {
  const support = wall.exact, members = wall.nativeFaces;
  if (support?.kind !== 'cylinder' || members?.length !== 2 || members[0].name === members[1].name) return false;
  return members.every(member => {
    const matches = brep.faces.filter(face => face.name === member.name);
    if (matches.length !== 1) return false;
    const native = faceGeometry(matches[0]);
    return native.kind === 'cylinder' && Math.abs(native.a[2]) === 1 && Math.abs(support.a[2]) === 1
      && Math.abs(native.r - support.r) <= tolerance && Math.hypot(native.c[0] - support.c[0], native.c[1] - support.c[1]) <= tolerance;
  });
}

function uprightTube(base: DisplayMesh, brep: Brep): boolean {
  if (brep.faces.length !== 6 || brep.edges.length !== 12 || base.faces.length !== 4 || base.edges.length !== 4) return false;
  const caps = base.faces.filter(face => face.kind === 'plane'), walls = base.faces.filter(face => face.exact?.kind === 'cylinder');
  const inward = brep.faces.find(face => {
    const support = faceGeometry(face);
    return support.kind === 'cylinder' && support.out === -1;
  });
  const frame = inward?.name && boreWallOffsetFrame(brep, inward.name);
  if (!frame || caps.length !== 2 || walls.length !== 2 || !walls.some(wall => wall.nativeFaces?.length === 2
    && frame.faces.every(name => wall.nativeFaces!.some(member => member.name === name)))
    || !caps.every(cap => cap.exact?.kind === 'plane' && Math.abs(cap.exact.n[2]) === 1)) return false;
  const extent = Math.max(1, ...base.bounds.min.map(Math.abs), ...base.bounds.max.map(Math.abs)), tolerance = 64 * Number.EPSILON * extent;
  if (!walls.every(wall => nativeTubeWall(wall, brep, tolerance)) || new Set(walls.flatMap(wall => wall.nativeFaces!.map(member => member.name))).size !== 4) return false;
  const owners = new Set<string>();
  for (const edge of base.edges) {
    const circle = edge.nativeCircle, cap = caps.find(face => edge.faces.includes(face.index)), wall = walls.find(face => edge.faces.includes(face.index));
    if (!circle || edge.straight || edge.names.length !== 2 || len(sub(edge.a, edge.b)) > tolerance
      || !cap || !wall || cap.exact?.kind !== 'plane' || wall.exact?.kind !== 'cylinder'
      || Math.abs(circle.normal[2]) < 1 - 1e-10 || Math.abs(wall.exact.a[2]) !== 1
      || Math.abs(circle.radius - wall.exact.r) > tolerance || Math.abs(circle.centre[2] - cap.exact.o[2]) > tolerance
      || Math.hypot(circle.centre[0] - wall.exact.c[0], circle.centre[1] - wall.exact.c[1]) > tolerance) return false;
    owners.add(`${cap.index}:${wall.index}`);
  }
  return owners.size === 4;
}

/** Display refinement for one upright cylinder or coaxial tube, or an exact straight Sweep. */
export function cylinderDisplayMesh(base: DisplayMesh, brep: Brep, revision: number): DisplayMesh {
  const cached = byMesh.get(base);
  if (cached) return cached;
  byMesh.set(base, base);
  const straightSweep = brep.source.family === 'sweep-curve';
  if ((!straightSweep && brep.source.family !== 'prismatic-solid') || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed) return base;
  const tube = !straightSweep && uprightTube(base, brep);
  if (!tube && (brep.faces.length !== 4 || brep.edges.length !== 6 || base.faces.length !== 3
    || base.faces.filter(face => face.kind === 'plane').length !== 2 || base.edges.length !== 2)) return base;
  const a = base.edges[0].nativeCircle, b = base.edges[1].nativeCircle;
  if (!a || !b) return base;
  let sweep: NonNullable<DisplayMesh['cylinderDetail']>['sweep'];
  if (straightSweep) {
    const axis = sub(b.centre, a.centre);
    if (len(axis) <= 1e-7 || Math.abs(a.radius - b.radius) > 1e-7
      || len(cross(unit(axis), a.normal)) > 1e-9 || len(cross(unit(axis), b.normal)) > 1e-9) return base;
    sweep = { centres: [a.centre, b.centre], radius: Math.max(a.radius, b.radius) + 1e-7 };
  } else if ([a, b].some(circle => Math.abs(circle.normal[2]) < 1 - 1e-10)) return base;
  const firstError = chordError(base);
  if (!Number.isFinite(firstError) || !(firstError > 0)) return base;
  const cylinderDetail: CylinderDisplayTier[] = [];
  let lastError = firstError, bytes = 0;
  for (const quality of [16, 32]) {
    const next = bodyMesh(brep, revision, quality);
    if (!sameOwners(base, next)) break;
    const chordErrorMM = chordError(next);
    if (!(chordErrorMM < lastError)) break;
    const { positions, normals, faceOfVertex, indices, edgeLines, edgeOfSegment } = next;
    bytes += positions.byteLength + normals.byteLength + faceOfVertex.byteLength + indices.byteLength + edgeLines.byteLength + edgeOfSegment.byteLength;
    if (bytes > MAX_PACKET_BYTES) break;
    cylinderDetail.push({ positions, normals, faceOfVertex, indices, edgeLines, edgeOfSegment, chordErrorMM });
    lastError = chordErrorMM;
  }
  if (!cylinderDetail.length) return base;
  const detailed = { ...base, cylinderDetail: { baseChordErrorMM: firstError, tiers: cylinderDetail, ...(sweep ? { sweep } : {}) } };
  byMesh.set(base, detailed);
  return detailed;
}
