import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { rectangularShellFaces, rectangularShellOpening } from '@barocss/cad-model/engine/rectangularShellOpening';
import { CadPartLimits } from '@barocss/cad';
import { rectangleTopology } from './rectangleFinishResize';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0 && v <= CadPartLimits.length;
const only = (v: object, keys: readonly string[]) => Object.keys(v).every(k => keys.includes(k));
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>, keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every(k => Object.hasOwn(y, k) && same(x[k], y[k]));
}
function opening(doc: StudioDoc) {
  const shell = doc.nodes[2];
  if (shell?.kind === 'shell' && Array.isArray(shell.open)) return rectangularShellOpening(shell.open, featureId(doc.nodes, 1));
}
function eligible(doc: StudioDoc): boolean {
  if (doc.nodes.length !== 3 || doc.direct !== undefined || doc.instances?.length) return false;
  const [sk, ex, sh] = doc.nodes;
  if (sk.kind !== 'sketch' || sk.profile !== 'rectangle' || !only(sk, ['id', 'kind', 'profile', 'min', 'max'])
    || sk.min.length !== 2 || sk.max.length !== 2 || ![...sk.min, ...sk.max].every(finite)
    || !(Number(sk.max[0]) > Number(sk.min[0]) && Number(sk.max[1]) > Number(sk.min[1]))) return false;
  if (ex.kind !== 'extrude' || ex.sketch !== 0 || !only(ex, ['id', 'kind', 'sketch', 'height', 'from', 'draft'])
    || !positive(ex.height) || (ex.from !== undefined && !finite(ex.from)) || (ex.draft !== undefined && ex.draft !== 0)) return false;
  return sh.kind === 'shell' && only(sh, ['id', 'kind', 'parent', 'thickness', 'open', 'sigs'])
    && only(sh.parent, ['node', 'side']) && sh.parent.node === 1 && sh.parent.side === 'solid'
    && positive(sh.thickness) && opening(doc) !== undefined;
}
/** A draft changes only the opening. Old signatures remain untouched until native parent proof. */
export function isShellOpeningChange(before: StudioDoc, next: StudioDoc, index: number): boolean {
  if (index !== 2 || !eligible(before) || !eligible(next) || opening(before) === opening(next)) return false;
  return same({ ...before, nodes: [] }, { ...next, nodes: [] })
    && same(before.nodes[0], next.nodes[0]) && same(before.nodes[1], next.nodes[1])
    && same({ ...before.nodes[2], open: [] }, { ...next.nodes[2], open: [] });
}
/** Verify the exact faces on the unchanged whole native parent before replacing the signature. */
export function proveShellOpeningChange(before: StudioDoc, next: StudioDoc, bodies: readonly BodyResult[]): StudioDoc | null {
  if (!isShellOpeningChange(before, next, 2) || bodies.length !== 1) return null;
  const body = bodies[0];
  if (body.ref?.node !== 1 || body.ref.side !== 'solid' || body.key !== bodyKeyFor(before.nodes, 1, 'solid')) return null;
  const topology = rectangleTopology(before, body); if (!topology) return null;
  const sk = before.nodes[0], ex = before.nodes[1], old = before.nodes[2], requested = next.nodes[2];
  if (sk.kind !== 'sketch' || sk.profile !== 'rectangle' || ex.kind !== 'extrude' || old.kind !== 'shell' || requested.kind !== 'shell') return null;
  const faces = signaturesOf(body, 'plane').faces, verified = new Map<string, ReturnType<typeof toSig>>();
  const min = [Number(sk.min[0]), Number(sk.min[1]), Number(ex.from ?? 0)];
  const max = [Number(sk.max[0]), Number(sk.max[1]), min[2] + Number(ex.height)];
  for (const { suffix, axis, side } of rectangularShellFaces) {
    const name = `${featureId(before.nodes, 1)}.${suffix}`;
    if (topology.faceNames.get(`${axis}:${side}`) !== name) return null;
    const sig = faces.get(name);
    const centre = min.map((start, i) => i === axis ? (side === 0 ? start : max[i]) : (start + max[i]) / 2);
    const area = min.reduce((product, start, i) => i === axis ? product : product * (max[i] - start), 1);
    if (!sig || sig.kind !== 'plane' || sig.shared !== undefined || !sig.dir || !finite(sig.size) || !finite(area)
      || Math.abs(sig.size - area) > 1e-9 * Math.max(1, area)
      || sig.at.some((v, i) => !finite(v) || Math.abs(v - centre[i]) > 1e-9 * Math.max(1, Math.abs(centre[i])))
      || sig.dir.some((v, i) => v !== (i === axis ? side === 0 ? -1 : 1 : 0))) return null;
    verified.set(name, toSig(sig));
  }
  // A missing, stale, shared or unrelated signature must not be silently repaired by changing mode.
  if (Object.keys(old.sigs ?? {}).some(name => !old.open.includes(name))
    || old.open.some(name => !same(old.sigs?.[name], verified.get(name)))) return null;
  const sigs = Object.fromEntries(requested.open.map(name => [name, verified.get(name)!]));
  return { ...next, nodes: next.nodes.map((node, i) => i === 2 ? { ...requested, sigs } : node) };
}
