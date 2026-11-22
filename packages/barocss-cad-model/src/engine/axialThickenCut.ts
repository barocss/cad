import { CadNumericPolicy, checkBrep, faceGeometry, reevaluate, type Brep, type CadPartSnapshot } from '@barocss/cad';
import { type StudioDoc } from './doc';
import { featureId } from './ids';

type Cylinder = Extract<ReturnType<typeof faceGeometry>, { kind: 'cylinder' }>;
const axes = [0, 1, 2] as const;
const angularTolerance = 1e-9;

export function isClosedSixFaceSolid(brep: Brep) {
  return brep.bodies.length === 1 && brep.bodies[0].kind === 'solid' && brep.shells.length === 1 &&
    brep.shells[0].closed && brep.faces.length === 6 && brep.faces.every(face => face.shell === brep.shells[0].id);
}

function boxLevels(brep: Brep) {
  if (!isClosedSixFaceSolid(brep) || brep.vertices.length !== 8 || brep.edges.length !== 12 ||
      brep.edges.some(edge => edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2)) return;
  const points = brep.vertices.map(vertex => vertex.point);
  // Eight distinct vertices on the Cartesian product of two coordinates per axis.
  const levels = axes.map(axis => [...new Set(points.map(p => p[axis]))].sort((a, b) => a - b));
  if (levels.some(pair => pair.length !== 2) || new Set(points.map(point => point.join(','))).size !== 8) return;
  return levels;
}

function atHorizontalPlane(geometry: ReturnType<typeof faceGeometry>, z: number, sense: number, tolerance: number) {
  return geometry.kind === 'plane' && Math.hypot(geometry.n[0], geometry.n[1], geometry.n[2] - sense) <= angularTolerance &&
    Math.abs(geometry.o[2] - z) <= tolerance;
}

/** Prove that one Difference has cropped an axial end while retaining the whole original annular section. */
export function isAxialThickenCut(doc: StudioDoc, snapshot: CadPartSnapshot, index: number, cut: Brep,
  names: readonly [string, string], measured: readonly [Cylinder, Cylinder]): boolean {
  const { nodes } = doc, node = nodes[index];
  if (node.kind !== 'difference' || node.suppressed || node.made?.command === 'assembly-cut' ||
      node.parent.side !== 'solid' || node.tool.side !== 'solid')
    return false;
  const parent = nodes[node.parent.node], tool = nodes[node.tool.node];
  if (parent?.kind !== 'thicken' || parent.mode !== 'exact-cylinder' || parent.suppressed || tool?.kind !== 'extrude' || tool.suppressed) return false;
  const cutId = featureId(nodes, index), parentId = featureId(nodes, node.parent.node), toolId = featureId(nodes, node.tool.node);
  if (cut.source.family !== 'analytic-boolean' || cut.source.id !== cutId ||
      !names.includes(`${parentId}.normal`) || !names.includes(`${parentId}.reverse`)) return false;

  const { document } = snapshot, features = document.features;
  const nativeCut = features.find(feature => feature.id === cutId);
  const nativeParent = features.find(feature => feature.id === parentId);
  const nativeTool = features.find(feature => feature.id === toolId);
  if (nativeCut?.kind !== 'difference' || nativeCut.target !== parentId || nativeCut.tool !== toolId ||
      nativeParent?.kind !== 'thicken' || nativeParent.mode !== 'exact-cylinder' || nativeTool?.kind !== 'extrude' || nativeTool.draft)
    return false;
  const sketch = features.find(feature => feature.id === nativeTool.sketch);
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle') return false;
  // Use the resolved parameters and feature cache of the current evaluation.
  const { outputs } = reevaluate(snapshot, { document: { ...document, features: features.slice(0, features.indexOf(nativeCut)) } });
  const source = outputs.find(output => output.id === parentId && output.feature === parentId)?.brep;
  const cutter = outputs.find(output => output.id === toolId && output.feature === toolId)?.brep;
  if (!source || !isClosedSixFaceSolid(source) || !cutter) return false;
  const levels = boxLevels(cutter);
  if (!levels) return false;

  // The original Exact cylinder solid is a vertical prism. The positive-weight native rim controls
  // enclose its whole section, including the curved portions between edge vertices.
  if (source.edges.some(edge => edge.curve.weights.some(weight => !Number.isFinite(weight) || weight <= 0))) return false;
  const controls = source.edges.flatMap(edge => edge.curve.controlPoints);
  if (!controls.length || controls.some(point => point.some(value => !Number.isFinite(value)))) return false;
  const scale = Math.max(1, ...controls.flat().map(Math.abs), ...levels.flat().map(Math.abs));
  const tolerance = 10 * Math.max(CadNumericPolicy.linearTolerance, CadNumericPolicy.relativeLinearTolerance * scale);
  if (controls.some(point => [0, 1].some(axis => point[axis] <= levels[axis][0] + tolerance || point[axis] >= levels[axis][1] - tolerance)))
    return false;
  const z = source.vertices.map(vertex => vertex.point[2]), lo = Math.min(...z), hi = Math.max(...z);
  const [from, to] = levels[2];
  const top = lo + tolerance < from && from < hi - tolerance && to > hi + tolerance;
  const bottom = from < lo - tolerance && lo + tolerance < to && to < hi - tolerance;
  if (!top && !bottom) return false;

  const sourceZ = top ? lo : hi, cutZ = top ? from : to, sense = top ? 1 : -1;
  const originalCap = source.faces.find(face => atHorizontalPlane(faceGeometry(face), sourceZ, -sense, tolerance));
  const newCapName = `${toolId}.${top ? 'bottom' : 'top'}`;
  const newCap = cut.faces.find(face => face.name === newCapName);
  const retainedCap = originalCap && cut.faces.find(face => face.name === originalCap.name);
  if (!newCap || !retainedCap || !atHorizontalPlane(faceGeometry(newCap), cutZ, sense, tolerance) ||
      !atHorizontalPlane(faceGeometry(retainedCap), sourceZ, -sense, tolerance) ||
      !['u-min', 'u-max'].every(suffix => cut.faces.some(face => face.name === `${parentId}.${suffix}`)) ||
      cut.vertices.some(({ point }) => Math.min(Math.abs(point[2] - sourceZ), Math.abs(point[2] - cutZ)) > tolerance)) return false;

  return names.every((name, i) => {
    const wall = source.faces.find(face => face.name === name);
    const original = wall && faceGeometry(wall), now = measured[i];
    return original?.kind === 'cylinder' && original.out === now.out &&
      [original, now].every(cylinder => Math.hypot(cylinder.a[0], cylinder.a[1]) <= angularTolerance) &&
      Math.abs(original.r - now.r) <= tolerance &&
      Math.hypot(original.c[0] - now.c[0], original.c[1] - now.c[1]) <= tolerance;
  }) && checkBrep(cut, { strict: true }).valid;
}
