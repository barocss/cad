import { reevaluate, type Brep, type CadPartSnapshot, type Surface } from '@barocss/cad';
import { offsetExactSemicylinderCapIfAdmitted } from '@barocss/cad/internal/exact-cylinder-cap-offset';
import { canonical } from '../util/revision';
import { exactSemicylinderCapSource, type StudioDoc } from './doc';
import { featureId } from './ids';
import { resolveOffsetPlaneDistance } from './offsetPlane';

/** Bind the current two skin names to a replay of the original native axial-cap operation. */
export function isExactThickenCapOffset(doc: StudioDoc, snapshot: CadPartSnapshot, index: number, brep: Brep,
  names: readonly [string, string]): boolean {
  const { nodes } = doc, node = nodes[index];
  if (node?.kind !== 'offset-face' || node.suppressed || node.held !== undefined ||
      node.parent.side !== 'solid' || node.parent.node >= index || node.faces.length !== 1 ||
      Object.keys(node.rematched ?? {}).length > 0 || (node.target !== undefined && node.distance !== undefined)) return false;
  const { document } = snapshot, { features, parameters } = document;
  const parent = exactSemicylinderCapSource(nodes, node.parent.node, doc.parameters);
  const [face] = node.faces;
  if (!parent?.faces.includes(face) ||
      !names.includes(`${parent.id}.normal`) || !names.includes(`${parent.id}.reverse`)) return false;

  const id = featureId(nodes, index), offsetIndex = features.findIndex(feature => feature.id === id);
  const offset = features[offsetIndex], parentIndex = features.findIndex(feature => feature.id === parent.id);
  const stock = features[parentIndex];
  if (offset?.kind !== 'offset-face' || offset.target !== parent.id || offset.face !== face ||
      stock?.kind !== 'thicken' || stock.mode !== 'exact-cylinder' || parentIndex >= offsetIndex) return false;
  const thickness = typeof stock.thickness === 'number' ? stock.thickness : parameters[stock.thickness.parameter];
  if (thickness !== parent.thickness) return false;

  try {
    const build = (part: CadPartSnapshot['document']) => reevaluate(snapshot, { document: part });
    // A reference can be consumed by a later feature. Check it at the Offset's original position.
    const distance = node.target
      ? resolveOffsetPlaneDistance(doc, node.target, node, features.slice(0, offsetIndex), build)
      : node.distance;
    if (distance !== offset.distance) return false;
    // An authored Thicken owns its entire surface and can be replayed independently.
    const { outputs: [original] } = build({ ...document, features: [stock] });
    if (original?.id !== parent.id || original.feature !== parent.id) return false;
    const surface = { ...structuredClone(stock.surface), kind: 'surface', id: 'surface' } as Surface;
    const expected = offsetExactSemicylinderCapIfAdmitted(original.brep, face,
      { id: parent.id, surface, thickness, side: stock.side }, offset.distance);
    return expected !== undefined && canonical(expected) === canonical(brep);
  } catch {
    return false;
  }
}
