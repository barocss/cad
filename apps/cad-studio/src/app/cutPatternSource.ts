import { refOf, selectedBodies, type Ctx } from '@barocss/cad-model/app/commands';
import { rectangularFeaturePatternSourceProblem, type BodyRef, type ModelNode } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';

export function isCutPattern(kind: string): boolean {
  return kind === 'linear-feature-pattern' || kind === 'rectangular-feature-pattern' || kind === 'fill-feature-pattern' || kind === 'curve-feature-pattern';
}

export function selectedCutPatternSource(ctx: Ctx): number | null {
  const indices = selectedBodies(ctx.selection);
  if (indices.length !== 1 || !ctx.bodies[indices[0]]) return null;
  const ref = refOf(ctx.bodies[indices[0]]);
  return ref.side === 'solid' && ctx.doc.nodes[ref.node]?.kind === 'difference' ? ref.node : null;
}

/** Preserve the explicit earlier source while the selected body stays the current target. */
export function earlierRectangularCutSource(ctx: Ctx, command: string, index: number): BodyRef | undefined {
  if (!isCutPattern(command)) return;
  const target = selectedCutPatternSource(ctx);
  if (target === null) return;
  const parent: BodyRef = { node: target, side: 'solid' }, source: BodyRef = { node: index, side: 'solid' };
  if (!rectangularFeaturePatternSourceProblem(source, parent, ctx.doc.nodes)) return source;
}

export function savedCutPatternSource(node: ModelNode, nodes: readonly ModelNode[]): string | null {
  switch (node.kind) {
    case 'linear-feature-pattern':
    case 'rectangular-feature-pattern':
    case 'fill-feature-pattern':
    case 'curve-feature-pattern':
      return cutPatternSourceLabel(nodes, (node.source ?? node.parent).node);
    default:
      return null;
  }
}

export function cutPatternSourceLabel(nodes: readonly ModelNode[], index: number | null): string | null {
  if (index === null || nodes[index]?.kind !== 'difference') return null;
  const ordinal = nodes.slice(0, index + 1).filter(node => node.kind === 'difference').length;
  return `Subtract ${ordinal} (${featureId(nodes, index)})`;
}
