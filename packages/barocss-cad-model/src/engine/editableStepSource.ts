import { emptyDoc, withNode, type StudioDoc } from './doc';
import { stepLengthUnit } from './stepUnits';

export function editableStepSourceShape(doc: StudioDoc) {
  const [node, scale] = doc.nodes;
  if (node?.kind !== 'import' || node.suppressed || node.held || (node.solids ?? 1) !== 1 || doc.instances?.length)
    return;
  if (doc.nodes.length === 1) return 'raw';
  if (doc.nodes.length === 2 && scale?.kind === 'scale' && !scale.suppressed && !scale.held
    && scale.parent.node === 0 && scale.parent.side === 'solid' && scale.factor === 10
    && scale.pivot?.length === 3 && scale.pivot.every(value => value === 0)) return 'centimetres';
}

/** Match Studio Open's conversion for the one new alternate profile. */
export function editableStepSource(name: string, step: string): StudioDoc {
  const source = withNode(emptyDoc(), { kind: 'import', name, step });
  try {
    if (stepLengthUnit(step).to === 10)
      return withNode(source, { kind: 'scale', parent: { node: 0, side: 'solid' }, factor: 10, pivot: [0, 0, 0] });
  } catch { /* The copy check reports unsupported units. */ }
  return source;
}
