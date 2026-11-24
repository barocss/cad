import { CadNumericPolicy } from '@barocss/cad';
import { bodyKey, perpendicularAnnularOffsetEnd, withNode, type BodyRef, type StudioDoc } from '../engine/doc';
import { partBreps, type BodyResult } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import { captureSignatures } from '../engine/references';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';
import { perpendicularAnnularOutletOffsetEvidence } from './perpendicularAnnularOutletOffsetEvidence';

function scope(doc: StudioDoc) {
  if (doc.nodes.length !== 2 || doc.instances?.length || doc.direct) return;
  const [sketch, sweep] = doc.nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'circle' || sweep.kind !== 'sweep-curve') return;
  const feature = featureId(doc.nodes, 1), face = `${feature}.end`;
  if (perpendicularAnnularOffsetEnd(doc.nodes, 1, face) !== 'end') return;
  const hole = sketch.holes?.[0]?.[0], outerRadius = sketch.radius;
  if (hole?.kind !== 'arc' || typeof outerRadius !== 'number' || !Number.isFinite(outerRadius)) return;
  const [x, y] = sketch.center, [cx, cy] = hole.center, [hx, hy] = hole.start;
  if (typeof x !== 'number' || typeof y !== 'number' || cx !== x || cy !== y ||
    typeof hx !== 'number' || typeof hy !== 'number') return;
  const boreRadius = Math.hypot(hx - x, hy - y);
  if (!(outerRadius > boreRadius && boreRadius > 0)) return;
  const parent: BodyRef = { node: 1, side: 'solid' }, body = bodyKey(parent, doc.nodes);
  if (canonical(doc.outputs) !== canonical({ [body]: parent })) return;
  return { feature, face, outerRadius, boreRadius, path: sweep.path, parent, body };
}

/** Recognize a single signed Offset of the original annular outlet before replay. */
export function perpendicularAnnularOutletProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || proposal.follow_up_repair) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'run_command' || !isObj(args) || args.command !== 'offset-face' ||
    Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces,values' ||
    args.expectedRevision !== revisionOf(doc) || !isObj(args.values) ||
    Object.keys(args.values).join(',') !== 'd') return;
  const distance = args.values.d;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance === 0 ||
    Math.abs(distance) > CadNumericPolicy.coordinateAbs) return;
  const source = scope(doc);
  if (!source || !Array.isArray(args.faces) || args.faces.length !== 1 || args.faces[0] !== source.face) return;
  return { revision: digestOf(proposal), sourceRevision: args.expectedRevision, source: canonicalOf(doc), distance };
}

export function reviewedPerpendicularAnnularOutletEvidence(base: StudioDoc, bodies: readonly BodyResult[], candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof perpendicularAnnularOutletProposal>>) {
  const source = scope(base);
  if (!source || candidate.direct || edit.source !== canonicalOf(base) || edit.sourceRevision !== revisionOf(base)) return;
  const { parent, face, path, body: sourceBody } = source, { distance } = edit;
  const expected = captureSignatures(withNode(base, { kind: 'offset-face', parent, faces: [face], distance }), bodies);
  if (canonicalOf(candidate) !== canonicalOf(expected) || candidate.nextId !== expected.nextId) return;
  try {
    const originals = partBreps(base), outputs = partBreps(candidate);
    const body = bodyKey({ node: base.nodes.length, side: 'solid' }, candidate.nodes);
    if (originals.length !== 1 || originals[0].key !== sourceBody || outputs.length !== 1 || outputs[0].key !== body) return;
    const { brep } = outputs[0];
    const evidence = perpendicularAnnularOutletOffsetEvidence(originals[0].brep, brep, path, source, distance);
    if (evidence) return { brep, perpendicularAnnularOutletOffset: { sourceBody, body, ...evidence } };
  } catch { return; }
}
