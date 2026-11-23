import { checkBrep, stepGeometryRecipeKey, type Brep } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from './doc';
import { exportStudioStep, partBreps } from './evaluate';
import { stepLengthUnit } from './stepUnits';

export type EditableStepCopy = { doc: StudioDoc } | { error: string };

const unsupported = 'Use one millimetre STEP solid with rectangular stock on XY and one round through hole along Z. Its exact faces and boundaries must match the editable recipe.';

function plateTopology(brep: Brep): boolean {
  return brep.bodies.length === 1 && brep.bodies[0].kind === 'solid'
    && brep.shells.length === 1 && brep.shells[0].closed
    && brep.faces.length === 8 && brep.loops.length === 10 && brep.coedges.length === 36
    && brep.edges.length === 18 && brep.vertices.length === 12
    && brep.coedges.every(use => use.pcurve === null);
}

function plateRecipe(brep: Brep): StudioDoc | undefined {
  const points = brep.vertices.map(v => v.point);
  const width = Math.max(...points.map(p => p[0]));
  const depth = Math.max(...points.map(p => p[1]));
  const height = Math.max(...points.map(p => p[2]));
  if (!(width > 0 && depth > 0 && height > 0)) return;
  const corners = points.filter(([x, y, z]) =>
    (x === 0 || x === width) && (y === 0 || y === depth) && (z === 0 || z === height));
  const rim = points.filter(point => !corners.includes(point));
  if (corners.length !== 8 || rim.length !== 4) return;
  const base = rim.filter(p => p[2] === 0).sort((a, b) => a[0] - b[0]);
  if (base.length !== 2 || base[0][1] !== base[1][1]) return;
  const [[left, y], [right]] = base, radius = (right - left) / 2;
  if (!(radius > 0 && left > 0 && right < width && y - radius > 0 && y + radius < depth)) return;
  return withNode(rectanglePart(width, depth, height), {
    kind: 'hole', parent: { node: 1, side: 'solid' }, center: [left + radius, y], radius,
  });
}

/** Produce a separate, new history only when the full imported boundary matches a native recipe. */
export function editableStepCopy(source: StudioDoc): EditableStepCopy {
  const node = source.nodes[0];
  if (source.nodes.length !== 1 || node?.kind !== 'import' || (node.solids ?? 1) !== 1 || source.instances?.length)
    return { error: 'Open one STEP solid in its own document.' };
  // This recognition runs only on small files and has no fallback to a mesh or mass fit.
  const limit = 96 * 1024;
  if (node.step.length > limit || new TextEncoder().encode(node.step).byteLength > limit)
    return { error: 'This STEP file exceeds the editable copy size limit (96 KiB).' };
  try {
    const unit = stepLengthUnit(node.step);
    if (!unit.declared || unit.to !== 1) return { error: 'The STEP file must declare millimetres.' };
    const originalKey = stepGeometryRecipeKey(node.step);
    const outputs = partBreps(source);
    if (outputs.length !== 1 || !plateTopology(outputs[0].brep)) return { error: unsupported };
    const imported = outputs[0].brep, candidate = plateRecipe(imported);
    if (!candidate) return { error: unsupported };
    const check = checkBrep(imported, { strict: true });
    if (!check.valid || check.topology[0]?.genus !== 1) return { error: unsupported };
    const step = exportStudioStep(candidate, { name: 'Editable check' }).text;
    if (stepGeometryRecipeKey(step) !== originalKey) return { error: unsupported };
    return { doc: candidate };
  } catch {
    return { error: unsupported };
  }
}
