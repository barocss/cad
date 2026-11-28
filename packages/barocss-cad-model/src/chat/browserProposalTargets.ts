import { CadPartLimits } from '@barocss/cad';
import { isEditableBox, isEditableCylinder } from '../app/editCommand';
import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';

export const BROWSER_PROPOSAL_AUTHOR = 'browser';

export function validExtrudeDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= CadPartLimits.length;
}

export function validBoxDimension(value: unknown): value is number {
  return validExtrudeDistance(value) && value >= 1;
}

export function canProposeBrowserBox(doc: StudioDoc, bodies: readonly BodyResult[]): boolean {
  return doc.nodes.length === 0 && bodies.length === 0 && Object.keys(doc.outputs).length === 0 &&
    !doc.instances?.length && !doc.direct && !doc.proposals?.some(proposal => proposal.status === 'open');
}

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
