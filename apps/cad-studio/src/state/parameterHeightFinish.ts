import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
import { isRectangleFinishHeightResize, proveRectangleFinishResize } from './rectangleFinishResize';

function same(a: unknown, b: unknown): boolean {
 if (a === b) return true;
 if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
 const ak = Object.keys(a), bk = Object.keys(b);
 return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
function positiveFinish(dim: unknown, doc: StudioDoc): boolean {
 if (positive(dim)) return true;
 if (!dim || typeof dim !== 'object' || Array.isArray(dim) || Object.keys(dim).length !== 1 || !Object.hasOwn(dim, 'parameter')) return false;
 const key = (dim as { parameter: unknown }).parameter, ex = doc.nodes[1];
 // The changed Height parameter must have no second dimensional consumer.
 return typeof key === 'string' && Object.hasOwn(doc.parameters, key) && positive(doc.parameters[key])
  && ex?.kind === 'extrude' && typeof ex.height === 'object' && ex.height !== null && key !== ex.height.parameter;
}
const allowed = new Set(['format', 'schema', 'units', 'nextId', 'parameters', 'nodes', 'outputs']);
function supported(doc: StudioDoc): boolean {
 if (Object.entries(doc).some(([key, value]) => value !== undefined && !allowed.has(key)) || doc.nodes.length !== 3) return false;
 if (doc.format !== 'barocss-cad-model' || doc.schema !== 3 || doc.units !== 'mm') return false;
 const ids = doc.nodes.map(n => n.id);
 if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== 3) return false;
 const entries = Object.entries(doc.outputs), key = bodyKeyFor(doc.nodes, 2, 'solid');
 if (entries.length !== 1 || entries[0][0] !== key || !same(entries[0][1], { node: 2, side: 'solid' })) return false;
 const finish = doc.nodes[2];
 return finish.kind === 'fillet' ? positiveFinish(finish.radius, doc) && finish.radii === undefined : finish.kind === 'chamfer' && positiveFinish(finish.distance, doc);
}
function proofCopies(before: StudioDoc, next: StudioDoc): [StudioDoc, StudioDoc] | null {
 if (!supported(before) || !supported(next)) return null;
 // Undefined UI-only fields carry no consumer; all defined fields except parameters must be identical.
 const rest = (doc: StudioDoc) => Object.fromEntries(Object.entries(doc).filter(([key, value]) => key !== 'parameters' && value !== undefined));
 if (!same(rest(before), rest(next))) return null;
 const ex = before.nodes[1]; if (ex.kind !== 'extrude') return null;
 const binding = ex.height;
 if (!binding || typeof binding !== 'object' || Array.isArray(binding) || Object.keys(binding).length !== 1 || !Object.hasOwn(binding, 'parameter') || typeof binding.parameter !== 'string') return null;
 const key = binding.parameter, keys = Object.keys(before.parameters);
 if (!Object.hasOwn(before.parameters, key) || !Object.hasOwn(next.parameters, key) || keys.length !== Object.keys(next.parameters).length
  || !keys.every(k => Object.hasOwn(next.parameters, k) && (k === key || same(before.parameters[k], next.parameters[k])))) return null;
 const oldHeight = before.parameters[key], newHeight = next.parameters[key];
 if (!positive(oldHeight) || !positive(newHeight) || oldHeight === newHeight) return null;
 const copy = (doc: StudioDoc, height: number): StudioDoc => ({ ...before, nodes: doc.nodes.map((node, i) => i === 1 ? { ...ex, height } : node), parameters: before.parameters });
 const oldProof = copy(before, oldHeight), newProof = copy(next, newHeight);
 // This also proves remaining dimensions are numeric or independent constant finish bindings and every node field is in the bounded box contract.
 return isRectangleFinishHeightResize(oldProof, newProof, 1) ? [oldProof, newProof] : null;
}
export interface ParameterHeightFinishOptions {
 before: StudioDoc;
 next: StudioDoc;
 evaluateParent(doc: StudioDoc, revision: number): Promise<EvalResult | undefined>;
 nextRevision(): number;
 isCurrent(): boolean;
}
/** Prepare reference evidence only. Installation and final full evaluation remain owned by the caller. */
export async function prepareParameterHeightFinish({ before, next, evaluateParent, nextRevision, isCurrent }: ParameterHeightFinishOptions): Promise<StudioDoc> {
 const proofs = proofCopies(before, next);
 if (!proofs) return next;
 const fail = () => new Error('Height not applied: the original finishing edge could not be verified. The accepted document is unchanged.');
 const current = () => { if (!isCurrent()) throw fail(); };
 current();
 const oldRevision = nextRevision(), old = await evaluateParent(prefixDoc(before, 2), oldRevision);
 current(); if (!old?.ok || old.revision !== oldRevision) throw fail();
 const newRevision = nextRevision(), updated = await evaluateParent(prefixDoc(next, 2), newRevision);
 current(); if (!updated?.ok || updated.revision !== newRevision) throw fail();
 const proved = proveRectangleFinishResize(proofs[0], proofs[1], old.bodies, updated.bodies);
 if (!proved) throw fail();
 const finish = proved.nodes[2];
 if (finish.kind !== 'fillet' && finish.kind !== 'chamfer') throw fail();
 return { ...next, nodes: next.nodes.map((node, i) =>
  i === 2 && (node.kind === 'fillet' || node.kind === 'chamfer') ? { ...node, sigs: finish.sigs } : node) };
}
