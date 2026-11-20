import { isBoredCapOffsetSource, offsetFaceGroup, prefixDoc, usesOf, type BodyRef, type ModelNode, type StudioDoc } from '../engine/doc';
import { evaluateDoc } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command, Ctx } from './commands';
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

const rejected = (hint: string): never => { throw refusal('BAD_REFERENCE', `Offset face: ${hint}`); };

function capContext(doc: StudioDoc, parent: BodyRef, face: string): Ctx {
  const key = bodyKeyFor(doc.nodes, parent.node, parent.side);
  const result = evaluateDoc(doc, 0);
  if (!result.ok) return rejected('the original History prefix cannot be evaluated.');
  const bodies = result.bodies, match = bodies.flatMap((body, i) => body.key === key
    && body.ref?.node === parent.node && body.ref.side === parent.side ? [i] : []);
  if (match.length !== 1) return rejected('the original stock is missing or ambiguous.');
  const [body] = match, faces = bodies[body].mesh.faces.filter(candidate => candidate.name === face && candidate.kind === 'plane' && !candidate.facet);
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
  const allowPlane = !!direct && !isBoredCapOffsetSource(doc.nodes, direct.parent.node);
  let directSource: Ctx | undefined;
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
    steps: (ctx, values) => [{ label: 'Face', text: describe(() => directSource ??= capContext(prefixDoc(doc, index), direct.parent, direct.faces[0]), direct.faces[0]), done: true },
      ...(values.offsetMode === 'to-plane' ? [offsetPlaneStep(values, direct.target, ctx)] : offsetFaceCommand.steps?.(ctx, values).filter(step => step.label !== 'Face') ?? [])],
    onPick: allowPlane ? (ctx, values, hit) => pickOffsetPlane(ctx, values, hit.face, direct.parent, index) : undefined,
    build: (ctx, values) => {
      if (ctx.doc !== doc || ctx.doc.nodes[index] !== direct) return rejected('open the current Offset face in History again.');
      const { target: priorTarget, distance: priorDistance, ...recipe } = direct;
      const nodes = [...doc.nodes];
      if (values.offsetMode === 'to-plane') {
        if (!allowPlane) return rejected('this through-hole plate cap needs a signed distance.');
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
