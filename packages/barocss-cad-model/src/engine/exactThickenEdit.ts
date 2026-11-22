import { reevaluate, type Brep, type CadPartSnapshot, type Surface } from '@barocss/cad';
import { offsetExactSemicylinderCapIfAdmitted, offsetExactSemicylinderWallIfAdmitted, replaceExactSemicylinderCapIfAdmitted } from '@barocss/cad/internal/exact-cylinder-cap-offset';
import { canonical } from '../util/revision';
import { exactSemicylinderCapSource, type StudioDoc } from './doc';
import { featureId } from './ids';
import { resolveOffsetPlaneDistance, resolveReplacementPlane } from './offsetPlane';

/** Bind the two skin names to an exact replay in the current document's native snapshot. */
export function isExactThickenEdit(doc: StudioDoc, snapshot: CadPartSnapshot, index: number, brep: Brep,
  names: readonly [string, string]): boolean {
  const { nodes } = doc, node = nodes[index];
  if ((node?.kind !== 'offset-face' && node?.kind !== 'replace-face') || node.suppressed || node.held !== undefined ||
      node.parent.side !== 'solid' || node.parent.node >= index || node.faces.length !== 1 || Object.keys(node.rematched ?? {}).length > 0 ||
      (node.kind === 'offset-face' && node.target !== undefined && node.distance !== undefined)) return false;
  const { document } = snapshot, { features, parameters } = document;
  const parent = exactSemicylinderCapSource(nodes, node.parent.node, doc.parameters);
  const [face] = node.faces;
  if (!parent || !parent.skins.every(name => names.includes(name))) return false;
  const radial = node.kind === 'offset-face' && node.target === undefined && parent.skins.includes(face);
  if (!radial && !parent.faces.includes(face)) return false;

  const id = featureId(nodes, index), editIndex = features.findIndex(feature => feature.id === id);
  const edit = features[editIndex], parentIndex = features.findIndex(feature => feature.id === parent.id);
  const stock = features[parentIndex];
  if ((edit?.kind !== 'offset-face' && edit?.kind !== 'replace-face') || edit.kind !== node.kind ||
      edit.target !== parent.id || edit.face !== face || stock?.kind !== 'thicken' || stock.mode !== 'exact-cylinder' ||
      parentIndex >= editIndex) return false;
  const thickness = typeof stock.thickness === 'number' ? stock.thickness : parameters[stock.thickness.parameter];
  if (thickness !== parent.thickness) return false;

  try {
    const build = (part: CadPartSnapshot['document']) => reevaluate(snapshot, { document: part });
    // Resolve saved references where the edit was built. A later feature can consume its reference body.
    const prefix = features.slice(0, editIndex);
    const { outputs: [original] } = build({ ...document, features: [stock] });
    if (original?.id !== parent.id || original.feature !== parent.id) return false;
    const surface = { ...structuredClone(stock.surface), kind: 'surface', id: 'surface' } as Surface;
    const source = { id: parent.id, surface, thickness, side: stock.side };
    let expected: Brep | undefined;
    if (node.kind === 'replace-face' && edit.kind === 'replace-face') {
      const plane = resolveReplacementPlane(doc, node, prefix, build);
      if (canonical(plane) !== canonical(edit.plane)) return false;
      expected = replaceExactSemicylinderCapIfAdmitted(original.brep, face, source, plane);
    } else if (node.kind === 'offset-face' && edit.kind === 'offset-face') {
      const distance = node.target ? resolveOffsetPlaneDistance(doc, node.target, node, prefix, build) : node.distance;
      if (distance !== edit.distance) return false;
      const offset = radial ? offsetExactSemicylinderWallIfAdmitted : offsetExactSemicylinderCapIfAdmitted;
      expected = offset(original.brep, face, source, edit.distance);
    }
    return expected !== undefined && canonical(expected) === canonical(brep);
  } catch {
    return false;
  }
}
