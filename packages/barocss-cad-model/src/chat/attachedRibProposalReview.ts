import { brepMassProperties, CadNumericPolicy, checkBrep } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isVec3 } from '../util/guards';

export function attachedRibProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || doc.instances?.length) return;
  const [op] = proposal.ops, args = op.args;
  if (op.tool !== 'run_command' || args?.command !== 'rib' || !Array.isArray(args.faces) || args.faces.length !== 1
    || typeof args.faces[0] !== 'string' || !/\.(top|bottom)$/.test(args.faces[0])
    || typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(args.expectedRevision)) return;
  return { face: args.faces[0], revision: digestOf(proposal) };
}

export function reviewedAttachedRibEvidence(base: StudioDoc, candidate: StudioDoc, review: { face: string }) {
  const index = base.nodes.length, node = candidate.nodes[index];
  const face = review.face;
  if (candidate.nodes.length !== index + 1 || node?.kind !== 'rib' || !node.sigs || Object.keys(node.sigs).length !== 1) return;
  const sig = node.sigs[face], sign = sig?.d?.[2];
  if (sig?.k !== 'plane' || (sign !== 1 && sign !== -1)) return;
  const { min, max } = node;
  if (!isVec3(min) || !isVec3(max)) return;
  const sourceBody = bodyKeyFor(base.nodes, node.parent.node, 'solid'), body = bodyKeyFor(candidate.nodes, index, 'solid');
  const stock = partBreps(base).find(part => part.key === sourceBody)?.brep;
  const brep = partBreps(candidate).find(part => part.key === body)?.brep;
  if (!stock || !brep || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed || !checkBrep(brep, { strict: true }).valid) return;
  const z = sig.p[2], lengthMM = max[0] - min[0], widthMM = max[1] - min[1];
  const protrusionMM = sign === 1 ? max[2] - z : z - min[2], engagementMM = sign === 1 ? z - min[2] : max[2] - z;
  const volume = brepMassProperties(brep, 1).volume, stockVolume = brepMassProperties(stock, 1).volume;
  const addedVolumeMM3 = lengthMM * widthMM * protrusionMM;
  if (Math.abs(volume - stockVolume - addedVolumeMM3) > CadNumericPolicy.relativeComparison * Math.max(1, volume)
    || Math.abs(Math.max(...brep.vertices.map(vertex => sign * vertex.point[2])) - (sign * z + protrusionMM)) > CadNumericPolicy.linearTolerance) return;
  return { brep, attachedRib: { body, sourceBody, face, direction: [0, 0, sign], lengthMM, widthMM, protrusionMM, engagementMM, addedVolumeMM3 } };
}
