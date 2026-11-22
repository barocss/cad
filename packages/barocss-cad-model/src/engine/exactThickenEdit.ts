import { reevaluate, type Brep, type CadPartSnapshot, type Surface } from '@barocss/cad';
import { offsetExactSemicylinderCapIfAdmitted, offsetExactSemicylinderMixedOffsetIfAdmitted, offsetExactSemicylinderSecondWallIfAdmitted, offsetExactSemicylinderWallAfterReplacementIfAdmitted, offsetExactSemicylinderWallIfAdmitted, replaceExactSemicylinderCapAfterWallIfAdmitted, replaceExactSemicylinderCapIfAdmitted } from '@barocss/cad/internal/exact-cylinder-cap-offset';
import { canonical } from '../util/revision';
import { exactSemicylinderCapAfterWall, exactSemicylinderCapSource, exactSemicylinderSecondOffset, exactSemicylinderWallAfterReplacement, radialBoreDeleteFaces, type StudioDoc } from './doc';
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
  const [face] = node.faces;
  const second = node.kind === 'offset-face' && node.target === undefined
    ? exactSemicylinderSecondOffset(nodes, node.parent.node, doc.parameters, face) : undefined;
  const beforeWall = node.kind === 'replace-face' ? exactSemicylinderCapAfterWall(nodes, node.parent.node, doc.parameters, face) : undefined;
  const beforeReplace = node.kind === 'offset-face' && node.target === undefined
    ? exactSemicylinderWallAfterReplacement(nodes, node.parent.node, doc.parameters, face) : undefined;
  const parent = second?.source ?? beforeWall?.source ?? beforeReplace?.source ?? exactSemicylinderCapSource(nodes, node.parent.node, doc.parameters);
  if (!parent || !parent.skins.every(name => names.includes(name))) return false;
  const radial = node.kind === 'offset-face' && node.target === undefined && parent.skins.includes(face);
  if (!radial && !parent.faces.includes(face)) return false;

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
    const priorIndex = prefix.findIndex(feature => feature.id === target), first = prefix[priorIndex];
    const replayOffset = (prior: { face: string; distance: number }, kind: 'cylinder' | 'plane') => {
      if (first?.kind !== 'offset-face' || first.target !== parent.id || first.face !== prior.face || first.distance !== prior.distance) return;
      const offset = kind === 'cylinder' ? offsetExactSemicylinderWallIfAdmitted : offsetExactSemicylinderCapIfAdmitted;
      return offset(original.brep, prior.face, source, prior.distance);
    };
    let expected: Brep | undefined;
    if (node.kind === 'replace-face' && edit.kind === 'replace-face') {
      const plane = resolveReplacementPlane(doc, node, prefix, build);
      if (canonical(plane) !== canonical(edit.plane)) return false;
      if (beforeWall) {
        const before = replayOffset(beforeWall.prior, 'cylinder');
        if (!before) return false;
        expected = replaceExactSemicylinderCapAfterWallIfAdmitted(before, face, source, beforeWall.prior, plane);
      } else {
        expected = replaceExactSemicylinderCapIfAdmitted(original.brep, face, source, plane);
      }
    } else if (node.kind === 'offset-face' && edit.kind === 'offset-face') {
      const distance = node.target ? resolveOffsetPlaneDistance(doc, node.target, node, prefix, build) : node.distance;
      if (distance !== edit.distance) return false;
      if (second) {
        const { prior } = second;
        const before = replayOffset(prior, second.priorKind);
        if (!before) return false;
        const apply = second.mixed ? offsetExactSemicylinderMixedOffsetIfAdmitted : offsetExactSemicylinderSecondWallIfAdmitted;
        expected = apply(before, face, source, prior, edit.distance);
      } else if (beforeReplace) {
        const priorFace = beforeReplace.prior.faces[0];
        if (first?.kind !== 'replace-face' || first.target !== parent.id || first.face !== priorFace) return false;
        const plane = resolveReplacementPlane(doc, beforeReplace.prior, prefix.slice(0, priorIndex), build);
        if (canonical(plane) !== canonical(first.plane)) return false;
        const before = replaceExactSemicylinderCapIfAdmitted(original.brep, priorFace, source, plane);
        if (!before) return false;
        expected = offsetExactSemicylinderWallAfterReplacementIfAdmitted(before, face, source, { face: priorFace, plane }, edit.distance);
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

/** Verify the certified bore repair against a replay of its current, uncut native stock. */
export function isExactThickenBoreHeal(doc: StudioDoc, snapshot: CadPartSnapshot, index: number, brep: Brep,
  names: readonly [string, string]): boolean {
  const { nodes } = doc, heal = nodes[index];
  if (heal?.kind !== 'delete-face' || heal.suppressed || heal.held !== undefined || heal.parent.side !== 'solid' ||
      heal.parent.node >= index || heal.faces.length !== 1 || Object.keys(heal.rematched ?? {}).length > 0) return false;
  const cutIndex = heal.parent.node, cut = nodes[cutIndex], [face] = heal.faces;
  if (cut?.kind !== 'difference' ||
      !radialBoreDeleteFaces(nodes, cutIndex, doc.parameters)?.some(name => name === face)) return false;

  const healId = featureId(nodes, index), cutId = featureId(nodes, cutIndex), stockId = featureId(nodes, cut.parent.node);
  const { features } = snapshot.document;
  const nativeHeal = features.find(feature => feature.id === healId), nativeCut = features.find(feature => feature.id === cutId);
  if (nativeHeal?.kind !== 'delete-face' || nativeHeal.target !== cutId || nativeHeal.face !== face ||
      nativeCut?.kind !== 'difference' || nativeCut.target !== stockId || nativeCut.tool !== featureId(nodes, cut.tool.node)) return false;
  return isExactThickenEdit(doc, snapshot, cut.parent.node, brep, names);
}
