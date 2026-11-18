import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
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
function eligible(doc: StudioDoc): boolean {
  if (doc.nodes.length !== 3 || doc.direct !== undefined || doc.instances?.length) return false;
  const [sk, ex, f] = doc.nodes;
  if (sk.kind !== 'sketch' || sk.profile !== 'rectangle' || !only(sk, ['id', 'kind', 'profile', 'min', 'max'])
    || sk.min.length !== 2 || sk.max.length !== 2 || ![...sk.min, ...sk.max].every(finite)
    || !(Number(sk.max[0]) > Number(sk.min[0]) && Number(sk.max[1]) > Number(sk.min[1]))) return false;
  if (ex.kind !== 'extrude' || ex.sketch !== 0 || !only(ex, ['id', 'kind', 'sketch', 'height', 'from', 'draft'])
    || !positive(ex.height) || (ex.from !== undefined && !finite(ex.from)) || (ex.draft !== undefined && ex.draft !== 0)) return false;
  if (f.kind !== 'fillet' || !only(f, ['id', 'kind', 'parent', 'edges', 'radius', 'section', 'sigs'])
    || !only(f.parent, ['node', 'side']) || f.parent.node !== 1 || f.parent.side !== 'solid' || !positive(f.radius)
    || !Array.isArray(f.edges) || f.edges.length !== 1 || typeof f.edges[0] !== 'string' || !f.edges[0]) return false;
  return f.section === undefined || f.section.kind === 'conic' && only(f.section, ['kind', 'rho']) && finite(f.section.rho) && f.section.rho > 0 && f.section.rho < 1;
}
/** Only a type transition, not a coefficient/radius/source change. */
export function isFilletSectionChange(before: StudioDoc, next: StudioDoc, index: number): boolean {
  if (index !== 2 || !eligible(before) || !eligible(next)) return false;
  const a = before.nodes[2], b = next.nodes[2]; if (a.kind !== 'fillet' || b.kind !== 'fillet') return false;
  if ((a.section === undefined) === (b.section === undefined)) return false;
  if (b.section === undefined && Object.hasOwn(b, 'section')) return false;
  return same({ ...before, nodes: [] }, { ...next, nodes: [] }) && same(before.nodes[0], next.nodes[0]) && same(before.nodes[1], next.nodes[1])
    && same({ ...a, section: undefined }, { ...b, section: undefined });
}
/** Approve only the unchanged, individually signed original straight edge of a whole native box. */
export function proveFilletSectionChange(before: StudioDoc, next: StudioDoc, bodies: readonly BodyResult[]): boolean {
  if (!isFilletSectionChange(before, next, 2) || bodies.length !== 1) return false;
  const body = bodies[0], feature = before.nodes[2]; if (feature.kind !== 'fillet') return false;
  if (body.ref?.node !== 1 || body.ref.side !== 'solid' || body.key !== bodyKeyFor(before.nodes, 1, 'solid')) return false;
  const topology = rectangleTopology(before, body); if (!topology) return false;
  const name = feature.edges[0], edges = body.mesh.edges.filter(edge => edge.names.length === 1 && edge.names[0] === name);
  if (edges.length !== 1) return false;
  const edge = edges[0];
  if (!edge.nativeLine || !edge.nativeJoint || !edge.nativeVertices || edge.nativeVertices.length !== 2
    || edge.nativeVertices[0] === edge.nativeVertices[1] || ![...topology.edges.values()].includes(edge.nativeJoint.edgeId)) return false;
  const sig = signaturesOf(body).edges.get(name);
  return !!sig && sig.shared === undefined && sig.kind === 'line'
    && Object.keys(feature.sigs ?? {}).length === 1 && Object.hasOwn(feature.sigs ?? {}, name) && same(feature.sigs![name], toSig(sig));
}
