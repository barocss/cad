import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import type { HeldFilletBoxGroup } from '@barocss/cad-model/engine/heldFilletBoxCompanion';
import { replaceHeldFinishGroup } from './heldFinishReplacement';

export function replaceFilletBesideBox(scope: HeldFilletBoxGroup, picks: readonly (DisplayEdge | undefined)[]): StudioDoc | null {
  const replacement = replaceHeldFinishGroup(scope.prefix, 2, scope.group, scope.fillet, picks);
  if (!replacement) return null;
  return { ...scope.doc, nodes: scope.doc.nodes.map((node, i) => i === 2 ? replacement.nodes[i] : node) };
}
