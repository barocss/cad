import { CadPartLimits } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';

export const BROWSER_EXTRUDE_AUTHOR = 'browser';

export function validExtrudeDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= CadPartLimits.length;
}

/** One native, literal rectangular Extrude. A browser grant never identifies a feature by index alone. */
export function browserExtrudeTarget(doc: StudioDoc, bodies: readonly BodyResult[]) {
  if (doc.nodes.length !== 2 || bodies.length !== 1 || Object.keys(doc.outputs).length !== 1 ||
    doc.instances?.length || doc.direct || doc.proposals?.some(p => p.status === 'open')) return;
  const [sketch, extrude] = doc.nodes;
  const body = bodies[0], output = doc.outputs[body.key];
  if (!output || output.node !== 1 || output.side !== 'solid') return;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' ||
    Object.keys(sketch).some(key => !['id', 'kind', 'profile', 'min', 'max', 'sideTags'].includes(key)) ||
    ![...sketch.min, ...sketch.max].every(value => typeof value === 'number' && Number.isFinite(value)) ||
    !(Number(sketch.min[0]) < Number(sketch.max[0]) && Number(sketch.min[1]) < Number(sketch.max[1]))) return;
  if (extrude.kind !== 'extrude' || extrude.sketch !== 0 || !validExtrudeDistance(extrude.height) ||
    Object.keys(extrude).some(key => !['id', 'kind', 'sketch', 'height', 'from', 'draft'].includes(key)) ||
    (extrude.from ?? 0) !== 0 || (extrude.draft ?? 0) !== 0) return;
  return { body: body.key, height: extrude.height, index: output.node };
}
