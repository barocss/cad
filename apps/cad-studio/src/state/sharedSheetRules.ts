import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';

/** Only an exact current terminal contour output owns these shared rules. Never derive it from bend names. */
export function sharedSheetRuleOwner(doc: StudioDoc, evaluated: StudioDoc, body: BodyResult) {
  const ref = body.ref, output = evaluated.outputs[body.key], source = doc.outputs[body.key];
  if (!ref || ref.side !== 'solid' || !output || !source || !body.flat || !body.sheet
    || output.node !== ref.node || output.side !== ref.side || source.node !== ref.node || source.side !== ref.side
    || ref.node !== doc.nodes.length - 1 || evaluated.nodes.length !== doc.nodes.length || doc.instances?.length) return null;
  const node = doc.nodes[ref.node];
  return node?.kind === 'sheet-contour' && !node.suppressed && evaluated.nodes[ref.node] === node ? { index: ref.node, node } : null;
}

export interface SheetRuleSource {
  doc: StudioDoc; evaluated: StudioDoc; bodies: readonly BodyResult[];
  open: object; worker: number; generation: object; available: boolean;
}
/** The same guard runs at click time and after any deferred History draft decision. Selection is not ownership. */
export function sameSheetRuleSource(source: SheetRuleSource, current: SheetRuleSource, body: BodyResult): boolean {
  return source.doc === current.doc && source.evaluated === current.evaluated
    && source.open === current.open && source.worker === current.worker && source.generation === current.generation
    && source.bodies.includes(body) && current.bodies.includes(body);
}
export function ownsSharedSheetRules(source: SheetRuleSource, current: SheetRuleSource, body: BodyResult): boolean {
  return source.available && current.available && sameSheetRuleSource(source, current, body)
    && !!sharedSheetRuleOwner(current.doc, current.evaluated, body);
}
