import { checkBrep, stepGeometryRecipeKey, type Brep } from '@barocss/cad';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from './doc';
import { exportStudioStep, partBreps } from './evaluate';
import { addParameters, bindParameter } from './parameters';
import { stepLengthUnit } from './stepUnits';

export type EditableStepCopy = { family: 'plate' | 'shaft'; doc: StudioDoc; named?: StudioDoc } | { error: string };

const unsupported = 'Use one millimetre STEP solid that matches a supported recipe: a rectangular plate with one through hole or a two-step shaft.';

function recipeTopology(brep: Brep): boolean {
  return brep.bodies.length === 1 && brep.bodies[0].kind === 'solid'
    && brep.shells.length === 1 && brep.shells[0].closed
    && brep.loops.length === 10 && brep.coedges.length === 36 && brep.edges.length === 18
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

function shaftRecipe(brep: Brep): StudioDoc | undefined {
  const points = brep.vertices.map(vertex => vertex.point);
  const levels = [...new Set(points.map(point => point[2]))].sort((a, b) => a - b);
  if (levels.length !== 3 || levels[0] !== 0) return;
  const groups = levels.map(z => points.filter(point => point[2] === z));
  if (groups[0].length !== 3 || groups[1].length !== 4 || groups[2].length !== 3) return;
  const endRadius = (group: typeof points) => {
    if (!group.some(([x, y]) => x === 0 && y === 0)) return;
    const seams = group.filter(([x, y]) => x > 0 && y === 0);
    if (seams.length === 1) return seams[0][0];
  };
  // The positive-X seam is exact. The opposite seam can have a small Y value from the half turn.
  const start = endRadius(groups[0]), end = endRadius(groups[2]);
  if (!start || !end || start === end) return;
  return withNode(emptyDoc(), {
    kind: 'shaft', generator: 'shaft@0', center: [0, 0],
    steps: [{ diameter: 2 * start, length: levels[1] }, { diameter: 2 * end, length: levels[2] - levels[1] }],
  });
}

function withNamedDrivers(candidate: StudioDoc, originalKey: string): StudioDoc | undefined {
  const [, extrusion, hole] = candidate.nodes;
  if (extrusion?.kind !== 'extrude' || typeof extrusion.height !== 'number' || hole?.kind !== 'hole') return;
  const [x, y] = hole.center;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  try {
    let named = addParameters(candidate, { plateThickness: extrusion.height, holeCentreX: x, holeCentreY: y });
    named = bindParameter(named, { feature: 1, value: 'h', parameter: 'plateThickness' });
    named = bindParameter(named, { feature: 2, value: 'c0', parameter: 'holeCentreX' });
    named = bindParameter(named, { feature: 2, value: 'c1', parameter: 'holeCentreY' });
    if (stepGeometryRecipeKey(exportStudioStep(named, { name: 'Editable check' }).text) === originalKey) return named;
  } catch {
    // The numeric copy has its own certificate and remains available.
  }
}

/** Produce a separate, new history only when the full imported boundary matches a native recipe. */
export function editableStepCopy(source: StudioDoc, includeNamed = false): EditableStepCopy {
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
    if (outputs.length !== 1 || !recipeTopology(outputs[0].brep)) return { error: unsupported };
    const imported = outputs[0].brep;
    const family = imported.faces.length === 8 && imported.vertices.length === 12 ? 'plate'
      : imported.faces.length === 10 && imported.vertices.length === 10 ? 'shaft' : undefined;
    if (!family) return { error: unsupported };
    const candidate = family === 'plate' ? plateRecipe(imported) : shaftRecipe(imported);
    if (!candidate) return { error: unsupported };
    const check = checkBrep(imported, { strict: true });
    if (!check.valid || check.topology[0]?.genus !== (family === 'plate' ? 1 : 0)) return { error: unsupported };
    const step = exportStudioStep(candidate, { name: 'Editable check' }).text;
    if (stepGeometryRecipeKey(step) !== originalKey) return { error: unsupported };
    const named = includeNamed && family === 'plate' ? withNamedDrivers(candidate, originalKey) : undefined;
    return { family, doc: candidate, ...(named ? { named } : {}) };
  } catch {
    return { error: unsupported };
  }
}
