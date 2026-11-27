import { prefixDoc, type StudioDoc } from './doc';
import type { BodyResult } from './evaluate';
import { bodyKeyFor, featureId, featureIdsOf } from './ids';
import { referencesOf, type Problem } from './references';
import { heldFinishGroupProblems, isHeldConstantFinishGroup } from './heldFinishGroup';
import { independentExtrusionProfile } from './independentExtrusion';

function outputs(doc: StudioDoc, bodies: readonly BodyResult[]) {
  if (Object.keys(doc.outputs).length !== 2 || bodies.length !== 2) return;
  const solid = (index: number) => {
    const key = bodyKeyFor(doc.nodes, index, 'solid');
    const ref = doc.outputs[key];
    if (ref?.node !== index || ref.side !== 'solid') return;
    return bodies.find(body => body.key === key && body.ref?.node === index && body.ref.side === 'solid'
      && body.topology?.kind === 'solid' && body.topology.bodyCount === 1 && (body.pieces ?? 1) === 1);
  };
  const fillet = solid(2), companion = solid(4);
  if (fillet && companion) return { fillet, companion };
}

function originalBox(body: BodyResult, producer: string): boolean {
  const { faces } = body.mesh;
  return faces.length === 6 && new Set(faces.map(face => face.name)).size === 6 && faces.every(face =>
    face.name.startsWith(producer + '.') && face.name === face.nativePlaneName && face.exact?.kind === 'plane'
    && !!face.nativeAlignFace && !!face.nativeAxisPlane && face.nativeAlignFace.axis === face.nativeAxisPlane.axis && Number.isFinite(face.nativeAxisPlane.at)
    && face.centroid.every(Number.isFinite) && face.exact.n.every(Number.isFinite)
    && Number.isFinite(face.area) && face.area > 0);
}

/** The held Fillet is the last feature of its own solid. The other solid has no input from that branch. */
export function heldFilletBoxSource(doc: StudioDoc, index: number, bodies: readonly BodyResult[]) {
  if (index !== 2 || doc.nodes.length !== 5 || doc.schema !== 3 || doc.direct || doc.instances?.length
    || doc.configurations || doc.variability || Object.hasOwn(doc, 'routeBundles')
    || doc.nodes.some(node => Object.hasOwn(node, 'routeBundleMember'))) return;
  const finish = doc.nodes[index];
  if (!isHeldConstantFinishGroup(finish) || finish.kind !== 'fillet' || finish.parent.node !== 1 || finish.parent.side !== 'solid'
    || finish.edges.length !== 2 || typeof finish.radius !== 'number'
    || independentExtrusionProfile(doc, 0) !== 'rectangle' || independentExtrusionProfile(doc, 3) !== 'rectangle') return;
  const pair = outputs(doc, bodies);
  const sourceId = featureId(doc.nodes, 1);
  if (!pair || !originalBox(pair.fillet, sourceId) || !originalBox(pair.companion, featureId(doc.nodes, 4))) return;
  return { doc, index, ...pair };
}

export function heldFilletBoxGroup(source: ReturnType<typeof heldFilletBoxSource>, problems: readonly Problem[]) {
  if (!source || problems.length !== 2) return;
  const { doc, index, fillet } = source;
  const sourceId = featureId(doc.nodes, 1);
  const refs = referencesOf(doc, true).refs;
  if (!problems.every(problem => {
    const ref = refs[problem.index];
    const owners = featureIdsOf(problem.name);
    return ref?.edge && ref.node === index && ref.name === problem.name && ref.where === problem.where
      && owners.length === 2 && owners.every(id => id === sourceId)
      && !fillet.mesh.edges.some(edge => edge.names.includes(problem.name));
  })) return;
  const prefix = prefixDoc(doc, index + 1);
  const group = heldFinishGroupProblems(prefix, index, problems);
  if (group) return { ...source, prefix, group };
}

export type HeldFilletBoxGroup = NonNullable<ReturnType<typeof heldFilletBoxGroup>>;

function sameOriginalBox(original: BodyResult, current: BodyResult, producer: string): boolean {
  if (!originalBox(current, producer)) return false;
  return original.mesh.faces.every(before => {
    const after = current.mesh.faces.find(face => face.name === before.name);
    const beforePlane = before.exact, afterPlane = after?.exact;
    return beforePlane?.kind === 'plane' && afterPlane?.kind === 'plane' && !!after
      && before.nativeAxisPlane?.axis === after.nativeAxisPlane?.axis
      && before.nativeAxisPlane?.at === after.nativeAxisPlane?.at
      && before.nativeAlignFace?.sign === after.nativeAlignFace?.sign
      && before.area === after.area && before.centroid.every((v, i) => v === after.centroid[i])
      && beforePlane.n.every((v, i) => v === afterPlane.n[i]);
  });
}

export function filletCompanionPreserved(scope: HeldFilletBoxGroup, bodies: readonly BodyResult[]): boolean {
  const pair = outputs(scope.doc, bodies);
  return !!pair && sameOriginalBox(scope.companion, pair.companion, featureId(scope.doc.nodes, 4));
}

/** The held Fillet passes its unmodified parent through to the displayed body. */
export function originalFilletBox(scope: HeldFilletBoxGroup, bodies: readonly BodyResult[]) {
  const [parent] = bodies;
  if (bodies.length === 1 && parent.ref?.node === 1 && parent.ref.side === 'solid'
    && parent.key === bodyKeyFor(scope.doc.nodes, 1) && parent.topology?.kind === 'solid'
    && parent.topology.bodyCount === 1 && (parent.pieces ?? 1) === 1
    && sameOriginalBox(scope.fillet, parent, featureId(scope.doc.nodes, 1))) return parent;
}
