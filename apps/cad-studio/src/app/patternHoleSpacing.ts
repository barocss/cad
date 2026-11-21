import { prepareLinearPatternHoleEdit as prepareLinear } from '@barocss/cad-model/app/patternHoleSpacing';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { prepareCircularPatternHolePivot } from './circularPatternHolePivot';

export function prepareLinearPatternHoleEdit(doc: StudioDoc, draft: ModelNode[], index: number) {
  return doc.nodes[index]?.kind === 'circular-pattern'
    ? prepareCircularPatternHolePivot(doc, draft, index)
    : prepareLinear(doc, draft, index);
}
