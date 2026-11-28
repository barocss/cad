import { CadPartLimits, ExtrudedProfileLimits } from '@barocss/cad';
import { isEditableBox, isEditableCylinder } from '../app/editCommand';
import { nativeSolidLine } from '../app/nativeSolidLine';
import { isOriginalBoxCorner, originalBox, type OriginalBox } from '../app/originalBoxCorners';
import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import { matchesFaceName } from './names';

export const BROWSER_PROPOSAL_AUTHOR = 'browser';
export const browserProposalMinimum = { primitiveDimension: 1, cylinderRadius: 0.5, holeDiameter: 0.5, shellThickness: 0.1 } as const;

export function validExtrudeDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= CadPartLimits.length;
}

export function validBoxDimension(value: unknown): value is number {
  return validExtrudeDistance(value) && value >= browserProposalMinimum.primitiveDimension;
}

export function validCylinderRadius(value: unknown): value is number {
  return validExtrudeDistance(value) && value >= browserProposalMinimum.cylinderRadius;
}

export function validHoleDiameter(value: unknown): value is number {
  return validExtrudeDistance(value) && value >= browserProposalMinimum.holeDiameter;
}

export function canProposeBrowserPrimitive(doc: StudioDoc, bodies: readonly BodyResult[]): boolean {
  return doc.nodes.length === 0 && bodies.length === 0 && Object.keys(doc.outputs).length === 0 &&
    !doc.instances?.length && !doc.direct && !doc.proposals?.some(proposal => proposal.status === 'open');
}

export const canProposeBrowserBox = canProposeBrowserPrimitive;

/** One literal rectangular or circular Extrude, with its current evaluated body. */
export function browserExtrudeTarget(doc: StudioDoc, bodies: readonly BodyResult[]) {
  if (doc.nodes.length !== 2 || bodies.length !== 1 || Object.keys(doc.outputs).length !== 1 ||
    doc.instances?.length || doc.direct || doc.proposals?.some(p => p.status === 'open')) return;
  const [sketch, extrude] = doc.nodes;
  const body = bodies[0], output = doc.outputs[body.key];
  if (!output || output.node !== 1 || output.side !== 'solid') return;
  if (sketch.kind !== 'sketch') return;
  if (extrude.kind !== 'extrude' || extrude.sketch !== 0 || !validExtrudeDistance(extrude.height) ||
    Object.keys(extrude).some(key => !['id', 'kind', 'sketch', 'height', 'from', 'draft', 'made'].includes(key)) ||
    (extrude.draft ?? 0) !== 0) return;
  if (sketch.profile === 'rectangle') {
    if (Object.keys(sketch).some(key => !['id', 'kind', 'profile', 'min', 'max', 'sideTags'].includes(key)) ||
      ![...sketch.min, ...sketch.max].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      !(Number(sketch.min[0]) < Number(sketch.max[0]) && Number(sketch.min[1]) < Number(sketch.max[1])) ||
      (extrude.from ?? 0) !== 0 || (extrude.made && !isEditableBox(doc.nodes, 0))) return;
  } else if (sketch.profile === 'circle') {
    const base = extrude.from ?? 0;
    if (Object.keys(sketch).some(key => !['id', 'kind', 'profile', 'center', 'radius'].includes(key)) ||
      !sketch.center.every(value => typeof value === 'number' && Number.isFinite(value)) ||
      !validExtrudeDistance(sketch.radius) || typeof base !== 'number' || !Number.isFinite(base) ||
      Math.abs(base) > CadPartLimits.length || (extrude.made && !isEditableCylinder(doc.nodes, 0))) return;
  } else return;
  return { body: body.key, height: extrude.height, index: output.node, node: extrude };
}

export function validShellThickness(value: unknown): value is number {
  return validExtrudeDistance(value) && value >= browserProposalMinimum.shellThickness;
}

export function validClosedShellDimensions({ wall, floor, ceiling }: { wall: number; floor: number; ceiling: number },
  { radius, height }: { radius: number; height: number }): boolean {
  return validShellThickness(wall) && validShellThickness(floor) && validShellThickness(ceiling) &&
    radius - wall >= ExtrudedProfileLimits.minimumRadiusMM &&
    height - floor - ceiling >= ExtrudedProfileLimits.minimumLengthMM;
}

/** A standalone standard Cylinder with its exact upper native cap. */
export function browserCylinderTarget(doc: StudioDoc, bodies: readonly BodyResult[]) {
  const extrusion = browserExtrudeTarget(doc, bodies);
  const [sketch] = doc.nodes;
  const [body] = bodies;
  if (!extrusion || extrusion.node.made?.command !== 'cylinder' || sketch?.kind !== 'sketch' || sketch.profile !== 'circle' ||
    body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1 || body.topology.openShells !== 0 ||
    body.topology.boundaryEdges !== 0) return;
  const face = featureId(doc.nodes, extrusion.index) + '.top';
  const hits = body.mesh.faces.filter(candidate => matchesFaceName(candidate, face));
  if (hits.length !== 1) return;
  const [cap] = hits;
  if (cap.name !== face || cap.nativePlaneName !== face || cap.nativeAxisPlane?.axis !== 'z' ||
    cap.nativeAxisPlane.at !== Number(extrusion.node.from ?? 0) + extrusion.height || cap.normal[2] < 0.999) return;
  return { body: body.key, face, height: extrusion.height, radius: Number(sketch.radius), center: [Number(sketch.center[0]), Number(sketch.center[1])] };
}

export function browserHoleTarget(doc: StudioDoc, bodies: readonly BodyResult[]) {
  const target = browserCylinderTarget(doc, bodies);
  if (!target) return;
  const { body, face, radius, center } = target;
  return { body, face, radius, center };
}

export const browserBoxReferenceSides = ['left', 'right'] as const;
export type BrowserBoxReferenceSide = typeof browserBoxReferenceSides[number];

export function isBrowserBoxReferenceSide(value: unknown): value is BrowserBoxReferenceSide {
  return value === 'left' || value === 'right';
}

/** The browser can share this operation only for the two current original authored Boxes. */
export function browserBoxWidthTargets(doc: StudioDoc, bodies: readonly BodyResult[]) {
  if (doc.nodes.length !== 4 || bodies.length !== 2 || Object.keys(doc.outputs).length !== 2 || doc.instances?.length
    || doc.direct || doc.proposals?.some(p => p.status === 'open')) return;
  const first = bodies.find(body => body.ref?.node === 1), second = bodies.find(body => body.ref?.node === 3);
  const source = originalBox(doc.nodes, 0), reference = originalBox(doc.nodes, 2);
  if (!first || !second || first.key === second.key || !source || !reference) return;
  if (first.ref?.side !== 'solid' || second.ref?.side !== 'solid' || doc.outputs[first.key]?.node !== 1
    || doc.outputs[second.key]?.node !== 3 || doc.outputs[first.key].side !== 'solid' || doc.outputs[second.key].side !== 'solid') return;
  return { first, second, source, reference };
}

function nativeBoxCornerOnX(body: BodyResult, box: OriginalBox, x: number) {
  for (const [index, candidate] of body.mesh.edges.entries()) {
    if (candidate.a[0] !== x && candidate.b[0] !== x) continue;
    const edge = nativeSolidLine(body, index);
    if (!edge) continue;
    if (edge.a[0] === x && isOriginalBoxCorner(box, edge.a)) return { edge: edge.names[0], endpoint: 'from' };
    if (edge.b[0] === x && isOriginalBoxCorner(box, edge.b)) return { edge: edge.names[0], endpoint: 'to' };
  }
}

export function browserBoxWidthValues(doc: StudioDoc, bodies: readonly BodyResult[], body: string,
  referenceBody: string, side: BrowserBoxReferenceSide) {
  const targets = browserBoxWidthTargets(doc, bodies);
  if (!targets || targets.first.key !== body || targets.second.key !== referenceBody || !isBrowserBoxReferenceSide(side)) return;
  const sourceX = targets.source.sketch.max[0], fixedX = targets.source.sketch.min[0];
  const targetX = (side === 'left' ? targets.reference.sketch.min : targets.reference.sketch.max)[0];
  if (typeof sourceX !== 'number' || typeof fixedX !== 'number' || typeof targetX !== 'number'
    || targetX === sourceX || !validBoxDimension(targetX - fixedX)) return;
  const source = nativeBoxCornerOnX(targets.first, targets.source, sourceX);
  const reference = nativeBoxCornerOnX(targets.second, targets.reference, targetX);
  if (source && reference) return { targetX, values: { boxVertexEdge: source.edge, boxVertexEndpoint: source.endpoint,
    boxTargetVertexEdge: reference.edge, boxTargetVertexEndpoint: reference.endpoint } };
}
