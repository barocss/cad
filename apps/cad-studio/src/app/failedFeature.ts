import { featureLabel, usesOf, type ModelNode } from '@barocss/cad-model/engine/doc';
import { featureId, nodeIndexOf } from '@barocss/cad-model/engine/ids';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

export type FeatureFailure = FriendlyError & { failedFeature?: string; historyField?: string };

export function linkedInsetHistoryFailure(error: FriendlyError, accepted: readonly ModelNode[], candidate: readonly ModelNode[], editIndex: number): FeatureFailure | undefined {
  const id = error.linkedInsetFeature;
  if (!id) return;
  const index = nodeIndexOf(accepted, id), sketch = accepted[index], next = candidate[index];
  if (sketch?.kind !== 'sketch' || !sketch.association || next?.kind !== 'sketch' || !next.association) return;
  const failedFeature = failedFeatureText(id, candidate, accepted);
  if (next.association.insetMM !== sketch.association.insetMM) {
    return { ...error, title: 'Linked inset distance is too large',
      hint: `Enter a smaller Linked inset distance for ${next.association.face} or reset this edit.`, failedFeature };
  }
  const { face, insetMM } = sketch.association;
  if (!isSourceDependency(accepted, sketch.association.source.node, editIndex)) return;
  return { ...error, title: 'The linked inset opening closes',
    hint: `The ${insetMM} mm inset on ${face} fails with the new source size. Increase the source dimension or reset this edit.`,
    failedFeature };
}

function isSourceDependency(nodes: readonly ModelNode[], source: number, edited: number): boolean {
  const pending = [source], seen = new Set<number>();
  for (const index of pending) {
    const node = nodes[index];
    if (!node || index < edited || seen.has(index)) continue;
    if (index === edited) return true;
    seen.add(index);
    pending.push(...usesOf(node, nodes));
  }
  return false;
}

/** Resolve a reported feature in the evaluated input and the command's accepted history. */
export function failedFeatureText(id: string | undefined, evaluated: readonly ModelNode[], history: readonly ModelNode[]): string | undefined {
  if (!id) return undefined;
  const evaluatedIndex = nodeIndexOf(evaluated, id), historyIndex = nodeIndexOf(history, id);
  const node = history[historyIndex];
  if (node && evaluated[evaluatedIndex]?.kind === node.kind && featureId(evaluated, evaluatedIndex) === featureId(history, historyIndex)) {
    return `${featureLabel(node, historyIndex, history)} (${id})`;
  }
  return `${id} · no matching history step`;
}

export function loftHistoryFailure(error: FeatureFailure, accepted: readonly ModelNode[], candidate: readonly ModelNode[], index: number): FeatureFailure | undefined {
  const before = accepted[index], after = candidate[index];
  if (before?.kind !== 'loft' || after?.kind !== 'loft' || error.feature !== featureId(candidate, index)) return;
  const vertex = /\bloft: guide must pass through a vertex of section (\d+)\b/.exec(error.detail);
  if (vertex) {
    const section = Number(vertex[1]);
    if (section >= after.sections.length) return;
    const label = `Section ${section + 1}`;
    const changedSource = before.from?.[section] !== after.from?.[section];
    const changedProfile = accepted[before.sections[section]?.sketch] !== candidate[after.sections[section].sketch];
    const action = changedSource ? `In ${label} source, choose another sketch or select Reset.`
      : changedProfile ? `Check the dimensions of ${label} or select Reset.`
      : 'In Guide (copied), choose another guide or select Reset.';
    return { ...error, title: `The Loft guide misses ${label}`, hint: `The guide must pass through a vertex of ${label}. ${action}`, detail: '',
      historyField: changedSource ? `loftSource${section}` : changedProfile ? undefined : 'loftGuide' };
  }
  const reason = error.detail.match(/guide (?:must (?:start on the bottom section|end on the top section)[^\n]*|endpoints must exactly match[^\n]*)/i)?.[0];
  if (!reason) return;
  const changedSection = JSON.stringify(before.from) !== JSON.stringify(after.from);
  return { ...error, title: 'Loft guide does not meet the sections',
    hint: `${reason[0].toUpperCase()}${reason.slice(1)}. Choose another ${changedSection ? 'section' : 'guide'} or reset the edit.`, detail: '' };
}

/** Explain failures of this edge finish without applying its advice to an upstream feature. */
export function edgeFinishFailure(error: FriendlyError, feature: ModelNode | undefined): FeatureFailure {
  if (!feature || !error.feature || error.feature !== feature.id) return error;
  if (feature.kind === 'fillet' && error.code === 'CAPABILITY'
    && (feature.section?.kind === 'conic' || feature.section?.kind === 'g2')) {
    const corner = /^edge ([^\r\n]+): a (conic|G2) fillet where the ball rolls round an edge at a corner is not supported yet$/.exec(error.detail);
    if (corner?.[0] === error.detail && feature.edges.includes(corner[1])
      && corner[2] === (feature.section.kind === 'conic' ? 'conic' : 'G2')) {
      return { ...error, title: 'This section cannot turn this corner',
        hint: 'Try Circular with the same picked edges.', historyField: 'shape' };
    }
  }
  if (feature.kind === 'fillet' && error.code === 'GEOMETRY'
    && /^B-rep: analytic Boolean: the result is not a manifold solid\b/.test(error.detail)) {
    return { ...error, title: 'The fillet could not make a solid', hint: 'Pick another edge for this fillet.' };
  }
  if (feature.kind === 'chamfer' && error.code === 'CAPABILITY'
    && /^edge .+: chamfers between general faces are not supported yet$/.test(error.detail)) {
    return { ...error, title: 'The chamfer does not support these faces',
      hint: 'Pick an edge between two flat faces, or a circular rim where a flat face meets a cylinder at a right angle.' };
  }
  return error;
}

/** Recovery belongs to the upstream Split editor, not to the unchanged downstream Hole. */
export function splitDependentHoleFailure(error: FeatureFailure, accepted: readonly ModelNode[], candidate: readonly ModelNode[], index: number): FeatureFailure | undefined {
  const before = accepted[index], after = candidate[index];
  if (before?.kind !== 'split' || after?.kind !== 'split' || before.id !== after.id
    || !error.feature || !/misses the target/i.test(error.detail)
    || accepted.length !== candidate.length || accepted.some((node, i) => i !== index && node !== candidate[i])) return;
  const failed = nodeIndexOf(candidate, error.feature);
  if (failed <= index || candidate[failed]?.kind !== 'hole' || !isSourceDependency(candidate, failed, index)) return;
  return { ...error, hint: 'Restore the previous Split At or Normal, or select Reset. To move the Hole centre, close this edit first and edit that Hole in History.' };
}
