import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { geometryOf, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import { affectedCurveFeaturePatterns, curveFeaturePatternProblem, curvePatternDocumentProblem, resolveCurveFeaturePatternPath } from '@barocss/cad-model/engine/curveFeaturePattern';
export { curvePatternDocumentProblem } from '@barocss/cad-model/engine/curveFeaturePattern';

/** Only consumed path geometry in the displayed history changes the model input. */
export function curvePatternInputKey(doc: StudioDoc, marker = doc.nodes.length): string {
  const paths = [];
  for (let i = 0; i < marker && i < doc.nodes.length; i++) {
    const node = doc.nodes[i];
    if (node.kind === 'curve-feature-pattern' && !node.suppressed && 'objectId' in node.path) paths.push([node.path.objectId, resolveCurveFeaturePatternPath(doc, node.path)]);
  }
  return JSON.stringify(paths);
}

/** Commands see newly authored direct sources even when the evaluated model stays the same. */
export function directCommandDocument(evaluated: StudioDoc, shown: Pick<StudioDoc, 'direct'>): StudioDoc {
  return evaluated.direct === shown.direct ? evaluated : { ...evaluated, direct: shown.direct };
}

/** An explicit single-curve Stretch from the Direct Panel; never persisted in a document. */
export type DirectCurveEdit = { kind: 'stretch'; objectId: string };
const exactSpanRefusal = '[VALUE] Path cut pattern: each quadratic middle point must be the exact endpoint midpoint.';

function linkedStretchHint(before: StudioDoc, direct: DirectGeometry, problem: string, edit?: DirectCurveEdit): string | undefined {
  if (edit?.kind !== 'stretch' || problem !== exactSpanRefusal || !before.direct) return;
  const {objectId}=edit;
  const old = before.direct.objects.find(o=>o.id===objectId), changed=direct.objects.find(o=>o.id===objectId);
  if (!old || !changed || old===changed || old.source===changed.source ||
      before.direct.objects.length!==direct.objects.length ||
      before.direct.objects.some((o,i)=>o.id!==direct.objects[i]?.id || (o.id!==objectId && o!==direct.objects[i]))) return;
  const uses=before.nodes.flatMap((node,index)=>node.kind==='curve-feature-pattern' && !node.suppressed && node.held===undefined &&
    'objectId' in node.path && node.path.objectId===objectId ? [{node,index}] : []);
  if (uses.length!==1 || !Object.values(before.outputs).some(ref=>ref.node===uses[0].index && ref.side==='solid')) return;
  try {
    const a=geometryOf(before.direct,old), b=geometryOf(direct,changed), {node,index}=uses[0];
    if (a.kind!=='curve' || b.kind!=='curve' || a.degree!==2 || b.degree!==2 ||
        a.controlPoints.length<5 || a.controlPoints.length!==b.controlPoints.length ||
        curveFeaturePatternProblem(node,before.nodes.slice(0,index),before.parameters,before)!==null ||
        curveFeaturePatternProblem(node,before.nodes.slice(0,index),before.parameters,{direct})!==exactSpanRefusal) return;
    return 'This stretch could not keep each span of the linked quadratic path exactly straight. The path and pattern are unchanged. Try a different stretch factor, or choose a straight-segment polyline in the pattern’s Path field.';
  } catch { return; }
}

/** The existing owned candidate lane evaluates a consumed path before accepting its direct source. */
export function prepareDirectCurveCandidate(before: StudioDoc, direct: DirectGeometry, edit?: DirectCurveEdit): { next: StudioDoc; input: StudioDoc } | null {
  const next = { ...before, direct };
  const problem = curvePatternDocumentProblem(next);
  if (problem) throw new Error(linkedStretchHint(before,direct,problem,edit) ?? problem);
  if (!affectedCurveFeaturePatterns(before, next).length) return null;
  return { next, input: prefixDoc(next, next.nodes.length) };
}

/** Edited CUT recipes use the same unaccepted Worker lane as a consumed direct path. */
export function preparePatternNodeCandidate(before: StudioDoc, next: StudioDoc, index: number): { next: StudioDoc; input: StudioDoc; failureTitle?: string } | null {
  const oldKind = before.nodes[index]?.kind, nextKind = next.nodes[index]?.kind;
  const fill = oldKind === 'fill-feature-pattern' || nextKind === 'fill-feature-pattern';
  if (!fill && oldKind !== 'curve-feature-pattern' && nextKind !== 'curve-feature-pattern') return null;
  return { next, input: prefixDoc(next, next.nodes.length), ...(fill ? { failureTitle: 'Fill cut pattern not changed' } : {}) };
}

/** Part insertion must check the placed context before its direct geometry is stripped. */
export function insertedCurvePartProblem(part: StudioDoc): string | null {
  return curvePatternDocumentProblem({ instances: [{ doc: part }] });
}
