import { reevaluate, type Brep, type CadPartSnapshot, type Surface } from '@barocss/cad';
import { offsetExactSemicylinderCapIfAdmitted, offsetExactSemicylinderSecondWallIfAdmitted, offsetExactSemicylinderWallIfAdmitted, replaceExactSemicylinderCapIfAdmitted } from '@barocss/cad/internal/exact-cylinder-cap-offset';
import { canonical } from '../util/revision';
import { exactSemicylinderCapSource, exactSemicylinderFirstWallOffset, type StudioDoc } from './doc';
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
  const first = exactSemicylinderFirstWallOffset(nodes, node.parent.node, doc.parameters);
  const parent = first?.source ?? exactSemicylinderCapSource(nodes, node.parent.node, doc.parameters);
  const [face] = node.faces;
  if (!parent || !parent.skins.every(name => names.includes(name))) return false;
  const radial = node.kind === 'offset-face' && node.target === undefined && parent.skins.includes(face);
  if (first ? (!radial || first.otherFace !== face) : (!radial && !parent.faces.includes(face))) return false;

  const id = featureId(nodes, index), editIndex = features.findIndex(feature => feature.id === id);
  const target = featureId(nodes, node.parent.node);
  const edit = features[editIndex], parentIndex = features.findIndex(feature => feature.id === parent.id);
  const stock = features[parentIndex];
  if ((edit?.kind !== 'offset-face' && edit?.kind !== 'replace-face') || edit.kind !== node.kind ||
      edit.target !== target || edit.face !== face || stock?.kind !== 'thicken' || stock.mode !== 'exact-cylinder' ||
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
      if (first) {
        const nativeFirst = prefix.find(feature => feature.id === target);
        if (nativeFirst?.kind !== 'offset-face' || nativeFirst.target !== parent.id ||
            nativeFirst.face !== first.prior.face || nativeFirst.distance !== first.prior.distance) return false;
        const before = offsetExactSemicylinderWallIfAdmitted(original.brep, first.prior.face, source, first.prior.distance);
        if (!before) return false;
        expected = offsetExactSemicylinderSecondWallIfAdmitted(before, face, source, first.prior, edit.distance);
      } else {
        const offset = radial ? offsetExactSemicylinderWallIfAdmitted : offsetExactSemicylinderCapIfAdmitted;
        expected = offset(original.brep, face, source, edit.distance);
      }
    }
    return expected !== undefined && canonical(expected) === canonical(brep);
  } catch {
    return false;
  }
}
