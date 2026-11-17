import type { StudioDoc } from './doc';

/** Authored uses of an ancestor's row, excluding branches that own a same-ID row.
 * No derived shop view is persisted; hidden/suppressed uses stay protected. */
export function inheritedRowUsed(doc: StudioDoc, id: string, localUse: (doc: StudioDoc, id: string) => boolean, owns: (doc: StudioDoc, id: string) => boolean): boolean {
  const seen = new Set<StudioDoc>();
  const visit = (current: StudioDoc): boolean => {
    if (seen.has(current)) return false;
    seen.add(current);
    return localUse(current, id) || (current.instances ?? []).some(i => !owns(i.doc, id) && visit(i.doc));
  };
  return visit(doc);
}
