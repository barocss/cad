import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor, featureId, featureIdsOf } from '@barocss/cad-model/engine/ids';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { referencesOf, type Problem } from '@barocss/cad-model/engine/references';
import { heldFinishGroupProblems, replaceHeldFinishGroup } from './heldFinishReplacement';
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
export function heldFilletBoxCompanion(doc: StudioDoc, index: number, problems: readonly Problem[], bodies: readonly BodyResult[]) {
  if (index !== 2 || doc.nodes.length !== 5 || doc.schema !== 3 || doc.direct || doc.instances?.length
    || doc.configurations || doc.variability || Object.hasOwn(doc, 'routeBundles')
    || doc.nodes.some(node => Object.hasOwn(node, 'routeBundleMember')) || problems.length !== 2) return;
  const finish = doc.nodes[index];
  if (finish.kind !== 'fillet' || finish.parent.node !== 1 || finish.parent.side !== 'solid'
    || finish.edges.length !== 2 || typeof finish.radius !== 'number'
    || independentExtrusionProfile(doc, 0) !== 'rectangle' || independentExtrusionProfile(doc, 3) !== 'rectangle') return;
  const pair = outputs(doc, bodies);
  const sourceId = featureId(doc.nodes, 1);
  if (!pair || !originalBox(pair.fillet, sourceId) || !originalBox(pair.companion, featureId(doc.nodes, 4))) return;
  const refs = referencesOf(doc, true).refs;
  if (!problems.every(problem => {
    const ref = refs[problem.index];
    const owners = featureIdsOf(problem.name);
    return ref?.edge && ref.node === index && ref.name === problem.name && ref.where === problem.where
      && owners.length === 2 && owners.every(id => id === sourceId)
      && !pair.fillet.mesh.edges.some(edge => edge.names.includes(problem.name));
  })) return;
  const prefix = prefixDoc(doc, index + 1);
  const group = heldFinishGroupProblems(prefix, index, problems);
  if (group) return { doc, prefix, group, ...pair };
}

type Scope = NonNullable<ReturnType<typeof heldFilletBoxCompanion>>;

export function replaceFilletBesideBox(scope: Scope, picks: readonly (DisplayEdge | undefined)[]): StudioDoc | null {
  const replacement = replaceHeldFinishGroup(scope.prefix, 2, scope.group, scope.fillet, picks);
  if (!replacement) return null;
  return { ...scope.doc, nodes: scope.doc.nodes.map((node, i) => i === 2 ? replacement.nodes[i] : node) };
}

export function filletCompanionPreserved(scope: Scope, bodies: readonly BodyResult[]): boolean {
  const pair = outputs(scope.doc, bodies);
  if (!pair || !originalBox(pair.companion, featureId(scope.doc.nodes, 4))) return false;
  return scope.companion.mesh.faces.every(before => {
    const after = pair.companion.mesh.faces.find(face => face.name === before.name);
    const beforePlane = before.exact, afterPlane = after?.exact;
    return beforePlane?.kind === 'plane' && afterPlane?.kind === 'plane' && !!after
      && before.nativeAxisPlane?.axis === after.nativeAxisPlane?.axis
      && before.nativeAxisPlane?.at === after.nativeAxisPlane?.at
      && before.nativeAlignFace?.sign === after.nativeAlignFace?.sign
      && before.area === after.area && before.centroid.every((v, i) => v === after.centroid[i])
      && beforePlane.n.every((v, i) => v === afterPlane.n[i]);
  });
}
