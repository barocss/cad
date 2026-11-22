import { reevaluate, type Brep, type CadPartSnapshot, type Surface } from '@barocss/cad';
import { offsetExactSemicylinderCapIfAdmitted } from '@barocss/cad/internal/exact-cylinder-cap-offset';
import { canonical } from '../util/revision';
import { exactSemicylinderCapSource, type StudioDoc } from './doc';
import { featureId } from './ids';

/** Bind the current two skin names to a replay of the original native upper-cap operation. */
export function isUpperThickenCapOffset(doc: StudioDoc, snapshot: CadPartSnapshot, index: number, brep: Brep,
  names: readonly [string, string]): boolean {
  const { nodes } = doc, node = nodes[index];
  if (node?.kind !== 'offset-face' || node.suppressed || node.held !== undefined || node.target !== undefined ||
      node.parent.side !== 'solid' || node.parent.node >= index || node.faces.length !== 1 || node.distance === undefined ||
      Object.keys(node.rematched ?? {}).length > 0) return false;
  const { document } = snapshot, { features, parameters } = document;
  const parent = exactSemicylinderCapSource(nodes, node.parent.node, doc.parameters);
  if (!parent || node.faces[0] !== parent.face ||
      !names.includes(`${parent.id}.normal`) || !names.includes(`${parent.id}.reverse`)) return false;

  const id = featureId(nodes, index), offsetIndex = features.findIndex(feature => feature.id === id);
  const offset = features[offsetIndex], parentIndex = features.findIndex(feature => feature.id === parent.id);
  const stock = features[parentIndex];
  if (offset?.kind !== 'offset-face' || offset.target !== parent.id || offset.face !== parent.face || offset.distance !== node.distance ||
      stock?.kind !== 'thicken' || stock.mode !== 'exact-cylinder' || parentIndex >= offsetIndex) return false;
  const thickness = typeof stock.thickness === 'number' ? stock.thickness : parameters[stock.thickness.parameter];
  if (thickness !== parent.thickness) return false;

  // An authored Thicken owns its entire surface. Replay that feature alone with the current resolved parameters.
  try {
    const { outputs: [original] } = reevaluate(snapshot, { document: { ...document, features: [stock] } });
    if (original?.id !== parent.id || original.feature !== parent.id) return false;
    const surface = { ...structuredClone(stock.surface), kind: 'surface', id: 'surface' } as Surface;
    const expected = offsetExactSemicylinderCapIfAdmitted(original.brep, parent.face,
      { id: parent.id, surface, thickness, side: stock.side }, offset.distance);
    return expected !== undefined && canonical(expected) === canonical(brep);
  } catch {
    return false;
  }
}
