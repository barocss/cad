import { faceGeometry, type Brep } from '@barocss/cad';
import { exactSemicylinderRadialBoreSource, type StudioDoc } from '../engine/doc';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';

export function boredWallProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || doc.instances?.length) return;
  const [op] = proposal.ops, args = op.args;
  if (op.tool !== 'edit_feature' || !isObj(args) || Object.keys(args).sort().join(',') !== 'expectedRevision,index,values' ||
    typeof args.index !== 'number' || args.index < 0 || args.index !== doc.nodes.length - 1 ||
    typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(args.expectedRevision) ||
    !isObj(args.values) || Object.keys(args.values).join(',') !== 'offsetDistance') return;
  const distance = args.values.offsetDistance;
  const offset = doc.nodes[args.index];
  if (offset?.kind !== 'offset-face' || offset.target !== undefined || offset.suppressed || offset.held !== undefined ||
    offset.parent.side !== 'solid' || offset.faces.length !== 1 || typeof distance !== 'number' ||
    !Number.isFinite(distance) || distance === 0 || distance === offset.distance) return;
  const cutIndex = offset.parent.node;
  const bore = exactSemicylinderRadialBoreSource(doc.nodes, cutIndex, doc.parameters);
  if (bore && offset.faces[0] === bore.wallFace) return { index: args.index, cutIndex, bore, distance, revision: digestOf(proposal) };
}

/** Read the two certified openings from native trims and their reciprocal bore-wall edges. */
export function reviewedBoreEvidence(body: string, brep: Brep, bore: NonNullable<ReturnType<typeof exactSemicylinderRadialBoreSource>>) {
  const [first, second] = bore.boreFaces.map(name => brep.faces.find(face => face.name === name));
  if (!first || !second) return;
  const a = faceGeometry(first), b = faceGeometry(second);
  if (a.kind !== 'cylinder' || b.kind !== 'cylinder' || a.out !== -1 || b.out !== -1 ||
    !(a.r > 0) || !Number.isFinite(a.r)) return;
  // D1666 already certifies the two inward halves against the same exact cutter.
  const boreLoops = new Set([...first.loops, ...second.loops]);
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const openings = [];
  const other = bore.skins.find(name => name !== bore.wallFace);
  if (!other) return;
  for (const name of [bore.wallFace, other]) {
    const face = brep.faces.find(candidate => candidate.name === name);
    const loops = brep.loops.filter(loop => loop.kind === 'inner' && face?.id === loop.face && face.loops.includes(loop.id));
    if (loops.length !== 1) return;
    const [loop] = loops, edges = [];
    const mates = new Set<string>();
    for (const id of loop.coedges) {
      const use = coedges.get(id), twin = use?.twin ? coedges.get(use.twin) : undefined;
      if (!use || !twin || twin.twin !== use.id || twin.edge !== use.edge || !boreLoops.has(twin.loop)) return;
      edges.push(use.edge);
      mates.add(twin.loop);
    }
    if (![first, second].every(half => half.loops.some(id => mates.has(id))) || new Set(edges).size !== edges.length) return;
    openings.push({ face: name, loop: loop.id, edges });
  }
  return { body, diameter: 2 * a.r, faces: bore.boreFaces, openings };
}

export interface ModelCandidatePin {
  proposal: string;
  proposalRevision: string;
  baseRevision: string;
  bodySha256: string;
  orientation?: 'opposite';
  reviewRevision: string;
}
