import { emptyDoc, withNode, type StudioDoc } from './doc';
import { stepLengthUnit } from './stepUnits';
import { MM_PER_INCH } from '../util/units';

export function editableStepSourceShape(doc: StudioDoc) {
  const [node, scale] = doc.nodes;
  if (node?.kind !== 'import' || node.suppressed || node.held || (node.solids ?? 1) !== 1 || doc.instances?.length)
    return;
  if (doc.nodes.length === 1) return 'raw';
  if (doc.nodes.length === 2 && scale?.kind === 'scale' && !scale.suppressed && !scale.held
    && scale.parent.node === 0 && scale.parent.side === 'solid'
    && scale.pivot?.length === 3 && scale.pivot.every(value => value === 0))
    return scale.factor === 10 ? 'cm' : scale.factor === MM_PER_INCH ? 'in' : undefined;
}

/** Match Studio Open's conversion for the supported alternate profiles. */
export function editableStepSource(name: string, step: string): StudioDoc {
  const source = withNode(emptyDoc(), { kind: 'import', name, step });
  try {
    const { to } = stepLengthUnit(step);
    if (to === 10 || to === MM_PER_INCH)
      return withNode(source, { kind: 'scale', parent: { node: 0, side: 'solid' }, factor: to, pivot: [0, 0, 0] });
  } catch { /* The copy check reports unsupported units. */ }
  return source;
}
