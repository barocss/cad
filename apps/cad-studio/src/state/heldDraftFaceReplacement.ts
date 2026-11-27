import { commandById } from '@barocss/cad-model/app/commands';
import { prefixDoc, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import { isSplitCapFace, signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig, type Problem } from '@barocss/cad-model/engine/references';

type Draft = Extract<ModelNode, { kind: 'draft' }>;
type Owner = {
  doc: StudioDoc;
  index: number;
  problems: readonly Problem[];
  bodies: readonly BodyResult[];
  /** Must check exact document/evaluated/history/editor lifetime and worker generation, not just revision numbers. */
  isCurrent(): boolean;
};
type Hit = { face: { body: number; face: number } | null; faceMesh?: BodyResult['mesh']; instance?: string };
type Pick = { owner: Owner; draft: Draft; problem: Problem; prefix: StudioDoc; display: BodyResult;
  name: string; signature: ReturnType<typeof toSig>; parentKey: string; siblingKey: string; displayKey: string; companion?: { body: BodyResult; profile: 'rectangle' | 'circle' } };

const plane = (b: BodyResult, name: string) => {
  if (b.mesh.faces.filter(f => f.name === name && f.kind === 'plane').length !== 1) return;
  const s = signaturesOf(b, 'plane').faces.get(name);
  if (s?.kind === 'plane') return toSig(s);
};
const samePlane = (a: ReturnType<typeof toSig>, b: ReturnType<typeof toSig>) =>
  a.k === 'plane' && b.k === 'plane' && a.s === b.s &&
  a.p.every((v, i) => v === b.p[i]) && a.d?.length === 3 && b.d?.length === 3 && a.d.every((v, i) => v === b.d![i]);

/** Only a trailing literal, unattached box or cylinder with its own unique producer. */
function independentCompanion(doc: StudioDoc, bodies: readonly BodyResult[]): Pick['companion'] {
  const sketch = doc.nodes[4], extrude = doc.nodes[5];
  if (sketch?.kind !== 'sketch' || (sketch.profile !== 'rectangle' && sketch.profile !== 'circle') || sketch.suppressed || sketch.held
    || sketch.on || sketch.plane || sketch.association || sketch.pocketFloor || sketch.outline
    || sketch.regions?.length || sketch.holes?.length || sketch.holeOutlines?.length
    || extrude?.kind !== 'extrude' || extrude.sketch !== 4 || extrude.suppressed || extrude.held
    || extrude.draft !== undefined || extrude.from !== undefined || extrude.cutDepth !== undefined
    || typeof extrude.height !== 'number' || !Number.isFinite(extrude.height) || extrude.height <= 0) return;
  const dimensions = sketch.profile === 'rectangle' ? [...sketch.min, ...sketch.max] : [...sketch.center, sketch.radius];
  if (!dimensions.every(n => typeof n === 'number' && Number.isFinite(n))
    || (sketch.profile === 'circle' && !(Number(sketch.radius) > 0))) return;
  const key = bodyKeyFor(doc.nodes, 5, 'solid'), ref = doc.outputs[key];
  if (ref?.node !== 5 || ref.side !== 'solid') return;
  const match = bodies.filter(body => body.key === key && body.ref?.node === 5 && body.ref.side === 'solid' && (body.pieces ?? 1) === 1);
  if (match.length === 1) return { body: match[0], profile: sketch.profile };
}

/** Only the single negative-side rectangular Split Draft with no offered candidate, plus one optional trailing box or cylinder. */
export function pickHeldDraftFace(owner: Owner, hit: Hit): Pick | null {
  const { doc, index, problems, bodies } = owner;
  if (!owner.isCurrent() || doc.format !== 'barocss-cad-model' || doc.schema !== 3 || doc.units !== 'mm' ||
      Object.hasOwn(doc,'routeBundles') || Object.hasOwn(doc,'routeBundleMember') ||
      doc.nodes.some(n=>Object.hasOwn(n,'routeBundleMember')) || index !== 3 || (doc.nodes.length !== 4 && doc.nodes.length !== 6) || doc.direct !== undefined ||
      doc.instances?.length || doc.configurations !== undefined || doc.variability !== undefined || !hit.face || hit.instance !== undefined) return null;
  const [sketch, extrude, split, draft] = doc.nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' || sketch.plane !== undefined || sketch.suppressed ||
      extrude.kind !== 'extrude' || extrude.sketch !== 0 || extrude.suppressed || extrude.draft !== undefined ||
      extrude.from !== undefined || typeof extrude.height !== 'number' || !(extrude.height > 0 && Number.isFinite(extrude.height)) ||
      split.kind !== 'split' || split.suppressed || split.parent.node !== 1 || split.parent.side !== 'solid' ||
      split.axis !== 'x' || split.normal?.join(',') !== '-1,0,0' || typeof split.at !== 'number' || !Number.isFinite(split.at) || split.outputSide !== undefined ||
      draft.kind !== 'draft' || !draft.held || draft.suppressed !== true || draft.rematched !== undefined ||
      draft.parent.node !== 2 || draft.parent.side !== 'negative' || draft.faces.length !== 1 ||
      draft.pull !== 'z' || draft.neutral !== 0 || !Number.isFinite(draft.angle) || !(draft.angle > 0 && draft.angle < 45)) return null;
  const [xmin, ymin] = sketch.min, [xmax, ymax] = sketch.max;
  const x = -split.at;
  if (typeof xmin !== 'number' || typeof xmax !== 'number' || typeof ymin !== 'number' || typeof ymax !== 'number' ||
      ![xmin,xmax,ymin,ymax].every(Number.isFinite) || !(xmin < x && x < xmax && ymin < ymax)) return null;
  const old = draft.faces[0];
  const oldSig = draft.sigs?.[old];
  if (old !== featureId(doc.nodes, 2) + '.cut.side1' || !isSplitCapFace(doc.nodes, old) || draft.held !== `"${old}" is gone` ||
      oldSig?.k !== 'plane' || oldSig.d?.join(',') !== '1,0,0' ||
      !(oldSig.p[0] > xmin && oldSig.p[0] < xmax) ||
      !samePlane(oldSig,toSig({ kind:'plane', at:[oldSig.p[0],(ymin+ymax)/2,extrude.height/2],dir:[1,0,0],size:(ymax-ymin)*extrude.height })) ||
      Object.keys(draft.sigs ?? {}).length !== 1 ||
      problems.length !== 1 || problems[0].node !== index || problems[0].name !== old ||
      problems[0].candidates.length !== 0 || problems[0].reason !== undefined) return null;

  const displayKey = bodyKeyFor(doc.nodes,index,'solid'), parentKey = bodyKeyFor(doc.nodes,2,'negative'), siblingKey = bodyKeyFor(doc.nodes,2,'positive');
  const companion = doc.nodes.length === 6 ? independentCompanion(doc, bodies) : undefined;
  if (doc.nodes.length === 6 && !companion) return null;
  const splitBodies = companion ? bodies.filter(body => body !== companion.body) : bodies;
  const display = bodies[hit.face.body], face = display?.mesh.faces[hit.face.face];
  if (Object.keys(doc.outputs).length !== (companion ? 3 : 2) || doc.outputs[displayKey]?.node !== index || doc.outputs[displayKey].side !== 'solid' ||
      doc.outputs[siblingKey]?.node !== 2 || doc.outputs[siblingKey].side !== 'positive' || !bodyPair(splitBodies,displayKey,siblingKey) ||
      display?.key !== displayKey || hit.faceMesh !== display.mesh || face?.name !== featureId(doc.nodes, 2) + '.cut.side3') return null;
  const name = face.name, signature = plane(display,name);
  if (!signature || !isSplitCapFace(doc.nodes,name) || signature.d?.join(',') !== '-1,0,0' ||
      !samePlane(signature,toSig({ kind:'plane',at:[x,(ymin+ymax)/2,extrude.height/2],dir:[-1,0,0],size:(ymax-ymin)*extrude.height }))) return null;
  try {
    return { owner, draft, problem:problems[0], prefix:prefixDoc(doc,index), display, name, signature,parentKey,siblingKey,displayKey,companion };
  } catch { return null; }

}

function bodyPair(bodies: readonly BodyResult[], first: string, second: string): boolean {
  return bodies.length === 2 && bodies.filter(b=>b.key===first && (b.pieces ?? 1)===1).length === 1
    && bodies.filter(b=>b.key===second && (b.pieces ?? 1)===1).length === 1;
}

type Plan = { pick: Pick; next: StudioDoc; prefixReply: EvalResult; sibling: BodyResult };
export function planHeldDraftReplacement(pick: Pick, reply: EvalResult, revision: number): Plan | null {
  if (!pick.owner.isCurrent() || !reply.ok || reply.revision !== revision || !bodyPair(reply.bodies,pick.parentKey,pick.siblingKey)) return null;
  const parentIndex = reply.bodies.findIndex(b=>b.key===pick.parentKey);
  const sibling = reply.bodies.find(b=>b.key===pick.siblingKey)!;
  const parent = reply.bodies[parentIndex], sig = plane(parent,pick.name);
  if (!sig || !samePlane(pick.signature,sig) || plane(sibling,pick.name)) return null;
  const face = parent.mesh.faces.findIndex(f=>f.name===pick.name);
  const command = commandById('draft');
  const ctx = { doc:pick.prefix, bodies:reply.bodies, selection:{faces:[{body:parentIndex,face}],edges:[],bodies:[]} };
  const values = {deg:pick.draft.angle,pull:'z',neutralMode:'fixed',neutral:0};
  try {
    if (!command?.build || !command.available(ctx).ok || !command.steps?.(ctx,values).every(step=>step.done)) return null;
    const created = command.build(ctx,values), node = created.nodes[pick.owner.index];
    if (created.nodes.length !== pick.prefix.nodes.length+1 || node?.kind !== 'draft' ||
        node.faces.length !== 1 || node.faces[0] !== pick.name || node.parent.node !== pick.draft.parent.node ||
        node.parent.side !== pick.draft.parent.side || node.angle !== pick.draft.angle ||
        (node.pull ?? 'z') !== pick.draft.pull || node.neutral !== pick.draft.neutral) return null;
    const original = {...pick.draft};
    delete original.held;
    delete original.suppressed;
    const doc=pick.owner.doc;
    const next: StudioDoc = {...doc, nodes:doc.nodes.map((value, i) => i === pick.owner.index ? {...original,faces:node.faces,sigs:{[pick.name]:sig}} : value)};
    return pick.owner.isCurrent() ? {pick,next,prefixReply:reply,sibling} : null;
  } catch { return null; }
}

// Refs packets keep geometry, not mass: all six finite box face signatures must match.
function sameBox(before: BodyResult, after: BodyResult): boolean {
  const oldFaces = signaturesOf(before,'plane').faces, newFaces = signaturesOf(after,'plane').faces;
  return oldFaces.size === 6 && newFaces.size === oldFaces.size && [...oldFaces].every(([name, old]) => {
    const current = newFaces.get(name);
    return !!current && samePlane(toSig(old),toSig(current));
  });
}

// For the literal circle Extrude, preserve both oriented cap supports and the
// named exact wall, including radius, axis and measured trim. No nearest face match.
function sameCylinder(before: BodyResult, after: BodyResult): boolean {
  const evidence = (body: BodyResult) => {
    const { faces } = body.mesh;
    if (faces.length !== 3 || new Set(faces.map(face => face.name)).size !== 3) return;
    const caps = signaturesOf(body, 'plane').faces;
    const wall = faces.filter(face => face.exact?.kind === 'cylinder');
    if (caps.size !== 2 || wall.length !== 1 || wall[0].exact?.kind !== 'cylinder') return;
    return { caps, wall: wall[0], exact: wall[0].exact };
  };
  const a = evidence(before), b = evidence(after);
  if (!a || !b || a.wall.name !== b.wall.name || a.wall.area !== b.wall.area || a.exact.r !== b.exact.r
    || !a.exact.a.every((v, i) => v === b.exact.a[i]) || !a.exact.c.every((v, i) => v === b.exact.c[i])) return false;
  return [...a.caps].every(([name, old]) => {
    const current = b.caps.get(name);
    return !!current && samePlane(toSig(old), toSig(current));
  });
}

export function readyHeldDraftReplacement(plan: Plan, reply: EvalResult, revision: number): StudioDoc | null {
  const { pick, next, sibling } = plan;
  if (!pick.owner.isCurrent() || !reply.ok || reply.revision !== revision || reply === plan.prefixReply || reply.revision === plan.prefixReply.revision ||
      !bodyPair(reply.bodies.filter(body => body.key !== pick.companion?.body.key),pick.displayKey,pick.siblingKey)) return null;
  if (pick.companion) {
    const companion = independentCompanion(next, reply.bodies);
    if (reply.bodies.length !== 3 || !companion || companion.profile !== pick.companion.profile) return null;
    const before = pick.companion.body, after = companion.body;
    if (!(companion.profile === 'rectangle' ? sameBox(before, after) : sameCylinder(before, after))) return null;
  }
  const s = reply.bodies.find(b=>b.key===pick.siblingKey)!;
  if (!sameBox(sibling, s)) return null;
  const pickedOutput=reply.bodies.find(b=>b.key===pick.displayKey)!;
  const outputFaces=signaturesOf(pickedOutput,'plane').faces;
  const drafted=outputFaces.get(featureId(next.nodes,pick.owner.index)+'.draft.bottom');
  const angle=pick.draft.angle*Math.PI/180;
  const [x,y,z]=pick.signature.p;
  if (outputFaces.size!==6 || outputFaces.has(pick.name) || drafted?.kind!=='plane' ||
      !samePlane(toSig(drafted),toSig({kind:'plane',at:[x+z*Math.tan(angle),y,z],
        dir:[-Math.cos(angle),0,Math.sin(angle)],size:pick.signature.s/Math.cos(angle)}))) return null;
  return pick.owner.isCurrent() ? next : null;
}
