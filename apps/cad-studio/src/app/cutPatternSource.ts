import { refOf, selectedBodies, type Ctx } from '@barocss/cad-model/app/commands';
import type { BodyRef, ModelNode } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';

const cutPatterns = new Set(['linear-feature-pattern', 'rectangular-feature-pattern', 'fill-feature-pattern', 'curve-feature-pattern']);

export function isCutPattern(kind: string): boolean {
  return cutPatterns.has(kind);
}

export function selectedCutPatternSource(ctx: Ctx): number | null {
  const indices = selectedBodies(ctx.selection);
  if (indices.length !== 1 || !ctx.bodies[indices[0]]) return null;
  const ref = refOf(ctx.bodies[indices[0]]);
  return ref.side === 'solid' && ctx.doc.nodes[ref.node]?.kind === 'difference' ? ref.node : null;
}

/** Preserve the explicit earlier source while the selected body stays the current target. */
export function earlierRectangularCutSource(ctx: Ctx, index: number): BodyRef | undefined {
  const target = selectedCutPatternSource(ctx);
  const current = target === null ? undefined : ctx.doc.nodes[target], source = ctx.doc.nodes[index];
  if (current?.kind !== 'difference' || current.suppressed || source?.kind !== 'difference' || source.suppressed
    || current.parent.node !== index || current.parent.side !== 'solid') return;
  return { node: index, side: 'solid' };
}

export function savedCutPatternSource(node: ModelNode, nodes: readonly ModelNode[]): string | null {
  if (!isCutPattern(node.kind) || !('parent' in node)) return null;
  const earlier = (node.kind === 'rectangular-feature-pattern' || node.kind === 'linear-feature-pattern') && node.source;
  return cutPatternSourceLabel(nodes, earlier ? earlier.node : node.parent.node);
}

export function cutPatternSourceLabel(nodes: readonly ModelNode[], index: number | null): string | null {
  if (index === null || nodes[index]?.kind !== 'difference') return null;
  const ordinal = nodes.slice(0, index + 1).filter(node => node.kind === 'difference').length;
  return `Subtract ${ordinal} (${featureId(nodes, index)})`;
}
