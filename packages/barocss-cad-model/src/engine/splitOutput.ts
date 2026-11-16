import type { ModelNode } from './doc';
import { refusal } from './refusal';
export type SplitOutputSide = 'negative' | 'positive';
export function splitOutputSide(value: unknown): SplitOutputSide | undefined {
  if (value === undefined || value === 'both') return undefined;
  if (value === 'negative' || value === 'positive') return value;
  throw refusal('VALUE', 'Split output side must be Both, Negative or Positive.');
}
/** The kernel still builds both halves. No later feature may recover an excluded half. */
export function splitOutputNodesProblem(nodes: readonly unknown[]): string | null {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const excluded = new Map<number, string>();
  for (const [i, node] of nodes.entries()) if (record(node) && node.kind === 'split' && node.outputSide !== undefined) {
    if (node.outputSide !== 'negative' && node.outputSide !== 'positive') return 'Split: invalid saved output side.';
    excluded.set(i, node.outputSide === 'negative' ? 'positive' : 'negative');
  }
  if (!excluded.size) return null;
  for (const [i, node] of nodes.entries()) {
    const pending: unknown[] = [node], seen = new Set<object>();
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      if (record(value) && typeof value.node === 'number' && value.node < i && excluded.get(value.node) === value.side)
        return `Split: feature ${i + 1} references an excluded output side. Restore Both before using that side.`;
      pending.push(...Object.values(value));
    }
  }
  return null;
}
export function splitOutputDocumentProblem(input: unknown): string | null {
  const pending: unknown[] = [input], seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const doc = value as Record<string, unknown>;
    if (Array.isArray(doc.nodes)) { const problem = splitOutputNodesProblem(doc.nodes); if (problem) return problem; }
    if (Array.isArray(doc.instances)) for (const part of doc.instances) if (part && typeof part === 'object') pending.push(part.doc);
    if (doc.pendingParts && typeof doc.pendingParts === 'object') for (const part of Object.values(doc.pendingParts)) if (part && typeof part === 'object' && 'doc' in part) pending.push(part.doc);
  }
  return null;
}
export function setSplitOutputSide(nodes: readonly ModelNode[], index: number, value: unknown): ModelNode[] {
  const side = splitOutputSide(value), node = nodes[index];
  if (node?.kind !== 'split') return [...nodes];
  if (side === node.outputSide) return [...nodes];
  if (index !== nodes.length - 1) throw refusal('BAD_REFERENCE', 'Split output side can only change on the last History feature. Keep existing downstream references unchanged.');
  const next = { ...node }; if (side) next.outputSide = side; else delete next.outputSide;
  return nodes.map((n, i) => i === index ? next : n);
}
