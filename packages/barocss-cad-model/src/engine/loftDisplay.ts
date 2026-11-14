import type { Brep } from '@barocss/cad';
import { tessellateTwoGuideLoftDisplay } from '@barocss/cad/internal/two-guide-loft-display';
import type { DisplayMesh, LoftDisplayMesh, Vec3 } from './mesh';

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

function buildDetail(base: DisplayMesh, brep: Brep): LoftDisplayMesh | undefined {
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
