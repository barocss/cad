import { draftedFaceOffsetFrame } from '@barocss/cad/internal/drafted-cap-offset';
import { isBoredPlateOffsetSource, isBoxCapOffsetSource, offsetFaceGroup, prefixDoc, usesOf, type BodyRef, type ModelNode, type StudioDoc } from '../engine/doc';
import { evaluateDoc, partBreps } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import type { DisplayFace } from '../engine/mesh';
import { toSig } from '../engine/references';
import { signaturesOf } from '../engine/rematch';
import { dot, sub, type Vec3 } from '../engine/vec3';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command, Ctx, HandleSpec, Values } from './commands';
import { captureOffsetPlane, offsetFields, offsetPlaneStep, pickOffsetPlane, resetOffsetPlane, restoreOffsetPlaneValues } from './offsetPlanePick';
import { buildNativeOffsetFace, checkDirectOffsetDistance, offsetFaceDescription, offsetFaceCommand } from './profileCommands';

export const OFFSET_FACE_EDIT = 'offset-face-edit';

function offsetHistory(doc: StudioDoc, index: number) {
  const group = offsetFaceGroup(doc.nodes, index);
  if (!group) return;
  const { operation, sketch, tool, start } = group;
  if (operation.suppressed || operation.held || operation.rematched || sketch.suppressed || tool.suppressed
    || !sketch.id || !tool.id || !operation.id) return;
  if (doc.nodes.some((node, i) => (i < start || i > index) && usesOf(node, doc.nodes).some(ref => ref === start || ref === start + 1))) return;
  const ids = [sketch.id, tool.id, operation.id];
  if (new Set(ids).size !== 3 || ids.some(id => doc.nodes.filter(node => node.id === id).length !== 1)) return;
  return group;
}

function directOffsetAt(doc: StudioDoc, index: number) {
  const node = doc.nodes[index];
  if (node?.kind !== 'offset-face' || node.suppressed || node.held || Object.keys(node.rematched ?? {}).length) return;
  return node;
}

export function canEditSavedOffsetFace(doc: StudioDoc, index: number): boolean {
  return !!(directOffsetAt(doc, index) ?? offsetHistory(doc, index));
}

type SavedWallFrame = { anchor: Vec3; normal: Vec3 };

function savedDraftWallFrame(source: Ctx, face: DisplayFace, saved: Extract<ModelNode, { kind: 'offset-face' }>): SavedWallFrame | undefined {
  const pick = source.selection.faces[0], body = source.bodies[pick.body], original = body.mesh.faces[pick.face];
  const signature = signaturesOf(body, 'plane').faces.get(face.name);
  if (!signature || canonical(toSig(signature)) !== canonical(saved.sigs?.[face.name]) ||
    face.id !== original.id || face.exact?.kind !== 'plane' || face.nativeAxisPlane) return;
  const native = partBreps(source.doc).filter(candidate => candidate.key === body.key);
  if (native.length !== 1) return;
  const frame = draftedFaceOffsetFrame(native[0].brep, face.name);
  if (!frame || frame.normal[0] <= 0 || Math.abs(frame.normal[1]) > 1e-12 || frame.normal[2] <= 0 ||
    Math.abs(dot(frame.normal, face.exact.n) - 1) > 1e-12) return;
  const distance = Number(saved.distance);
  const measured = dot(frame.normal, sub(face.exact.o, frame.anchor));
  const roundoff = 64 * Number.EPSILON * Math.max(1, ...face.exact.o.map(Math.abs), ...frame.anchor.map(Math.abs));
  if (!Number.isFinite(measured) || Math.abs(distance) <= 2 * roundoff || Math.abs(measured - distance) > roundoff) return;
  return frame;
}

/** Frame from the evaluated terminal taper. The typed editor also supports other Offset profiles. */
function savedDraftOffsetHandle(doc: StudioDoc, index: number, ctx: Ctx, values: Values,
  wallFrame: (face: DisplayFace) => SavedWallFrame | undefined): HandleSpec[] {
  if (ctx.doc !== doc || doc.schema !== 3 || index !== 2 || doc.nodes.length !== 3 || doc.direct !== undefined ||
    doc.instances?.length || doc.variability || doc.configurations || Object.hasOwn(doc,'routeBundles') ||
    values.offsetMode === 'to-plane' || ctx.bodies.length !== 1 || Object.keys(doc.outputs).length !== 1) return [];
  const [sketch,stock,saved] = doc.nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' ||
    Object.keys(sketch).some(k => !['id','kind','profile','min','max'].includes(k)) ||
    sketch.min.length !== 2 || sketch.max.length !== 2 || ![...sketch.min,...sketch.max].every(Number.isFinite) ||
    stock.kind !== 'extrude' || stock.sketch !== 0 || stock.suppressed || stock.held !== undefined ||
    stock.from !== undefined || stock.cutDepth !== undefined || typeof stock.height !== 'number' ||
    !Number.isFinite(stock.height) || stock.height <= 0 || typeof stock.draft !== 'number' ||
    !Number.isFinite(stock.draft) || stock.draft <= 0 ||
    saved.kind !== 'offset-face' || !directOffsetAt(doc,index) || saved.target !== undefined ||
    saved.parent.node !== 1 || saved.parent.side !== 'solid' || saved.faces.length !== 1 ||
    typeof saved.distance !== 'number' || !Number.isFinite(saved.distance) || saved.distance === 0) return [];
  const stockId = featureId(doc.nodes,1), [faceName] = saved.faces;
  const [body] = ctx.bodies, key = bodyKeyFor(doc.nodes,index,'solid');
  if (doc.outputs[key]?.node !== index || doc.outputs[key]?.side !== 'solid' ||
    body.key !== key || body.ref?.node !== index || body.ref.side !== 'solid' || (body.pieces ?? 1) !== 1 ||
    body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1 || body.topology.openShells !== 0 ||
    body.topology.boundaryEdges !== 0 || body.mesh.faces.length !== 6) return [];
  const matches = body.mesh.faces.filter(face => face.name === faceName);
  const [face] = matches, distance = Number(values.d);
  if (matches.length !== 1 || face.nativePlaneName !== faceName || !Number.isFinite(distance) ||
    Math.sign(distance) !== Math.sign(saved.distance)) return [];
  const sameSignLimit = distance < 0 ? { max:Math.max(-.1,distance,saved.distance) } : { min:Math.min(.1,distance) };
  if (faceName === stockId + '.side1') {
    const frame = wallFrame(face);
    if (!frame) return [];
    const [x,y,z] = frame.anchor, next = x + distance / frame.normal[0];
    if (!Number.isFinite(next) || next === x) return [];
    return [{ key:'d', at:[next,y,z], dir:frame.normal, step:.5, ...sameSignLimit }];
  }
  if (faceName !== stockId + '.top' && faceName !== stockId + '.bottom') return [];
  const sign = faceName === stockId + '.bottom' ? -1 : 1;
  const sourceZ = sign < 0 ? 0 : stock.height;
  const signature = saved.sigs?.[faceName];
  const centre = [(Number(sketch.min[0]) + Number(sketch.max[0])) / 2, (Number(sketch.min[1]) + Number(sketch.max[1])) / 2];
  const direction: [number,number,number] = [0,0,sign];
  if (signature?.k !== 'plane' || signature.n !== undefined ||
    !Number.isFinite(signature.s) || signature.s <= 0 ||
    !signature.d || signature.d.length !== 3 || signature.d.some((v,k) => v !== direction[k])) return [];
  const original = toSig({kind:'plane',at:[centre[0],centre[1],sourceZ],dir:direction,size:signature.s});
  if (signature.p.length !== 3 || signature.p.some((v,k) => v !== original.p[k])) return [];
  const z = sourceZ + sign * saved.distance, draftZ = sourceZ + sign * distance;
  if (face.nativeAxisPlane?.axis !== 'z' ||
    face.nativeAlignFace?.axis !== 'z' || face.nativeAlignFace.sign !== sign || face.exact?.kind !== 'plane' ||
    face.exact.n.some((v,k) => v !== direction[k]) ||
    face.nativeAxisPlane.at !== z || !Number.isFinite(z) || z === sourceZ ||
    !Number.isFinite(draftZ) || draftZ === sourceZ) return [];
  return [{ key:'d', at:[centre[0],centre[1],draftZ], dir:direction, step:.5, ...sameSignLimit }];
}

const rejected = (hint: string): never => { throw refusal('BAD_REFERENCE', `Offset face: ${hint}`); };

function capContext(doc: StudioDoc, parent: BodyRef, face: string): Ctx {
  const key = bodyKeyFor(doc.nodes, parent.node, parent.side);
  const result = evaluateDoc(doc, 0);
  if (!result.ok) return rejected('the original History prefix cannot be evaluated.');
  const bodies = result.bodies, match = bodies.flatMap((body, i) => body.key === key
    && body.ref?.node === parent.node && body.ref.side === parent.side ? [i] : []);
  if (match.length !== 1) return rejected('the original stock is missing or ambiguous.');
  const [body] = match, faces = bodies[body].mesh.faces.filter(candidate => candidate.name === face && (candidate.kind === 'plane' || candidate.exact?.kind === 'plane') && !candidate.facet);
  if (faces.length !== 1) return rejected('the named original cap is unavailable.');
  return { doc, bodies, selection: { faces: [{ body, face: faces[0].index }], edges: [], bodies: [] } };
}

/** Legacy cap tools are stored at absolute source coordinates. Do not publish
 * an upstream edit when a later authored recipe would silently stay there. */
function preserveFollowingOffsetRecipes(doc: StudioDoc, index: number): StudioDoc {
  const dependent = new Map<number, boolean>();
  const dependsOnEdit = (node: number): boolean => {
    if (node === index) return true;
    if (node < index || !doc.nodes[node]) return false;
    const cached = dependent.get(node); if (cached !== undefined) return cached;
    // History references point backwards; this also fails closed for a cycle.
    dependent.set(node, true);
    const result = usesOf(doc.nodes[node], doc.nodes).some(dependsOnEdit);
    dependent.set(node, result); return result;
  };
  for (let later = index + 1; later < doc.nodes.length; later++) {
    const group = offsetFaceGroup(doc.nodes, later);
    if (!group || group.operation.suppressed || group.operation.held || !dependsOnEdit(group.target.node)) continue;
    const hint = `downstream Offset face ${featureId(doc.nodes, later)} depends on the original cap. Cancel this edit, remove that downstream Offset, then edit this Offset and recreate the downstream Offset on the current cap.`;
    try {
      const source = capContext(prefixDoc(doc, group.start), group.target, group.face);
      const ids = doc.nodes.slice(group.start, later + 1).map((_, i) => featureId(doc.nodes, group.start + i));
      const original = doc.nodes.slice(group.start, later + 1).map((node, i) => {
        if (i !== 2) return node;
        const result = { ...node } as ModelNode & { made?: unknown };
        delete result.made; delete result.bought; return result;
      });
      const rebuilt = buildNativeOffsetFace(source, group.d, ids);
      if (canonical(rebuilt.nodes.slice(group.start)) !== canonical(original)) return rejected(hint);
    } catch { return rejected(hint); }
  }
  return doc;
}

/** Edit the direct native operation or rebuild the legacy cap recipe at its original History slot. */
export function editSavedOffsetFaceCommand(doc: StudioDoc, index: number): Command | null {
  const direct = directOffsetAt(doc, index);
  const circularWall = direct?.sigs?.[direct.faces[0]]?.k === 'curved';
  const allowPlane = !!direct && !circularWall && !isBoredPlateOffsetSource(doc.nodes, direct.parent.node) && !isBoxCapOffsetSource(doc.nodes, direct.parent.node);
  let directSource: Ctx | undefined;
  const getDirectSource = (node: NonNullable<typeof direct>) =>
    directSource ??= capContext(prefixDoc(doc, index), node.parent, node.faces[0]);
  const wallFrames = new WeakMap<DisplayFace, SavedWallFrame | null>();
  const describe = (getSource: () => Ctx, face: string) => {
    try { return offsetFaceDescription(getSource(), face); } catch { return face; }
  };
  if (direct) return {
    id: OFFSET_FACE_EDIT, label: 'Edit Offset face', icon: 'cad-extrude', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Offset face in History again.' },
    fields: () => offsetFields(allowPlane),
    defaults: ctx => {
      if (!allowPlane) return { d: direct.distance ?? 2 };
      const values = { d: direct.distance ?? 2, offsetMode: direct.target ? 'to-plane' : 'distance' };
      return direct.target && ctx.doc === doc ? restoreOffsetPlaneValues(ctx, values, direct.target) : values;
    },
    derive: resetOffsetPlane,
    steps: (ctx, values) => [{ label: 'Face', text: circularWall ? 'Cylindrical wall · Radial' : describe(() => getDirectSource(direct), direct.faces[0]), done: true },
      ...(values.offsetMode === 'to-plane' ? [offsetPlaneStep(values, direct.target, ctx)] : offsetFaceCommand.steps?.(ctx, values).filter(step => step.label !== 'Face') ?? [])],
    onPick: allowPlane ? (ctx, values, hit) => pickOffsetPlane(ctx, values, hit.face, direct.parent, index) : undefined,
    handles: (ctx, values) => savedDraftOffsetHandle(doc,index,ctx,values,face => {
      if (!wallFrames.has(face)) {
        let checked: SavedWallFrame | undefined;
        try { checked = savedDraftWallFrame(getDirectSource(direct), face, direct); } catch { /* The typed editor remains available. */ }
        wallFrames.set(face, checked ?? null);
      }
      return wallFrames.get(face) ?? undefined;
    }),
    build: (ctx, values) => {
      if (ctx.doc !== doc || ctx.doc.nodes[index] !== direct) return rejected('open the current Offset face in History again.');
      const { target: priorTarget, distance: priorDistance, ...recipe } = direct;
      const nodes = [...doc.nodes];
      if (values.offsetMode === 'to-plane') {
        if (!allowPlane) return rejected('this face needs a signed distance.');
        if (priorTarget && values.keepPlane === 1) return doc;
        const target = captureOffsetPlane(ctx, values, direct.parent, index);
        nodes[index] = { ...recipe, target };
      } else {
        const distance = Number(values.d);
        checkDirectOffsetDistance(distance);
        if (distance === priorDistance) return doc;
        nodes[index] = { ...recipe, distance };
      }
      return preserveFollowingOffsetRecipes({ ...doc, nodes }, index);
    },
  };
  const saved = offsetHistory(doc, index);
  if (!saved) return null;
  const { start, target } = saved, key = featureId(doc.nodes, index);
  let prefix: StudioDoc | undefined;
  let source: Ctx | undefined;
  const getSource = () => source ??= capContext(prefix ??= prefixDoc(doc, start), target, saved.face);
  const ids = doc.nodes.slice(start, index + 1).map((_, i) => featureId(doc.nodes, start + i));
  const existing = doc.nodes.slice(start, index + 1).map((node, i) => {
    if (i !== 2) return node;
    const result = { ...node } as ModelNode & { made?: unknown };
    delete result.made;
    delete result.bought;
    return result;
  });
  let checked = false, last: { distance: number; doc: StudioDoc } | undefined;
  return {
    id: OFFSET_FACE_EDIT, label: 'Edit Offset face', icon: 'cad-extrude', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Offset face in History again.' },
    fields: () => offsetFields(false),
    defaults: () => ({ d: saved.d }),
    steps: (ctx, values) => [{ label: 'Face', text: describe(getSource, saved.face), done: true }, ...(offsetFaceCommand.steps?.(ctx, values).filter(step => step.label !== 'Face') ?? [])],
    build: (ctx, values) => {
      if (ctx.doc !== doc || featureId(ctx.doc.nodes, index) !== key) return rejected('open the current Offset face in History again.');
      const d = Number(values.d);
      if (last?.distance === d) return last.doc;
      const prefixContext = getSource();
      if (!checked) {
        const original = buildNativeOffsetFace(prefixContext, saved.d, ids);
        if (canonical(original.nodes.slice(start)) !== canonical(existing))
          return rejected('the original cap or stored Offset recipe changed. Recreate the Offset on the current cap.');
        checked = true;
      }
      if (d === saved.d) return doc;
      const [sketch, tool, operation] = buildNativeOffsetFace(prefixContext, d, ids).nodes.slice(start);
      if (operation?.kind !== 'union' && operation?.kind !== 'difference')
        return rejected('the replacement did not produce the original three operations.');
      const updated = { ...operation, made: { ...saved.operation.made!, values: { d, face: saved.face } },
        ...(saved.operation.bought === undefined ? {} : { bought: saved.operation.bought }) };
      const candidate = { ...doc, nodes: [...doc.nodes.slice(0, start), sketch, tool, updated, ...doc.nodes.slice(index + 1)] };
      preserveFollowingOffsetRecipes(candidate, index);
      last = { distance: d, doc: candidate };
      return candidate;
    },
  };
}
