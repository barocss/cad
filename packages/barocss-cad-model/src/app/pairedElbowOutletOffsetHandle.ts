import { CadNumericPolicy, type Brep } from '@barocss/cad';
import { exactPairedElbowOutletOffsetFrame } from '@barocss/cad/internal/exact-paired-elbow-offset';
import { isPairedElbowOutletOffsetSource, type StudioDoc } from '../engine/doc';
import { partBreps, type BodyResult } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import { toSig } from '../engine/references';
import { signaturesOf } from '../engine/rematch';
import { add, dot, len, scale, sub, type Vec3 } from '../engine/vec3';
import { canonical } from '../util/revision';
import type { Ctx, HandleSpec, Values } from './commands';
import { currentOffsetBody, resolveDirectOffsetFace } from './nativeOffsetFace';

interface Receipt {
  content: string; owner: string; positions: BodyResult['mesh']['positions']; indices: Uint32Array;
  anchor: Vec3; normal: Vec3;
}
const receipts = new WeakMap<StudioDoc, WeakMap<BodyResult, Receipt>>();
const nearPoint = (a: Vec3, b: Vec3) => len(sub(a, b)) <= CadNumericPolicy.linearTolerance;
const contentOf = (doc: StudioDoc) => canonical({ nodes: doc.nodes, parameters: doc.parameters, outputs: doc.outputs });
const ownerOf = (body: BodyResult) => canonical({ key: body.key, ref: body.ref, pieces: body.pieces, topology: body.topology,
  faces: body.mesh.faces.map(face => [face.index, face.id, face.name, face.kind, face.facet, face.nativePlaneName, face.exact]) });

/** Every persistent owner and incidence survives; only native geometry coefficients may move. */
function identity(brep: Brep) {
  return { source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    faces: brep.faces.map(({ surface, ...face }) => [face, surface.id]),
    coedges: brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]),
    edges: brep.edges.map(({ curve, ...edge }) => [edge, curve.id]),
    vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}

function certify(doc: StudioDoc, index: number, ctx: Ctx, source: () => Ctx): Receipt | undefined {
  const saved = doc.nodes[index], stock = doc.nodes[1], body = ctx.bodies[0];
  if (saved.kind !== 'offset-face' || stock.kind !== 'sweep-curve') return;
  const faceName = saved.faces[0], key = bodyKeyFor(doc.nodes, index, 'solid');
  if (body.key !== key || body.ref?.node !== index || body.ref.side !== 'solid' || (body.pieces ?? 1) !== 1
    || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1 || body.topology.openShells !== 0
    || body.topology.boundaryEdges !== 0) return;
  const matches = body.mesh.faces.filter(face => face.name === faceName), [face] = matches;
  if (matches.length !== 1 || face.facet || face.nativePlaneName !== faceName || face.exact?.kind !== 'plane') return;
  const original = source(), picked = original.selection.faces[0], originalBody = original.bodies[picked?.body];
  if (!originalBody || original.bodies.length !== 1 || original.doc.nodes.length !== 2
    || canonical(original.doc.nodes) !== canonical(doc.nodes.slice(0, 2))
    || originalBody.key !== bodyKeyFor(doc.nodes, 1, 'solid') || originalBody.ref?.node !== 1
    || originalBody.ref.side !== 'solid') return;
  const originalFace = originalBody.mesh.faces[picked.face], frame = resolveDirectOffsetFace(original);
  const signature = signaturesOf(originalBody, 'individual').faces.get(faceName);
  if (!frame || frame.parent.node !== 1 || frame.parent.side !== 'solid' || frame.face !== faceName
    || originalFace?.name !== faceName || originalFace.id !== face.id || !signature
    || canonical(toSig(signature)) !== canonical(saved.sigs?.[faceName])) return;
  currentOffsetBody(doc, body);
  const before = partBreps(original.doc).filter(native => native.key === originalBody.key);
  const after = partBreps(doc).filter(native => native.key === body.key);
  if (before.length !== 1 || after.length !== 1 || canonical(identity(before[0].brep)) !== canonical(identity(after[0].brep))) return;
  const nativeBefore = before[0].brep.faces.filter(native => native.name === faceName);
  const nativeAfter = after[0].brep.faces.filter(native => native.name === faceName);
  if (nativeBefore.length !== 1 || nativeAfter.length !== 1 || nativeBefore[0].id !== face.id || nativeAfter[0].id !== face.id) return;
  const path = structuredClone(stock.path), distance = saved.distance!;
  path.controlPoints[5] = add(path.controlPoints[5], scale(frame.normal, distance / 2));
  path.controlPoints[6] = add(path.controlPoints[6], scale(frame.normal, distance));
  const moved = exactPairedElbowOutletOffsetFrame(after[0].brep, faceName, {
    id: featureId(doc.nodes, 1), mode: 'exact', path: { kind: 'curve', id: 'path', ...path },
  });
  const expected = add(frame.anchor, scale(frame.normal, distance));
  if (!moved || !nearPoint(moved.anchor, expected) || len(sub(moved.normal, frame.normal)) > 1e-12
    || len(sub(face.exact.n, frame.normal)) > 1e-12
    || Math.abs(dot(sub(face.exact.o, moved.anchor), frame.normal)) > CadNumericPolicy.linearTolerance) return;
  return { content: contentOf(doc), owner: ownerOf(body), positions: body.mesh.positions, indices: body.mesh.indices,
    anchor: [...frame.anchor], normal: [...frame.normal] };
}

/** History owns the current body; the original native outlet owns the signed distance origin. */
export function savedPairedElbowOutletOffsetHandle(doc: StudioDoc, index: number, ctx: Ctx, values: Values,
  source: () => Ctx): HandleSpec[] {
  if (ctx.doc !== doc || doc.schema !== 3 || index !== 2 || doc.nodes.length !== 3 || ctx.bodies.length !== 1
    || ctx.direct?.length || doc.instances?.length || doc.variability || doc.configurations || Object.hasOwn(doc, 'routeBundles')
    || values.offsetMode === 'to-plane' || Object.keys(doc.outputs).length !== 1) return [];
  const saved = doc.nodes[index], stock = doc.nodes[1], sketch = doc.nodes[0], distance = Number(values.d);
  if (saved.kind !== 'offset-face' || saved.suppressed || saved.held !== undefined || Object.keys(saved.rematched ?? {}).length
    || saved.target !== undefined || saved.parent.node !== 1 || saved.parent.side !== 'solid' || saved.faces.length !== 1
    || typeof saved.distance !== 'number' || !Number.isFinite(saved.distance) || saved.distance === 0
    || !Number.isFinite(distance) || Math.sign(distance) !== Math.sign(saved.distance)
    || stock.kind !== 'sweep-curve' || stock.sketch !== 0 || sketch.kind !== 'sketch' || sketch.suppressed || sketch.held !== undefined
    || !isPairedElbowOutletOffsetSource(doc.nodes, 1, saved.faces[0])) return [];
  const ids = doc.nodes.map((_, slot) => featureId(doc.nodes, slot)), key = bodyKeyFor(doc.nodes, index, 'solid');
  if (new Set(ids).size !== 3 || doc.outputs[key]?.node !== index || doc.outputs[key]?.side !== 'solid') return [];
  const body = ctx.bodies[0];
  let byBody = receipts.get(doc), receipt = byBody?.get(body);
  if (!receipt) {
    try { receipt = certify(doc, index, ctx, source); } catch { return []; }
    if (!receipt) return [];
    if (!byBody) { byBody = new WeakMap(); receipts.set(doc, byBody); }
    byBody.set(body, receipt);
  }
  if (contentOf(doc) !== receipt.content || ownerOf(body) !== receipt.owner
    || body.mesh.positions !== receipt.positions || body.mesh.indices !== receipt.indices) return [];
  const at = add(receipt.anchor, scale(receipt.normal, distance));
  if (!at.every(Number.isFinite) || at.every((value, axis) => value === receipt.anchor[axis])) return [];
  const limit = distance < 0 ? { max: Math.max(-.1, distance, saved.distance) } : { min: Math.min(.1, distance, saved.distance) };
  return [{ key: 'd', at, dir: [...receipt.normal], step: .5, ...limit }];
}
