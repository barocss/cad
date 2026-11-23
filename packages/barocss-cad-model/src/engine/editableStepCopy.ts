import { checkBrep, stepGeometryRecipeKey, type Brep } from '@barocss/cad';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from './doc';
import { exportStudioStep, partBreps } from './evaluate';
import { addParameters, bindParameter } from './parameters';
import { stepLengthUnit } from './stepUnits';
import { editableStepSourceShape } from './editableStepSource';
import { editableStepEvidence, type EditableStepEvidence } from './editableStepEvidence';
import { twoStepShaftDimensions } from './twoStepShaftGeometry';
import { MM_PER_INCH } from '../util/units';

export type EditableStepCopy = { family: 'plate' | 'shaft'; sourceUnit?: 'cm' | 'in'; doc: StudioDoc; evidence: EditableStepEvidence; named?: StudioDoc } | { error: string };
export const editableStepByteLimit = 96 * 1024;

const unsupported = 'Use one STEP solid that matches a supported recipe: a rectangular plate with one through hole or a millimetre two-step shaft.';

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
  const sourceShape = editableStepSourceShape(source);
  if (node?.kind !== 'import' || !sourceShape)
    return { error: 'Open one STEP solid in its own document.' };
  // This recognition runs only on small files and has no fallback to a mesh or mass fit.
  if (node.step.length > editableStepByteLimit || new TextEncoder().encode(node.step).byteLength > editableStepByteLimit)
    return { error: 'This STEP file exceeds the editable copy size limit (96 KiB).' };
  try {
    const unit = stepLengthUnit(node.step);
    const sourceUnit = sourceShape === 'cm' && unit.to === 10 ? 'cm'
      : sourceShape === 'in' && unit.to === MM_PER_INCH ? 'in' : undefined;
    if (!unit.declared || !(sourceUnit || unit.to === 1 && sourceShape === 'raw'))
      return { error: 'Use declared millimetres or a supported centimetre or inch import.' };
    const originalKey = stepGeometryRecipeKey(node.step, sourceUnit);
    const outputs = partBreps(source);
    if (outputs.length !== 1 || !recipeTopology(outputs[0].brep)) return { error: unsupported };
    const imported = outputs[0].brep;
    const family = imported.faces.length === 8 && imported.vertices.length === 12 ? 'plate'
      : imported.faces.length === 10 && imported.vertices.length === 10 ? 'shaft' : undefined;
    if (!family || sourceUnit && family !== 'plate') return { error: unsupported };
    const shaft = family === 'shaft' ? twoStepShaftDimensions(imported) : undefined;
    const candidate = shaft ? withNode(emptyDoc(), { kind: 'shaft', generator: 'shaft@0', center: [0, 0], steps: shaft.steps })
      : family === 'plate' ? plateRecipe(imported) : undefined;
    if (!candidate) return { error: unsupported };
    const check = checkBrep(imported, { strict: true });
    if (!check.valid || check.topology[0]?.genus !== (family === 'plate' ? 1 : 0)) return { error: unsupported };
    const step = exportStudioStep(candidate, { name: 'Editable check' }).text;
    if (stepGeometryRecipeKey(step) !== originalKey) return { error: unsupported };
    const copyOutputs = partBreps(candidate);
    if (copyOutputs.length !== 1) return { error: unsupported };
    const evidence = editableStepEvidence(outputs[0], copyOutputs[0], candidate);
    if (!evidence) return { error: unsupported };
    const named = includeNamed && family === 'plate' ? withNamedDrivers(candidate, originalKey) : undefined;
    const namedOutput = named ? partBreps(named)[0] : undefined;
    const namedEvidence = named && namedOutput ? editableStepEvidence(outputs[0], namedOutput, named) : undefined;
    return { family, doc: candidate, evidence, ...(sourceUnit ? { sourceUnit } : {}),
      ...(named && JSON.stringify(namedEvidence) === JSON.stringify(evidence) ? { named } : {}) };
  } catch {
    return { error: unsupported };
  }
}
