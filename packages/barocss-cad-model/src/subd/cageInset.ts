import { SubdError, type Cage } from '@barocss/cad';

/** A distance inset of ONE planar, strictly convex quad. No repair, projection of nonplanar faces,
 * region union or final-surface thickness claim. Original vertices/outer creases remain unchanged.
 */
export function insetPlanarQuad(c: Cage, face: number, distance: number): Cage {
  const fail = (reason: string): never => { throw new SubdError('INPUT', `inset: ${reason}`); };
  const nv = c.positions.length / 3;
  if (!Number.isInteger(nv) || c.positions.some(v => !Number.isFinite(v)) || c.faces.some(f => f.length < 3 || f.some(v => !Number.isInteger(v) || v < 0 || v >= nv))) fail('invalid cage coordinates or topology');
  if (!Number.isInteger(face) || face < 0 || face >= c.faces.length) fail('pick a current face');
  const f = c.faces[face];
  if (f.length !== 4 || new Set(f).size !== 4) fail('pick one quad with four distinct vertices');
  if (!Number.isFinite(distance) || distance <= 0) fail('distance must be finite and greater than zero');
  const p = f.map(i => Array.from(c.positions.slice(3 * i, 3 * i + 3)));
  const sub = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x - b[i]);
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const e = sub(p[1], p[0]), length = Math.hypot(...e), extent = Math.max(...p.map(q => Math.hypot(...sub(q, p[0]))));
  if (!Number.isFinite(extent)) fail('coordinate range is too large');
  const epsilon = Math.max(1e-9, extent * 1e-9);
  if (length <= epsilon || distance <= epsilon) fail('edge or inset distance is below the supported tolerance');
  const u = e.map(x => x / length), rawNormal = cross(u, sub(p[2], p[0])), normalLength = Math.hypot(...rawNormal);
  if (normalLength <= epsilon || !Number.isFinite(normalLength)) fail('degenerate quad');
  const normal = rawNormal.map(x => x / normalLength), v = cross(normal, u), local = p.map(q => sub(q, p[0]));
  if (local.some(q => Math.abs(dot(q, normal)) > epsilon)) fail('quad must be planar');
  const points = local.map(q => [dot(q, u), dot(q, v)]);
  const turn = (a: number[], b: number[], d: number[]) => (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
  if (points.some((q, i) => turn(q, points[(i + 1) % 4], points[(i + 2) % 4]) <= epsilon * epsilon)) fail('quad must be strictly convex and nondegenerate');
  const lines = points.map((q, i) => {
    const next = points[(i + 1) % 4], dx = next[0] - q[0], dy = next[1] - q[1], len = Math.hypot(dx, dy);
    if (len <= epsilon) fail('zero-length quad edge');
    const n = [-dy / len, dx / len]; return { n, c: dot(n, q) + distance };
  });
  const inner = lines.map((line, i) => {
    const prev = lines[(i + 3) % 4], det = prev.n[0] * line.n[1] - prev.n[1] * line.n[0];
    if (Math.abs(det) <= 1e-12) fail('adjacent sides are too nearly parallel');
    return [(prev.c * line.n[1] - prev.n[1] * line.c) / det, (prev.n[0] * line.c - prev.c * line.n[0]) / det];
  });
  if (inner.some(q => q.some(x => !Number.isFinite(x)) || lines.some(line => dot(line.n, q) < line.c - epsilon)) || inner.some((q, i) => Math.hypot(...sub(q, inner[(i + 1) % 4])) <= epsilon || turn(q, inner[(i + 1) % 4], inner[(i + 2) % 4]) <= epsilon * epsilon)) fail('distance collapses or crosses the inner quad');
  const positions = Array.from(c.positions);
  for (const q of inner) positions.push(...p[0].map((x, k) => x + u[k] * q[0] + v[k] * q[1]));
  if (positions.some(x => !Number.isFinite(x))) fail('result coordinates overflow');
  const ids = [nv, nv + 1, nv + 2, nv + 3], faces = c.faces.map((old, i) => i === face ? ids : [...old]);
  for (let i = 0; i < 4; i++) faces.push([f[i], f[(i + 1) % 4], ids[(i + 1) % 4], ids[i]]);
  return { ...c, positions, faces, ...(c.creases ? { creases: c.creases.map(edge => [...edge] as [number, number]) } : {}) };
}
