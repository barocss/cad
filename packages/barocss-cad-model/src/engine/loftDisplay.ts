import { CadNumericPolicy, faceGeometry, surfaceD1Evaluator, surfaceDomain, type Brep, type BrepFace } from '@barocss/cad';
import { isCompactStepTurn } from '@barocss/cad/internal/step-turn-display';
import { tessellateTwoGuideLoftDisplay } from '@barocss/cad/internal/two-guide-loft-display';
import { bodyMesh, type DisplayMesh, type BoundedDisplayMesh, type SmoothTurnDisplayMesh, type Vec3 } from './mesh';
import { cross, dot, len, scale, sub } from './vec3';

const cache = new WeakMap<DisplayMesh, DisplayMesh>();

/** Keep the canonical selection tables and use the refined samples for the viewport only. */
export function loftDisplayMesh(base: DisplayMesh, brep: Brep): DisplayMesh {
  const cached = cache.get(base);
  if (cached) return cached;
  const detail = buildDetail(base, brep);
  const result = detail ? { ...base, loftDetail: detail } : base;
  cache.set(base, result);
  return result;
}

function buildDetail(base: DisplayMesh, brep: Brep): BoundedDisplayMesh | undefined {
  const refined = tessellateTwoGuideLoftDisplay(brep);
  if (!refined) return;
  const { mesh, error } = refined, { positions, indices } = mesh;
  if (mesh.faces.length !== base.faces.length) return;
  const faceOfVertex = new Float32Array(positions.length / 3);
  for (const face of mesh.faces) {
    const owner = base.faces.find(f => f.id === face.faceId);
    if (!owner) return;
    faceOfVertex.fill(owner.index, face.vertexOffset, face.vertexOffset + face.vertexCount);
  }

  const lines: number[] = [], segmentOwners: number[] = [];
  for (const edge of base.edges) {
    const source = mesh.edges.find(e => e.edgeId === edge.nativeJoint?.edgeId);
    if (!source) return;
    const { points } = source;
    if (!edge.a.every((x, k) => x === points[k]) || !edge.b.every((x, k) => x === points[points.length - 3 + k])) return;
    for (let i = 0; i + 3 < points.length; i += 3) {
      lines.push(...points.subarray(i, i + 6));
      segmentOwners.push(edge.index, edge.index);
    }
  }
  const min = [...base.bounds.min] as Vec3, max = [...base.bounds.max] as Vec3;
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
  return { positions, indices, normals: new Float32Array(mesh.normals), faceOfVertex, edgeLines: new Float64Array(lines),
    edgeOfSegment: new Float32Array(segmentOwners), bounds: { min, max }, error };
}

const turnCache = new WeakMap<DisplayMesh, DisplayMesh>();

export function smoothTurnDisplayMesh(base: DisplayMesh, brep: Brep, sections?: number): DisplayMesh {
  const cached = turnCache.get(base);
  if (cached) return cached;
  const detail = buildTurnDetail(base, brep, sections);
  const result = detail ? { ...base, loftDetail: detail } : base;
  turnCache.set(base, result);
  return result;
}

function isAuthoredCompactTurn(brep: Brep, sections: number): boolean {
  const sides = brep.faces.length - 2;
  const rails = sides === 3 ? brep.edges.filter(edge => /^c[0-2]$/.test(edge.id))
    : brep.edges.filter(edge => /^c[0-3]$/.test(edge.id));
  return brep.source.family === 'loft' && brep.bodies.length === 1 && brep.bodies[0].kind === 'solid'
    && brep.shells.length === 1 && brep.shells[0].closed
    && (sides === 3 || sides === 4) && brep.edges.length === 3 * sides && sections >= 7 && sections <= 16
    && rails.length === sides && rails.every(({ curve }) => curve.degree === 3 && curve.controlPoints.length === sections
      && curve.weights.every(weight => weight === 1)
      && curve.knots.length === rails[0].curve.knots.length
      && curve.knots.every((knot, i) => knot === rails[0].curve.knots[i]));
}

/** The compact turn charts run linearly across each section and in height along the turn. */
function turnSurfaceNormal(face: BrepFace, axis: Vec3, tolerance: number) {
  const { surface, sense } = face;
  if (surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 3
    || surface.controlPoints.length !== 2 || surface.weights.some(row => row.some(weight => weight !== 1))) return;
  const { u: [u0, u1], v: [v0, v1] } = surfaceDomain(surface);
  const at = surfaceD1Evaluator(surface);
  const start = at(u0, v0).point;
  const height = dot(sub(at(u0, v1).point, start), axis);
  if (Math.abs(height) <= tolerance) return;
  const clamp = (t: number) => Math.max(0, Math.min(1, t));
  return (point: Vec3): Vec3 | undefined => {
    const v = v0 + (v1 - v0) * clamp(dot(sub(point, start), axis) / height);
    const left = at(u0, v).point, span = sub(at(u1, v).point, left);
    const width2 = dot(span, span);
    if (width2 <= tolerance * tolerance) return;
    const u = u0 + (u1 - u0) * clamp(dot(sub(point, left), span) / width2);
    const d = at(u, v);
    if (len(sub(point, d.point)) > tolerance) return;
    const normal = cross(d.du, d.dv), magnitude = len(normal);
    if (!(magnitude > 0) || !Number.isFinite(magnitude)) return;
    return scale(normal, (sense === 'forward' ? 1 : -1) / magnitude);
  };
}

function exactTurnNormals(mesh: DisplayMesh, brep: Brep): Float32Array | undefined {
  const caps = brep.faces.filter(({ surface }) => surface.kind === 'surface' && surface.degreeU === 1 && surface.degreeV === 1);
  if (caps.length !== 2) return;
  const cap = faceGeometry(caps[0]);
  if (cap.kind !== 'plane') return;
  const reach = Math.max(...mesh.bounds.min.map(Math.abs), ...mesh.bounds.max.map(Math.abs));
  const tolerance = Math.max(CadNumericPolicy.linearTolerance, CadNumericPolicy.relativeLinearTolerance * reach);
  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const onFace = mesh.faces.map(({ id }) => {
    const face = faces.get(id);
    return face && !caps.includes(face) ? turnSurfaceNormal(face, cap.n, tolerance) : undefined;
  });
  if (onFace.filter(Boolean).length !== mesh.faces.length - caps.length) return;
  const normals = mesh.normals.slice();
  for (const [i, face] of mesh.faceOfVertex.entries()) {
    const normalAt = onFace[face];
    if (!normalAt) continue;
    const k = 3 * i;
    const n = normalAt([mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]]);
    if (!n) return;
    normals.set(n, k);
  }
  return normals;
}

function buildTurnDetail(base: DisplayMesh, brep: Brep, sections?: number): SmoothTurnDisplayMesh | undefined {
  let refined: DisplayMesh;
  let normals: Float32Array;
  try {
    if (sections === undefined ? !isCompactStepTurn(brep) : !isAuthoredCompactTurn(brep, sections)) return;
    refined = bodyMesh(brep, 0, 24);
    normals = exactTurnNormals(refined, brep) ?? refined.normals;
  } catch {
    // The optional viewport samples must not invalidate an accepted model.
    return;
  }
  if (refined.indices.length <= base.indices.length || refined.faces.length !== base.faces.length
    || refined.edges.length !== base.edges.length) return;
  if (!refined.faces.every((f, i) => f.id === base.faces[i].id && f.name === base.faces[i].name && f.index === i)
    || !refined.edges.every((e, i) => {
      const owner = base.edges[i];
      return e.index === i && !!e.nativeJoint && e.nativeJoint.edgeId === owner.nativeJoint?.edgeId
        && e.faces.every((f, j) => f === owner.faces[j])
        && e.a.every((v, k) => v === owner.a[k]) && e.b.every((v, k) => v === owner.b[k]);
    })) return;
  const { positions, faceOfVertex, indices, edgeLines, edgeOfSegment, bounds } = refined;
  return { kind: 'smooth-turn', positions, normals, faceOfVertex, indices, edgeLines, edgeOfSegment, bounds };
}
