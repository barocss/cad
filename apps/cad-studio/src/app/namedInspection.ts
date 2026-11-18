import type { RenderCamera } from '@barocss/cad-model/engine/render';

/** Session inspection authority, not a persisted body name or array index. */
export interface InspectionBody { readonly key: string; readonly mesh: object; readonly hidden: boolean }
export interface InspectionSignature {
  readonly doc: object;
  readonly session: object;
  readonly bodies: readonly InspectionBody[];
}
export interface NamedInspection {
  readonly id: string;
  readonly name: string;
  readonly camera: RenderCamera;
  readonly visibleKeys: readonly string[];
}
const object = (value: unknown): value is object => value !== null && typeof value === 'object';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Validate without coercion or defaults; never retain the caller's target array. */
export function copyInspectionCamera(value: unknown): RenderCamera | null {
  if (!object(value)) return null;
  const c = value as Partial<RenderCamera>;
  if (!Array.isArray(c.target) || c.target.length !== 3
    || !finite(c.target[0]) || !finite(c.target[1]) || !finite(c.target[2])
    || !finite(c.distance) || c.distance <= 0 || !finite(c.yaw) || !finite(c.pitch)
    || !finite(c.fovY) || c.fovY <= 0 || c.fovY >= Math.PI || typeof c.ortho !== 'boolean') return null;
  return { target: [c.target[0], c.target[1], c.target[2]], distance: c.distance,
    yaw: c.yaw, pitch: c.pitch, fovY: c.fovY, ortho: c.ortho };
}

/** No tolerance: a different finite camera is a different inspection. */
export function sameInspectionCamera(a: unknown, b: unknown): boolean {
  const x = copyInspectionCamera(a), y = copyInspectionCamera(b);
  return !!x && !!y && x.target.every((v, i) => Object.is(v, y.target[i]))
    && Object.is(x.distance, y.distance) && Object.is(x.yaw, y.yaw)
    && Object.is(x.pitch, y.pitch) && Object.is(x.fovY, y.fovY) && x.ortho === y.ortho;
}

function copyBodies(bodies: readonly InspectionBody[]): InspectionBody[] | null {
  if (!Array.isArray(bodies)) return null;
  const keys = new Set<string>(), result: InspectionBody[] = [];
  for (const raw of bodies) {
    if (!object(raw)) return null;
    const b = raw as Partial<InspectionBody>;
    if (typeof b.key !== 'string' || !b.key.trim() || keys.has(b.key)
      || !object(b.mesh) || typeof b.hidden !== 'boolean') return null;
    keys.add(b.key); result.push({ key: b.key, mesh: b.mesh, hidden: b.hidden });
  }
  return result;
}

export function captureInspectionSignature(doc: object, session: object, bodies: readonly InspectionBody[]): InspectionSignature | null {
  if (!object(doc) || !object(session)) return null;
  const captured = copyBodies(bodies);
  return captured ? { doc, session, bodies: captured } : null;
}

/** Compare by stable keys, never index/name; retained mesh identity must still belong to this owner. */
export function currentInspectionSignature(signature: InspectionSignature, doc: object, session: object, bodies: readonly InspectionBody[]): boolean {
  if (signature.doc !== doc || signature.session !== session) return false;
  const current = copyBodies(bodies), captured = copyBodies(signature.bodies);
  if (!current || !captured || current.length !== captured.length) return false;
  const byKey = new Map(current.map(b => [b.key, b]));
  return captured.every(b => { const now = byKey.get(b.key); return now?.mesh === b.mesh && now.hidden === b.hidden; });
}

export function captureNamedInspection(
  input: { id: string; name: string; camera: unknown; visibleKeys: readonly string[] },
  signature: InspectionSignature, doc: object, session: object, bodies: readonly InspectionBody[],
): NamedInspection | null {
  if (!currentInspectionSignature(signature, doc, session, bodies)
    || typeof input.id !== 'string' || !input.id.trim() || typeof input.name !== 'string') return null;
  const name = input.name.trim(), camera = copyInspectionCamera(input.camera);
  if (!name || name.length > 80 || !camera || !Array.isArray(input.visibleKeys) || input.visibleKeys.length === 0) return null;
  const allowed = new Set(bodies.filter(b => !b.hidden).map(b => b.key)), seen = new Set<string>();
  for (const key of input.visibleKeys) {
    if (typeof key !== 'string' || !allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  return { id: input.id, name, camera, visibleKeys: [...input.visibleKeys] };
}
