import type { Brep } from '@barocss/cad';
import { readTwoThroughBorePlate } from '@barocss/cad/internal/bored-cap-offset';
import type { StudioDoc } from '../engine/doc';
import { partBreps, type BodyResult } from '../engine/evaluate';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj, isVec3 } from '../util/guards';
import { readReferences } from './references';

function cutsPlate(node: unknown, parent: number): boolean {
  return isObj(node) && node.kind === 'hole' && isObj(node.parent)
    && node.parent.node === parent && node.parent.side === 'solid' && node.axis === 'z' && node.side === 'max';
}

/** Admit the initial rectangular plate recipe over one locked mesh in the authored model frame. */
export function lockedPlateProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || doc.nodes.length || Object.keys(doc.outputs).length
    || doc.instances?.length || doc.direct?.objects.length || doc.units !== 'mm') return;
  const { references } = readReferences(doc.references), [reference] = references;
  if (references.length !== 1 || !isObj(reference) || typeof reference.id !== 'string'
    || !isObj(reference.source) || !('mesh' in reference.source) || !isObj(reference.source.mesh)
    || !isObj(reference.at) || !isVec3(reference.at.position) || !isVec3(reference.at.rotation)
    || [...reference.at.position, ...reference.at.rotation].some(value => value !== 0)) return;
  const [operation] = proposal.ops;
  const features = operation.args?.features;
  if (operation.tool !== 'add_features' || !Array.isArray(features) || features.length !== 4) return;
  const [sketch, extrusion, first, second] = features;
  if (!isObj(sketch) || sketch.kind !== 'sketch' || sketch.profile !== 'rectangle'
    || !isObj(extrusion) || extrusion.kind !== 'extrude' || extrusion.sketch !== 0
    || !cutsPlate(first, 1) || !cutsPlate(second, 2)) return;
  return { revision: digestOf(proposal), reference: { id: reference.id, sha256: digestOf(reference) } };
}

type ReferencePin = NonNullable<ReturnType<typeof lockedPlateProposal>>['reference'];
type PlateProof = NonNullable<ReturnType<typeof readTwoThroughBorePlate>>;
type LockedPlateEvidence = { brep: Brep; lockedPlateReference: ReferencePin; throughBorePlates: (PlateProof & { body: string })[] };

/** Certify the replayed native body. The mesh stays a separate reference. */
export function reviewedLockedPlateEvidence(doc: StudioDoc, bodies: readonly BodyResult[], reference: ReferencePin): LockedPlateEvidence | { error: string } {
  const { references } = readReferences(doc.references);
  if (references.length !== 1 || references[0].id !== reference.id || digestOf(references[0]) !== reference.sha256)
    return { error: 'The candidate changed the locked mesh reference.' };
  const native = partBreps(doc);
  const [part] = native;
  if (native.length !== 1 || bodies.length !== 1 || bodies[0].key !== part.key)
    return { error: 'The candidate must produce one native plate body.' };
  const plate = readTwoThroughBorePlate(part.brep);
  if (!plate) return { error: 'Two circular passages through both exterior plate faces could not be verified.' };
  return { brep: part.brep, lockedPlateReference: reference, throughBorePlates: [{ body: part.key, ...plate }] };
}
