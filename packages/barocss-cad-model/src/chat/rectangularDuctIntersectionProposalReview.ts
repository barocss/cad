import { CadNumericPolicy } from '@barocss/cad';
import { bodyKey, withNode, type BodyRef, type StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';
import { closedDuctCircle, closedRectangularDuctEvidence } from './closedRectangularDuctEvidence';
import { closedPairedRectangularDuctEvidence } from './closedPairedRectangularDuctEvidence';
import { offsetRectangularDuctIntersectionEvidence } from './offsetRectangularDuctIntersectionEvidence';
import { pairedRectangularDuctIntersectionEvidence } from './pairedRectangularDuctIntersectionEvidence';
import { pairedDuctSection, rectangularDuctSection } from './rectangularDuctProposalReview';

const solid = (node: number): BodyRef => ({ node, side: 'solid' });
const plain = (object: object, keys: readonly string[]) => Object.keys(object).every(key => keys.includes(key));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function scope(doc: StudioDoc) {
  if (doc.nodes.length !== 4 || doc.instances?.length || doc.direct) return;
  const [sketch, sweep, box, extrusion] = doc.nodes;
  const section = rectangularDuctSection(sketch) ?? pairedDuctSection(sketch);
  if (!section || sweep?.kind !== 'sweep-curve' || sweep.mode !== 'exact' || sweep.sketch !== 0 ||
    !plain(sweep, ['kind', 'id', 'name', 'sketch', 'path', 'mode', 'made']) ||
    box?.kind !== 'sketch' || box.profile !== 'rectangle' || !plain(box, ['kind', 'id', 'profile', 'min', 'max']) ||
    extrusion?.kind !== 'extrude' || extrusion.sketch !== 2 ||
    !plain(extrusion, ['kind', 'id', 'sketch', 'height', 'from', 'made'])) return;
  const [x0, y0] = box.min, [x1, y1] = box.max, { from, height } = extrusion;
  if (!finite(x0) || !finite(x1) || !finite(y0) || !finite(y1) || !finite(from) || !finite(height) ||
    !(x1 > x0 && y1 > y0 && height > 0) || ('cavities' in section ? x0 !== 0 : x0 <= 0)) return;
  const path = sweep.path, poles = path.controlPoints;
  if (poles.length !== 9 || poles.some(point => Math.abs(point[2]) > CadNumericPolicy.linearTolerance) ||
    Math.hypot(poles[0][0] + poles[4][0], poles[0][1] + poles[4][1]) > CadNumericPolicy.linearTolerance) return;
  const ductRef = solid(1), boxRef = solid(3);
  const duct = bodyKey(ductRef, doc.nodes), clip = bodyKey(boxRef, doc.nodes);
  const expected = { [duct]: ductRef, [clip]: boxRef };
  if (duct === clip || canonical(doc.outputs) !== canonical(expected)) return;
  return { section, path, duct, clip, ductRef, boxRef, x0, x1, y0, y1, z0: from, z1: from + height };
}

/** Identify a pending covering-box Intersect of a supported authored closed duct. */
export function rectangularDuctIntersectionProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1) return;
  const [op] = proposal.ops, args = op.args;
  if (op.tool !== 'run_command' || !isObj(args) || args.command !== 'intersect' ||
    Object.keys(args).sort().join(',') !== 'bodies,command,expectedRevision' ||
    args.expectedRevision !== revisionOf(doc) || !Array.isArray(args.bodies) || args.bodies.length !== 2) return;
  const source = scope(doc);
  if (!source) return;
  const [left, right] = args.bodies;
  if (!((left === source.duct && right === source.clip) || (left === source.clip && right === source.duct))) return;
  return { revision: digestOf(proposal), sourceRevision: args.expectedRevision, source: canonicalOf(doc), swap: left === source.clip };
}

export function reviewedRectangularDuctIntersectionEvidence(base: StudioDoc, candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof rectangularDuctIntersectionProposal>>) {
  const source = scope(base);
  if (!source || edit.source !== canonicalOf(base) || edit.sourceRevision !== revisionOf(base)) return;
  const [left, right] = edit.swap ? [source.boxRef, source.ductRef] : [source.ductRef, source.boxRef];
  const expected = withNode(base, { kind: 'intersect', left, right });
  if (canonicalOf(candidate) !== canonicalOf(expected) || candidate.nextId !== expected.nextId) return;
  try {
    const original = partBreps(base), duct = original.find(part => part.key === source.duct);
    if (original.length !== 2 || !duct || !original.some(part => part.key === source.clip && part.brep.bodies.length === 1)) return;
    const single = 'inner' in source.section
      ? closedRectangularDuctEvidence(duct.brep, source.path, source.section)?.closedCavity : undefined;
    const paired = 'cavities' in source.section
      ? closedPairedRectangularDuctEvidence(duct.brep, source.path, source.section)?.closedCavities : undefined;
    const dimensions = (single ?? paired)?.dimensions;
    if (!dimensions) return;
    const halfWidth = dimensions.exterior.radial / 2, halfHeight = dimensions.exterior.axial / 2;
    const reach = dimensions.pathRadius + halfWidth, tolerance = CadNumericPolicy.linearTolerance;
    if (!(source.x0 < dimensions.pathRadius - halfWidth - tolerance && source.x1 > reach + tolerance &&
      source.y0 < -reach - tolerance && source.y1 > reach + tolerance && source.z0 < -halfHeight - tolerance &&
      source.z1 > halfHeight + tolerance)) return;
    const output = partBreps(candidate), brep = output[0]?.brep, index = base.nodes.length, body = bodyKeyFor(candidate.nodes, index);
    if (output.length !== 1 || output[0].key !== body || brep.source.family !== 'analytic-boolean' ||
      brep.source.id !== featureId(candidate.nodes, index)) return;
    const pins = { body, duct: source.duct, box: source.clip, offset: source.x0, pathRadius: dimensions.pathRadius };
    if (single) {
      const evidence = offsetRectangularDuctIntersectionEvidence(brep, single.dimensions, source.x0);
      if (evidence) return { brep, rectangularDuctIntersection: { ...pins, ...evidence } };
    }
    if (paired) {
      const axis = closedDuctCircle(source.path)?.axis[2];
      if (axis === undefined || Math.abs(Math.abs(axis) - 1) > CadNumericPolicy.relativeComparison) return;
      const cavities = paired.cavities.map(cavity => {
        const [a, b] = cavity.axialInterval.map(value => value * axis);
        return { ...cavity.dimensions, axialInterval: [Math.min(a, b), Math.max(a, b)] as [number, number], faces: cavity.faces };
      });
      const evidence = pairedRectangularDuctIntersectionEvidence(brep, {
        pathRadius: dimensions.pathRadius, exterior: dimensions.exterior, cavities,
      });
      if (evidence) return { brep, rectangularDuctIntersection: { ...pins, ...evidence } };
    }
  } catch { return; }
}
