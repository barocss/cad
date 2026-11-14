import type { DisplayMesh } from './mesh';

const composed = new WeakMap<DisplayMesh, DisplayMesh>();

/** Replace only the face and edge buffers carried by the exterior packet. */
export function composeArcSweepExterior(base: DisplayMesh): DisplayMesh {
  const detail = base.arcSweepExteriorDetail;
  if (!detail) return base;
  const cached = composed.get(base);
  if (cached) return cached;
  const faces = new Set(detail.faceOfVertex), edges = new Set(detail.edgeOfSegment);
  const kept = base.faceOfVertex.length - base.faceOfVertex.reduce((n, owner) => n + Number(faces.has(owner)), 0);
  const n = kept + detail.faceOfVertex.length;
  const positions = new Float64Array(3 * n), normals = new Float32Array(3 * n), faceOfVertex = new Float32Array(n);
  const remap = new Uint32Array(base.faceOfVertex.length);
  let cursor = 0;
  for (let i = 0; i < base.faceOfVertex.length; i++) {
    const owner = base.faceOfVertex[i];
    if (faces.has(owner)) continue;
    remap[i] = cursor;
    faceOfVertex[cursor] = owner;
    for (let j = 0; j < 3; j++) {
      positions[3 * cursor + j] = base.positions[3 * i + j];
      normals[3 * cursor + j] = base.normals[3 * i + j];
    }
    cursor++;
  }
  positions.set(detail.positions, 3 * kept);
  normals.set(detail.normals, 3 * kept);
  faceOfVertex.set(detail.faceOfVertex, kept);
  const indices: number[] = [];
  for (let i = 0; i < base.indices.length; i += 3) {
    const a = base.indices[i], b = base.indices[i + 1], c = base.indices[i + 2];
    if (!faces.has(base.faceOfVertex[a])) indices.push(remap[a], remap[b], remap[c]);
  }
  for (const index of detail.indices) indices.push(index + kept);
  const edgeLines: number[] = [], edgeOfSegment: number[] = [];
  for (let i = 0; i < base.edgeLines.length; i += 6) {
    const owner = base.edgeOfSegment[i / 3];
    if (edges.has(owner)) continue;
    edgeOfSegment.push(owner, owner);
    for (let j = 0; j < 6; j++) edgeLines.push(base.edgeLines[i + j]);
  }
  const lines = new Float64Array(edgeLines.length + detail.edgeLines.length), lineOwners = new Float32Array(edgeOfSegment.length + detail.edgeOfSegment.length);
  lines.set(edgeLines);
  lines.set(detail.edgeLines, edgeLines.length);
  lineOwners.set(edgeOfSegment);
  lineOwners.set(detail.edgeOfSegment, edgeOfSegment.length);
  const result = { ...base, positions, normals, faceOfVertex, indices: new Uint32Array(indices),
    edgeLines: lines, edgeOfSegment: lineOwners, bounds: detail.bounds };
  composed.set(base, result);
  return result;
}
