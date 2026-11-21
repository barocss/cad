import type { Brep } from '@barocss/cad';
import { isCompactStepTurn } from '@barocss/cad/internal/step-turn-display';
import { tessellateTwoGuideLoftDisplay } from '@barocss/cad/internal/two-guide-loft-display';
import { bodyMesh, type DisplayMesh, type BoundedDisplayMesh, type SmoothTurnDisplayMesh, type Vec3 } from './mesh';

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
  const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id));
  return brep.source.family === 'loft' && brep.bodies.length === 1 && brep.bodies[0].kind === 'solid'
    && brep.shells.length === 1 && brep.shells[0].closed && brep.faces.length === 6 && brep.edges.length === 12
    && rails.length === 4 && rails.every(({ curve }) => curve.degree === 3 && curve.controlPoints.length === sections
      && curve.weights.every(weight => weight === 1)
      && curve.knots.length === rails[0].curve.knots.length
      && curve.knots.every((knot, i) => knot === rails[0].curve.knots[i]));
}

function buildTurnDetail(base: DisplayMesh, brep: Brep, sections?: number): SmoothTurnDisplayMesh | undefined {
  let refined: DisplayMesh;
  try {
    if (sections === undefined ? !isCompactStepTurn(brep) : !isAuthoredCompactTurn(brep, sections)) return;
    refined = bodyMesh(brep, 0, 24);
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
  const { positions, normals, faceOfVertex, indices, edgeLines, edgeOfSegment, bounds } = refined;
  return { kind: 'smooth-turn', positions, normals, faceOfVertex, indices, edgeLines, edgeOfSegment, bounds };
}
